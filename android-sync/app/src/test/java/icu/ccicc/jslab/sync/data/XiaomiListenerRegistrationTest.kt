package icu.ccicc.jslab.sync.data

import com.xiaomi.xms.wearable.tasks.OnFailureListener
import com.xiaomi.xms.wearable.tasks.OnSuccessListener
import com.xiaomi.xms.wearable.tasks.Task
import java.util.concurrent.Executor
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class XiaomiListenerRegistrationTest {
    @Test fun `retry waits for a late registration and its removal after cancellation`() = runTest {
        val adding = PendingTask()
        val removing = PendingTask()
        var removals = 0
        val registration = XiaomiListenerRegistration(adding) { removals++; removing }
        val firstWaiter = launch { registration.remove().await() }
        runCurrent()
        firstWaiter.cancelAndJoin()

        val retry = launch { registration.remove().await() }
        runCurrent()
        assertEquals(0, removals)
        assertFalse(retry.isCompleted)

        adding.finish()
        runCurrent()
        assertEquals(1, removals)
        assertFalse(retry.isCompleted)
        removing.finish()
        retry.join()
    }

    @Test fun `failed removal is reported and retried on the next attempt`() = runTest {
        val adding = PendingTask().apply { finish() }
        val removals = mutableListOf<PendingTask>()
        val registration = XiaomiListenerRegistration(adding) { PendingTask().also(removals::add) }
        val first = registration.remove()
        removals.single().finish(IllegalStateException("unregisterMessageListener failed"))
        assertEquals("小米互联组件错误：unregisterMessageListener failed", runCatching { first.await() }.exceptionOrNull()?.message)

        val retry = registration.remove()
        assertEquals(2, removals.size)
        assertFalse(retry.isCompleted)
        removals.last().finish(IllegalStateException("you have not registered"))
        retry.await()
    }

    @Test fun `a rejected registration does not remove someone else's listener`() = runTest {
        val adding = PendingTask()
        val registration = XiaomiListenerRegistration(adding) { error("registration did not succeed") }
        val cleanup = registration.remove()
        adding.finish(IllegalStateException("you have registered"))
        cleanup.await()
    }

    private class PendingTask : Task<Void>() {
        private var complete = false
        private var failure: Exception? = null
        private val callbacks = mutableListOf<() -> Unit>()

        fun finish(error: Exception? = null) {
            check(!complete)
            complete = true
            failure = error
            callbacks.forEach { it() }
            callbacks.clear()
        }

        private fun onComplete(callback: () -> Unit): Task<Void> {
            if (complete) callback() else callbacks += callback
            return this
        }

        override fun isComplete() = complete
        override fun isSuccessful() = complete && failure == null
        override fun isCanceled() = false
        override fun getResult(): Void? = null
        override fun <X : Throwable> getResult(exceptionType: Class<X>): Void? = null
        override fun getException(): Exception? = failure
        override fun addOnSuccessListener(listener: OnSuccessListener<in Void>): Task<Void> =
            onComplete { if (isSuccessful) listener.onSuccess(null) }
        override fun addOnFailureListener(listener: OnFailureListener): Task<Void> =
            onComplete { failure?.let(listener::onFailure) }
        override fun addOnSuccessListener(executor: Executor, listener: OnSuccessListener<in Void>): Task<Void> =
            addOnSuccessListener { executor.execute { listener.onSuccess(it) } }
        override fun addOnFailureListener(executor: Executor, listener: OnFailureListener): Task<Void> =
            addOnFailureListener { executor.execute { listener.onFailure(it) } }
    }
}

package icu.ccicc.jslab.sync.data

import android.content.Context
import com.xiaomi.xms.wearable.Wearable
import com.xiaomi.xms.wearable.auth.Permission
import com.xiaomi.xms.wearable.message.OnMessageReceivedListener
import com.xiaomi.xms.wearable.node.DataItem
import com.xiaomi.xms.wearable.node.DataSubscribeResult
import com.xiaomi.xms.wearable.node.OnDataChangedListener
import com.xiaomi.xms.wearable.service.OnServiceConnectionListener
import com.xiaomi.xms.wearable.tasks.Task
import icu.ccicc.jslab.sync.protocol.WEAR_PACKAGE
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout

data class WearDevice(val id: String, val name: String)
sealed interface WearEvent {
    data object Available : WearEvent
    data class Message(val nodeId: String, val bytes: ByteArray) : WearEvent
    data class Lost(val nodeId: String?, val reason: String) : WearEvent
}

/** The official SDK binds to Mi Fitness. This app neither scans BLE nor owns pairing. */
class XiaomiTransport(context: Context, private val scope: CoroutineScope) {
    private companion object {
        // The SDK shares its listeners across transport instances in the same process.
        // Connection operations and these records are confined to the main thread.
        val pendingCleanup = mutableListOf<XiaomiListenerRegistration>()
    }

    private val nodeApi = Wearable.getNodeApi(context.applicationContext)
    private val messageApi = Wearable.getMessageApi(context.applicationContext)
    private val authApi = Wearable.getAuthApi(context.applicationContext)
    private val serviceApi = Wearable.getServiceApi(context.applicationContext)
    private val mutableEvents = MutableSharedFlow<WearEvent>(extraBufferCapacity = 64)
    val events = mutableEvents.asSharedFlow()
    @Volatile private var active: String? = null
    private var generation = 0L
    private val registrations = mutableListOf<XiaomiListenerRegistration>()
    private val serviceListener = object : OnServiceConnectionListener {
        override fun onServiceConnected() { emit(WearEvent.Available) }
        override fun onServiceDisconnected() {
            emit(WearEvent.Lost(null, "与小米运动健康的连接已断开"))
        }
    }
    private val messageListener = OnMessageReceivedListener { nodeId, bytes ->
        if (nodeId == active) emit(WearEvent.Message(nodeId, bytes.copyOf()))
    }
    private val connectionListener = OnDataChangedListener { id, item, result ->
        if (id == active && item.type == DataItem.ITEM_CONNECTION.type) {
            if (result.connectedStatus == DataSubscribeResult.RESULT_CONNECTION_CONNECTED) emit(WearEvent.Available)
            else emit(WearEvent.Lost(id, "穿戴设备已断开连接"))
        }
    }

    init { serviceApi.registerServiceConnectionListener(serviceListener) }
    private fun emit(event: WearEvent) { scope.launch { mutableEvents.emit(event) } }

    suspend fun devices(): List<WearDevice> = withTimeout(15_000) {
        nodeApi.connectedNodes.await().map { WearDevice(it.id, it.name ?: "Xiaomi 穿戴设备") }
    }

    suspend fun connect(device: WearDevice) = withTimeout(20_000) {
        disconnect()
        val attempt = generation
        val id = device.id
        try {
            for (registration in pendingCleanup.toList()) {
                registration.remove().await()
                pendingCleanup.remove(registration)
            }
            check(attempt == generation) { "设备连接已断开" }
            if (authApi.checkPermission(id, Permission.DEVICE_MANAGER).await() != true) {
                check(attempt == generation) { "设备连接已断开" }
                val granted = authApi.requestPermission(id, Permission.DEVICE_MANAGER).await()
                require(granted.any { it.name == Permission.DEVICE_MANAGER.name }) { "请在小米运动健康中授予设备管理权限" }
            }
            require(nodeApi.isWearAppInstalled(id).await() == true) { "请先在穿戴设备上安装 JSLab，并确认两端签名一致" }
            check(attempt == generation) { "设备连接已断开" }
            active = id
            val message = messageApi.addListener(id, messageListener)
            registrations += XiaomiListenerRegistration(message) { messageApi.removeListener(id) }
            message.await()
            check(attempt == generation) { "设备连接已断开" }
            val connection = nodeApi.subscribe(id, DataItem.ITEM_CONNECTION, connectionListener)
            registrations += XiaomiListenerRegistration(connection) { nodeApi.unsubscribe(id, DataItem.ITEM_CONNECTION) }
            connection.await()
            check(attempt == generation) { "设备连接已断开" }
            nodeApi.launchWearApp(id, "hap://app/$WEAR_PACKAGE/pages/index").await()
            check(attempt == generation) { "设备连接已断开" }
        } catch (error: Exception) {
            if (attempt == generation) disconnect()
            throw error
        }
    }

    suspend fun launch() {
        val id = active ?: throw IOException("请先连接穿戴设备")
        withTimeout(15_000) { nodeApi.launchWearApp(id, "hap://app/$WEAR_PACKAGE/pages/index").await() }
    }

    suspend fun send(message: String) {
        val id = active ?: throw IOException("请先连接穿戴设备")
        withTimeout(15_000) { messageApi.sendMessage(id, message.toByteArray(Charsets.UTF_8)).await() }
    }

    fun disconnect() {
        generation++
        active = null
        for (registration in registrations) {
            pendingCleanup += registration
            registration.remove().invokeOnCompletion { error ->
                if (error == null) pendingCleanup.remove(registration)
            }
        }
        registrations.clear()
    }

    fun close() {
        disconnect()
        serviceApi.unregisterServiceConnectionListener(serviceListener)
    }
}

internal class XiaomiListenerRegistration(
    private val registration: Task<Void>,
    private val unregister: () -> Task<Void>,
) {
    private var cleanup: CompletableDeferred<Unit>? = null

    fun remove(): CompletableDeferred<Unit> {
        cleanup?.let { if (!it.isCancelled) return it }
        val completion = CompletableDeferred<Unit>()
        cleanup = completion
        // Cancelling the caller does not cancel the SDK Task. Wait for its result before removing.
        registration.addOnSuccessListener {
            try {
                val removal = unregister()
                removal.addOnSuccessListener { completion.complete(Unit) }
                removal.addOnFailureListener { error ->
                    if (error is IllegalStateException && error.message == "you have not registered") {
                        completion.complete(Unit)
                    } else {
                        completion.completeExceptionally(error.asXiaomiError())
                    }
                }
            } catch (error: Exception) {
                completion.completeExceptionally(error.asXiaomiError())
            }
        }
        registration.addOnFailureListener { completion.complete(Unit) }
        return completion
    }
}

private fun Exception.asXiaomiError(): IOException {
    val detail = when (message) {
        "you have registered" -> "消息监听已注册，请重试握手"
        null -> "未提供错误详情"
        else -> message
    }
    return IOException("小米互联组件错误：$detail", this)
}

private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
    addOnSuccessListener { if (continuation.isActive) continuation.resume(it) }
    addOnFailureListener {
        if (continuation.isActive) continuation.resumeWithException(it.asXiaomiError())
    }
}

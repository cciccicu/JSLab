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
    private val nodeApi = Wearable.getNodeApi(context.applicationContext)
    private val messageApi = Wearable.getMessageApi(context.applicationContext)
    private val authApi = Wearable.getAuthApi(context.applicationContext)
    private val serviceApi = Wearable.getServiceApi(context.applicationContext)
    private val mutableEvents = MutableSharedFlow<WearEvent>(extraBufferCapacity = 64)
    val events = mutableEvents.asSharedFlow()
    private var active: String? = null
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
        if (authApi.checkPermission(device.id, Permission.DEVICE_MANAGER).await() != true) {
            val granted = authApi.requestPermission(device.id, Permission.DEVICE_MANAGER).await()
            require(granted.any { it.name == Permission.DEVICE_MANAGER.name }) { "请在小米运动健康中授予设备管理权限" }
        }
        require(nodeApi.isWearAppInstalled(device.id).await() == true) { "请先在穿戴设备上安装 JSLab，并确认两端签名一致" }
        active = device.id
        try {
            messageApi.addListener(device.id, messageListener).await()
            nodeApi.subscribe(device.id, DataItem.ITEM_CONNECTION, connectionListener).await()
            nodeApi.launchWearApp(device.id, "hap://app/$WEAR_PACKAGE/pages/index").await()
        } catch (error: Exception) {
            disconnect()
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
        val id = active
        active = null
        if (id != null) {
            // The 1.4 AAR takes ONLY nodeId (the PDF still describes the older overload).
            runCatching { messageApi.removeListener(id) }
            runCatching { nodeApi.unsubscribe(id, DataItem.ITEM_CONNECTION) }
        }
    }

    fun close() {
        disconnect()
        serviceApi.unregisterServiceConnectionListener(serviceListener)
    }
}

private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
    addOnSuccessListener { if (continuation.isActive) continuation.resume(it) }
    addOnFailureListener { if (continuation.isActive) continuation.resumeWithException(it) }
}

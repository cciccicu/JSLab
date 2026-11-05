package icu.ccicc.jslab.sync.data

import android.content.Context
import icu.ccicc.jslab.sync.protocol.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import org.json.JSONObject

enum class ConnectionPhase { Disconnected, Connecting, Ready }
data class LinkState(
    val devices: List<WearDevice> = emptyList(),
    val device: WearDevice? = null,
    val phase: ConnectionPhase = ConnectionPhase.Disconnected,
    val files: List<ScriptFile> = emptyList(),
    val syncedAt: Long? = null,
    val scriptStorageSupported: Boolean = false,
)

class SyncRepository(context: Context, private val scope: CoroutineScope) : SyncSession {
    private val transport = XiaomiTransport(context, scope)
    private val rpc = RpcClient(transport::send)
    private val scripts = ScriptClient(rpc)
    private val scriptStorage = ScriptStorageClient(rpc)
    private val proxy = CloudProxy()
    private val mutableState = MutableStateFlow(LinkState())
    override val state = mutableState.asStateFlow()
    override val changes = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    override val errors = MutableSharedFlow<String>(extraBufferCapacity = 4)
    override val deviceChanges = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    override var proxyEnabled = true
    private var generation = 0L
    private var cloudSession = SupervisorJob(scope.coroutineContext[Job])
    private val cloudSlots = Semaphore(4)

    init {
        scope.launch {
            transport.events.collect { event ->
                when (event) {
                    WearEvent.Available -> deviceChanges.tryEmit(Unit)
                    is WearEvent.Lost -> {
                        if (mutableState.value.device != null && (event.nodeId == null || event.nodeId == mutableState.value.device?.id)) {
                            disconnect()
                            errors.emit(event.reason)
                            deviceChanges.tryEmit(Unit)
                        }
                    }
                    is WearEvent.Message -> {
                        if (event.nodeId == mutableState.value.device?.id) {
                            runCatching { handleMessage(JSONObject(decodeUtf8(event.bytes))) }
                                .onFailure { errors.tryEmit("收到无效的设备消息，请检查手环应用版本") }
                        }
                    }
                }
            }
        }
    }

    private fun handleMessage(message: JSONObject) {
        if (!message.isSyncEnvelope()) return
        when (message.optString("type")) {
            "response" -> rpc.receive(message)
            "event" -> if (message.optString("event") == "filesChanged") changes.tryEmit(Unit)
            "request" -> if (message.optString("action") == "cloudProxy") {
                val id = message.optString("id")
                if (id.isEmpty()) return
                val epoch = generation
                scope.launch(cloudSession) {
                    val response = try {
                        check(proxyEnabled) { "手机端已关闭云端转发" }
                        val result = cloudSlots.withPermit { proxy.forward(message.getJSONObject("payload")) }
                        json("v" to PROTOCOL_VERSION, "type" to "response", "id" to id, "ok" to true, "result" to result)
                    } catch (cancelled: CancellationException) { throw cancelled
                    } catch (error: Exception) {
                        json("v" to PROTOCOL_VERSION, "type" to "response", "id" to id, "ok" to false,
                            "error" to (error.message ?: "cloud_proxy_failed"))
                    }
                    if (epoch == generation) runCatching { transport.send(response.toString()) }
                }
            }
        }
    }

    override suspend fun discover() {
        val epoch = generation
        val devices = transport.devices()
        if (epoch == generation) mutableState.update { it.copy(devices = devices) }
    }

    override suspend fun connect(device: WearDevice) {
        disconnect()
        val epoch = generation
        mutableState.update { it.copy(device = device, phase = ConnectionPhase.Connecting) }
        try {
            transport.connect(device)
            // Match the plugin: allow Vela to start, then use the normal 15-second hello deadline.
            delay(2_000)
            val capabilities = scripts.hello()
            check(epoch == generation) { "设备连接已断开" }
            val files = scripts.list()
            check(epoch == generation) { "设备连接已断开" }
            mutableState.update { it.copy(phase = ConnectionPhase.Ready, files = files, syncedAt = System.currentTimeMillis(), scriptStorageSupported = capabilities.scriptStorageSupported) }
        } catch (error: Exception) {
            if (epoch == generation) disconnect()
            throw error
        }
    }

    private fun ready() { check(mutableState.value.phase == ConnectionPhase.Ready) { "请先连接穿戴设备" } }
    override suspend fun refresh() {
        ready()
        val epoch = generation
        val files = scripts.list()
        check(epoch == generation) { "设备连接已断开" }
        mutableState.update { it.copy(files = files, syncedAt = System.currentTimeMillis()) }
    }
    override suspend fun create(name: String) { ready(); scripts.create(name) }
    override suspend fun read(name: String, progress: (TransferProgress) -> Unit): String { ready(); return scripts.read(name, progress) }
    override suspend fun write(name: String, content: String, overwrite: Boolean, progress: (TransferProgress) -> Unit) {
        ready(); scripts.write(name, content, overwrite, progress)
    }
    override suspend fun rename(name: String, newName: String) { ready(); scripts.rename(name, newName) }
    override suspend fun delete(name: String) { ready(); scripts.delete(name) }
    private fun storageReady() { ready(); check(mutableState.value.scriptStorageSupported) { "当前手环不支持编辑脚本数据，请升级 JSLab" } }
    override suspend fun readStorage(name: String, progress: (TransferProgress) -> Unit): String {
        storageReady(); return scriptStorage.read(name, progress)
    }
    override suspend fun writeStorage(name: String, base: String, content: String, progress: (TransferProgress) -> Unit) {
        storageReady(); scriptStorage.write(name, base, content, progress)
    }
    override suspend fun launch() { ready(); transport.launch() }

    override fun disconnect() {
        generation++
        rpc.disconnect()
        cloudSession.cancel()
        cloudSession = SupervisorJob(scope.coroutineContext[Job])
        transport.disconnect()
        mutableState.update { LinkState(devices = it.devices) }
    }
    override fun close() { disconnect(); cloudSession.cancel(); transport.close() }
}

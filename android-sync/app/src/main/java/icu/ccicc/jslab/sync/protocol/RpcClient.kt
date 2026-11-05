package icu.ccicc.jslab.sync.protocol

import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeout
import org.json.JSONObject

class RpcClient(private val send: suspend (String) -> Unit) {
    private val sequence = AtomicLong()
    private val pending = ConcurrentHashMap<String, CompletableDeferred<JSONObject>>()

    suspend fun request(action: String, payload: JSONObject = JSONObject(), timeoutMs: Long = 15_000): JSONObject {
        val id = "android-${sequence.incrementAndGet()}"
        val response = CompletableDeferred<JSONObject>()
        pending[id] = response
        try {
            return withTimeout(timeoutMs) {
                send(json("v" to PROTOCOL_VERSION, "type" to "request", "id" to id,
                    "action" to action, "payload" to payload).toString())
                response.await()
            }
        } finally {
            pending.remove(id)
            response.cancel()
        }
    }

    fun receive(message: JSONObject) {
        if (!message.isSyncEnvelope() || message.optString("type") != "response") return
        val response = pending.remove(message.optString("id")) ?: return // Ignore late / unrelated responses.
        if (message.opt("ok") == true) {
            val result = message.optJSONObject("result")
            if (result != null) response.complete(result)
            else response.completeExceptionally(IOException("设备响应格式无效"))
        } else response.completeExceptionally(IOException(message.optString("error", "设备操作失败")))
    }

    fun disconnect() {
        pending.values.forEach { it.completeExceptionally(IOException("设备连接已断开，请重新连接后重试")) }
        pending.clear()
    }
}

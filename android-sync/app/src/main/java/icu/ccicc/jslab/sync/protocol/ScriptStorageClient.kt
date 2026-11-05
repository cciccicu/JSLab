package icu.ccicc.jslab.sync.protocol

import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

/** Version 1 storage extension; all messages retain the existing v2 RPC envelope. */
class ScriptStorageClient(private val rpc: RpcClient) {
    suspend fun read(name: String, progress: (TransferProgress) -> Unit = {}): String {
        require(validScriptName(name)) { "脚本文件名无效" }
        val content = StringBuilder()
        var offset = 0L
        var total: Long? = null
        var transferId: String? = null
        do {
            currentCoroutineContext().ensureActive()
            val payload = json("name" to name, "offset" to offset)
            transferId?.let { payload.put("transferId", it) }
            val result = rpc.request("storageRead", payload)
            require(result.getString("name") == name) { "读取的脚本数据名称不匹配" }
            val returnedId = result.getString("transferId")
            require(returnedId.isNotEmpty() && (transferId == null || transferId == returnedId)) { "数据读取会话发生变化" }
            transferId = returnedId
            val part = result.getString("content")
            val size = result.requiredLong("size")
            val next = result.requiredLong("nextOffset")
            val done = result.getBoolean("done")
            if (total == null) total = size
            require(total == size && next == offset + part.toByteArray(Charsets.UTF_8).size && next <= size &&
                done == (next == size) && (done || next > offset)) { "脚本数据分块校验失败，请重新读取" }
            content.append(part)
            offset = next
            progress(TransferProgress("正在读取脚本数据", offset, size))
        } while (!done)
        return content.toString().also { validateStorageDocument(it) }
    }

    suspend fun write(name: String, base: String, content: String, progress: (TransferProgress) -> Unit = {}) {
        require(validScriptName(name)) { "脚本文件名无效" }
        validateStorageDocument(base)
        validateStorageDocument(content)
        val envelope = json("base" to base, "content" to content).toString()
        utf8Chunks(envelope).forEach { }
        val size = envelope.toByteArray(Charsets.UTF_8).size.toLong()
        val transferId = rpc.request("storageWriteStart", json("name" to name, "size" to size)).getString("transferId")
        require(transferId.isNotEmpty()) { "设备未建立数据保存会话" }
        var offset = 0L
        var index = 0L
        for (chunk in utf8Chunks(envelope)) {
            currentCoroutineContext().ensureActive()
            val ack = rpc.request("storageWriteChunk", json("transferId" to transferId, "index" to index, "content" to chunk))
            offset += chunk.toByteArray(Charsets.UTF_8).size
            index++
            require(ack.requiredLong("bytes") == offset && ack.requiredLong("nextIndex") == index) { "设备数据分块确认不匹配，保存已停止" }
            progress(TransferProgress("正在保存脚本数据", offset, size))
        }
        val result = rpc.request("storageWriteFinish", json("transferId" to transferId))
        require(result.getString("name") == name && result.requiredLong("size") == size) { "设备数据保存结果不匹配，请重新读取检查" }
    }
}

package icu.ccicc.jslab.sync.protocol

import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import org.json.JSONObject

class ScriptClient(private val rpc: RpcClient) {
    suspend fun hello(): SyncCapabilities = syncCapabilities(rpc.request("hello"))

    suspend fun list(): List<ScriptFile> {
        val files = rpc.request("list").getJSONArray("files")
        return (0 until files.length()).map {
            val file = files.getJSONObject(it)
            val name = file.getString("name")
            require(validScriptName(name)) { "设备返回了无效的文件名" }
            ScriptFile(name, file.requiredLong("size", allowString = true))
        }.also { items -> require(items.map { it.name }.distinct().size == items.size) { "设备返回了重复的文件名" } }
    }

    suspend fun read(name: String, progress: (TransferProgress) -> Unit = {}): String {
        require(validScriptName(name)) { "文件名无效" }
        val content = StringBuilder()
        var offset = 0L
        var total: Long? = null
        do {
            currentCoroutineContext().ensureActive()
            val result = rpc.request("read", json("name" to name, "offset" to offset))
            require(result.getString("name") == name) { "读取的文件名不匹配" }
            val part = result.getString("content")
            val size = result.requiredLong("size")
            val next = result.requiredLong("nextOffset")
            val done = result.getBoolean("done")
            if (total == null) total = size
            require(total == size && next == offset + part.toByteArray(Charsets.UTF_8).size && next <= size &&
                (done == (next == size)) && (done || next > offset)) { "脚本在传输中发生变化或分块校验失败，请重新读取" }
            content.append(part)
            offset = next
            progress(TransferProgress("正在读取 $name", offset, size))
        } while (!done)
        return content.toString()
    }

    suspend fun write(name: String, content: String, overwrite: Boolean, progress: (TransferProgress) -> Unit = {}) {
        require(validScriptName(name)) { "文件名必须是有效的 .js 文件名（最多 128 字符）" }
        // Validate before starting a session so malformed UTF-16 cannot disagree with the declared byte count.
        utf8Chunks(content).forEach { }
        val size = content.toByteArray(Charsets.UTF_8).size.toLong()
        val start = rpc.request("writeStart", json("name" to name, "size" to size, "overwrite" to overwrite))
        val transferId = start.getString("transferId")
        require(transferId.isNotEmpty()) { "设备未建立上传会话" }
        var index = 0L
        var offset = 0L
        for (chunk in utf8Chunks(content)) {
            currentCoroutineContext().ensureActive()
            val ack = rpc.request("writeChunk", json("transferId" to transferId, "index" to index, "content" to chunk))
            offset += chunk.toByteArray(Charsets.UTF_8).size
            index++
            require(ack.requiredLong("nextIndex") == index && ack.requiredLong("bytes") == offset) {
                "设备分块确认不匹配，上传已停止"
            }
            progress(TransferProgress("正在上传 $name", offset, size))
        }
        val finish = rpc.request("writeFinish", json("transferId" to transferId))
        require(finish.getString("name") == name && finish.requiredLong("size") == size) { "设备写入结果不匹配，请刷新检查" }
        progress(TransferProgress("上传完成", size, size))
    }

    suspend fun create(name: String) = mutate("create", json("name" to checked(name)))
    suspend fun rename(name: String, newName: String) = mutate("rename", json("name" to checked(name), "newName" to checked(newName)))
    suspend fun delete(name: String) = mutate("delete", json("name" to checked(name)))
    private fun checked(name: String) = name.also { require(validScriptName(it)) { "文件名无效，请使用 .js 后缀" } }
    private suspend fun mutate(action: String, payload: JSONObject) { rpc.request(action, payload) }
}

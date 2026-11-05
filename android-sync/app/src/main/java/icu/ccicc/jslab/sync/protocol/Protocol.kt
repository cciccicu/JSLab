package icu.ccicc.jslab.sync.protocol

import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import org.json.JSONObject

const val PROTOCOL_VERSION = 2
const val WEAR_PACKAGE = "icu.ccicc.jslab"
const val CHUNK_BYTES = 4096
const val SCRIPT_STORAGE_PROTOCOL = 1

data class SyncCapabilities(val scriptStorageSupported: Boolean = false)

fun syncCapabilities(hello: JSONObject): SyncCapabilities {
    require(hello.requiredLong("protocol") == PROTOCOL_VERSION.toLong()) { "手环同步协议不兼容" }
    return SyncCapabilities(runCatching { hello.requiredLong("scriptStorageProtocol") == SCRIPT_STORAGE_PROTOCOL.toLong() }.getOrDefault(false))
}

fun validateStorageDocument(content: String): JSONObject {
    val value = JSONObject(content)
    require(value.keys().asSequence().all { it == "data" || it == "config" } &&
        value.opt("data") is JSONObject && value.opt("config") is JSONObject) {
        "脚本数据必须是包含 data 和 config 两个对象的 JSON"
    }
    return value
}

fun json(vararg pairs: Pair<String, Any?>) = JSONObject().apply {
    pairs.forEach { (key, value) -> put(key, value) }
}

fun validScriptName(name: String): Boolean = name.isNotEmpty() && name.length <= 128 &&
    name.endsWith(".js", ignoreCase = true) &&
    name.none { it == '/' || it == '\\' || it.code < 32 || it.code == 127 }

fun decodeUtf8(bytes: ByteArray): String = Charsets.UTF_8.newDecoder()
    .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
    .decode(ByteBuffer.wrap(bytes)).toString()

/** Each part is valid UTF-8 and fits the wire byte limit, including supplementary characters. */
fun utf8Chunks(content: String, limit: Int = CHUNK_BYTES): Sequence<String> = sequence {
    require(limit >= 4)
    var start = 0
    while (start < content.length) {
        var end = start
        var bytes = 0
        while (end < content.length) {
            val point = content.codePointAt(end)
            require(point !in 0xD800..0xDFFF) { "脚本含有无效的 Unicode 字符" }
            val count = when { point < 0x80 -> 1; point < 0x800 -> 2; point < 0x10000 -> 3; else -> 4 }
            if (bytes + count > limit) break
            bytes += count
            end += Character.charCount(point)
        }
        yield(content.substring(start, end))
        start = end
    }
}

data class ScriptFile(val name: String, val size: Long)
data class TransferProgress(val label: String, val bytes: Long, val total: Long) {
    val fraction: Float get() = if (total == 0L) 1f else (bytes.toFloat() / total).coerceIn(0f, 1f)
}

fun JSONObject.requiredLong(key: String, allowString: Boolean = false): Long {
    val raw = opt(key)
    if (allowString && raw is String) {
        return raw.toLongOrNull()?.takeIf { it >= 0 } ?: throw IllegalArgumentException("设备返回了无效的 $key")
    }
    require((raw is Int || raw is Long || raw is Short || raw is Byte) && (raw as Number).toLong() >= 0) {
        "设备返回了无效的 $key"
    }
    return (raw as Number).toLong()
}

fun JSONObject.isSyncEnvelope(): Boolean = runCatching { requiredLong("v") == PROTOCOL_VERSION.toLong() }.getOrDefault(false)

package icu.ccicc.jslab.sync.protocol

import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProtocolTest {
    @Test fun `UTF-8 chunks preserve Chinese emoji and exact byte limits`() {
        val original = "a".repeat(4095) + "🌏中文\n".repeat(2500)
        val parts = utf8Chunks(original).toList()
        assertEquals(original, parts.joinToString(""))
        assertTrue(parts.all { it.toByteArray().size <= CHUNK_BYTES })
        assertTrue(parts.all { decodeUtf8(it.toByteArray()) == it })
        assertEquals(4095, parts.first().toByteArray().size)
        assertTrue(utf8Chunks("").none())
    }

    @Test fun `legacy filenames remain accepted`() {
        listOf(".js", "legacy..name.JS", "中文.ui.js", "a".repeat(125) + ".js").forEach { assertTrue(it, validScriptName(it)) }
        listOf("a/b.js", "..\\escape.js", "script.txt", "a\u0000.js", "a".repeat(126) + ".js").forEach { assertFalse(it, validScriptName(it)) }
    }

    @Test fun `RPC routes concurrent responses by id and ignores wrong versions`() = runTest {
        val sent = mutableListOf<JSONObject>()
        val rpc = RpcClient { sent += JSONObject(it) }
        val first = async { rpc.request("list") }
        val second = async { rpc.request("hello") }
        runCurrent()
        rpc.receive(json("v" to 99, "type" to "response", "id" to sent[0].getString("id"), "ok" to true, "result" to json()))
        assertFalse(first.isCompleted)
        rpc.receive(reply(sent[1], json("protocol" to 2)))
        rpc.receive(reply(sent[0], json("count" to 7)))
        assertEquals(7, first.await().getInt("count"))
        assertEquals(2, second.await().getInt("protocol"))
    }

    @Test fun `RPC timeout ignores late response and disconnect rejects pending work`() = runTest {
        val sent = mutableListOf<JSONObject>()
        val rpc = RpcClient { sent += JSONObject(it) }
        val timed = async { runCatching { rpc.request("hello", timeoutMs = 50) } }
        advanceTimeBy(51); runCurrent()
        assertTrue(timed.await().exceptionOrNull() is TimeoutCancellationException)
        rpc.receive(reply(sent[0], json("protocol" to 2)))
        val pending = async { runCatching { rpc.request("list") } }
        runCurrent(); rpc.disconnect()
        assertTrue(pending.await().exceptionOrNull()?.message?.contains("断开") == true)
    }

    @Test fun `malformed UTF-8 and unpaired surrogate never silently replace script text`() {
        assertThrows(Exception::class.java) { decodeUtf8(byteArrayOf(0xC3.toByte(), 0x28)) }
        assertThrows(IllegalArgumentException::class.java) { utf8Chunks("\uD800").toList() }
    }

    private fun reply(request: JSONObject, result: JSONObject) = json("v" to 2, "type" to "response",
        "id" to request.getString("id"), "ok" to true, "result" to result)
}

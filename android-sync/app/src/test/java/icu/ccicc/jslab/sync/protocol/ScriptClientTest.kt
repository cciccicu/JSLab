package icu.ccicc.jslab.sync.protocol

import java.io.File
import kotlinx.coroutines.test.runTest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ScriptClientTest {
    private fun client(handle: (String, JSONObject) -> JSONObject): ScriptClient {
        lateinit var rpc: RpcClient
        rpc = RpcClient { raw ->
            val request = JSONObject(raw)
            val result = handle(request.getString("action"), request.getJSONObject("payload"))
            rpc.receive(json("v" to 2, "type" to "response", "id" to request.getString("id"), "ok" to true, "result" to result))
        }
        return ScriptClient(rpc)
    }

    @Test fun `upload validates every ack and commits complete Unicode source - emits actual Android wire vectors`() = runTest {
        val source = "// 中文🌏\nconst 内容 = '灵感';\n".repeat(1300)
        val received = StringBuilder()
        val trace = JSONArray()
        var index = 0
        var finished = false
        val client = client { action, payload ->
            trace.put(json("action" to action, "payload" to JSONObject(payload.toString())))
            when (action) {
                "writeStart" -> {
                    assertEquals(source.toByteArray().size.toLong(), payload.getLong("size"))
                    assertFalse(payload.getBoolean("overwrite"))
                    json("transferId" to "test-transfer", "exists" to false)
                }
                "writeChunk" -> {
                    assertEquals(index++, payload.getInt("index"))
                    assertEquals("test-transfer", payload.getString("transferId"))
                    val text = payload.getString("content")
                    assertTrue(text.toByteArray().size <= CHUNK_BYTES)
                    received.append(text)
                    json("nextIndex" to index, "bytes" to received.toString().toByteArray().size)
                }
                "writeFinish" -> { finished = true; json("name" to "中文.ui.JS", "size" to received.toString().toByteArray().size) }
                else -> error(action)
            }
        }
        client.write("中文.ui.JS", source, false)
        assertTrue(finished)
        assertEquals(source, received.toString())
        val vectorFile = File("build/test-vectors/android-write.json")
        vectorFile.parentFile!!.mkdirs()
        vectorFile.writeText(json("name" to "中文.ui.JS", "content" to source, "requests" to trace).toString(), Charsets.UTF_8)
    }

    @Test fun `wrong upload ack prevents commit`() = runTest {
        var commits = 0
        val client = client { action, _ -> when (action) {
            "writeStart" -> json("transferId" to "bad")
            "writeChunk" -> json("nextIndex" to 1, "bytes" to 999)
            else -> { commits++; json() }
        } }
        assertTrue(runCatching { client.write("test.js", "你好", false) }.isFailure)
        assertEquals(0, commits)
    }

    @Test fun `read uses byte offsets and rejects changing size and non-progressing blocks`() = runTest {
        val parts = listOf("你好🌏", "\nconst a = 1;")
        var offset = 0
        var index = 0
        val size = parts.joinToString("").toByteArray().size
        val client = client { _, payload ->
            assertEquals(offset, payload.getInt("offset"))
            val part = parts[index++]
            offset += part.toByteArray().size
            json("name" to "test.js", "content" to part, "size" to size, "nextOffset" to offset, "done" to (index == parts.size))
        }
        assertEquals(parts.joinToString(""), client.read("test.js"))
        val stalled = client { _, _ -> json("name" to "test.js", "content" to "", "size" to 20, "nextOffset" to 0, "done" to false) }
        assertTrue(runCatching { stalled.read("test.js") }.isFailure)
        val changing = client { _, payload ->
            val next = payload.getInt("offset") + 1
            json("name" to "test.js", "content" to "a", "size" to (10 + next), "nextOffset" to next, "done" to false)
        }
        assertTrue(runCatching { changing.read("test.js") }.isFailure)
    }

    @Test fun `empty script commits without a chunk`() = runTest {
        val actions = mutableListOf<String>()
        val client = client { action, _ ->
            actions += action
            if (action == "writeStart") json("transferId" to "empty") else json("name" to "empty.js", "size" to 0)
        }
        client.write("empty.js", "", false)
        assertEquals(listOf("writeStart", "writeFinish"), actions)
    }
}

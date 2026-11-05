package icu.ccicc.jslab.sync.protocol

import java.io.File
import kotlinx.coroutines.test.runTest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ScriptStorageClientTest {
    private fun client(handle: (String, JSONObject) -> JSONObject): ScriptStorageClient {
        lateinit var rpc: RpcClient
        rpc = RpcClient { raw ->
            val request = JSONObject(raw)
            assertEquals(2, request.getInt("v"))
            val result = handle(request.getString("action"), request.getJSONObject("payload"))
            rpc.receive(json("v" to 2, "type" to "response", "id" to request.getString("id"), "ok" to true, "result" to result))
        }
        return ScriptStorageClient(rpc)
    }

    @Test fun `data upload preserves types and snapshot - emits Android wire vectors`() = runTest {
        val name = "中文.ui.JS"
        val base = """{"data":{"count":1},"config":{"enabled":true}}"""
        val content = json("data" to json("text" to "中文🌏\\\"\n".repeat(1200),
            "values" to JSONArray("[1,true,null,{\"nested\":\"中\"}]")), "config" to json("enabled" to false)).toString()
        val trace = JSONArray()
        val received = StringBuilder()
        var index = 0
        val client = client { action, payload ->
            trace.put(json("action" to action, "payload" to JSONObject(payload.toString())))
            when (action) {
                "storageWriteStart" -> json("transferId" to "android-storage")
                "storageWriteChunk" -> {
                    assertEquals(index++, payload.getInt("index"))
                    val chunk = payload.getString("content")
                    assertTrue(chunk.toByteArray().size <= CHUNK_BYTES)
                    received.append(chunk)
                    json("bytes" to received.toString().toByteArray().size, "nextIndex" to index)
                }
                "storageWriteFinish" -> json("name" to name, "size" to received.toString().toByteArray().size)
                else -> error(action)
            }
        }
        client.write(name, base, content)
        assertTrue(index > 1)
        val frame = JSONObject(received.toString())
        assertEquals(base, frame.getString("base"))
        assertEquals(content, frame.getString("content"))
        val target = File("build/test-vectors/android-storage-write.json")
        target.parentFile!!.mkdirs()
        target.writeText(json("name" to name, "base" to base, "content" to content, "requests" to trace).toString(), Charsets.UTF_8)
    }

    @Test fun `snapshot read follows byte offsets and rejects a changed transfer id`() = runTest {
        val parts = listOf("{\"data\":{\"value\":\"中文🌏\"}", ",\"config\":{}}")
        val size = parts.joinToString("").toByteArray().size
        var offset = 0
        var index = 0
        var changeId = false
        val client = client { action, payload ->
            assertEquals("storageRead", action)
            assertEquals(offset, payload.getInt("offset"))
            if (index > 0) assertEquals("snapshot", payload.getString("transferId"))
            val part = parts[index++]
            offset += part.toByteArray().size
            json("name" to "main.js", "transferId" to if (changeId && index > 1) "changed" else "snapshot",
                "content" to part, "size" to size, "nextOffset" to offset, "done" to (index == parts.size))
        }
        assertEquals(parts.joinToString(""), client.read("main.js"))
        offset = 0; index = 0; changeId = true
        assertTrue(runCatching { client.read("main.js") }.isFailure)
    }

    @Test fun `invalid document and wrong acknowledgement never commit`() = runTest {
        val actions = mutableListOf<String>()
        val client = client { action, _ ->
            actions += action
            if (action == "storageWriteStart") json("transferId" to "bad") else json("bytes" to 0, "nextIndex" to 1)
        }
        val base = """{"data":{},"config":{}}"""
        for (invalid in listOf("[]", "{\"data\":[],\"config\":{}}", "{\"data\":{},\"config\":{},\"other\":1}")) {
            assertTrue(runCatching { client.write("main.js", base, invalid) }.isFailure)
        }
        assertTrue(actions.isEmpty())
        assertTrue(runCatching { client.write("main.js", base, base) }.isFailure)
        assertFalse(actions.contains("storageWriteFinish"))
    }
}

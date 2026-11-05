package icu.ccicc.jslab.sync.protocol

import java.io.File
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SharedCompatibilityTest {
    @Test fun `both synchronizers accept the same existing wearable filenames hello and metadata`() = runTest {
        val fixture = listOf(File("../../astrobox-plugin-sync/test-data/sync-compatibility.json"),
            File("../astrobox-plugin-sync/test-data/sync-compatibility.json")).first { it.isFile }
        val cases = JSONObject(fixture.readText(Charsets.UTF_8))
        val valid = cases.getJSONArray("validScriptNames")
        for (index in 0 until valid.length()) assertTrue(valid.getString(index), validScriptName(valid.getString(index)))
        val invalid = cases.getJSONArray("invalidScriptNames")
        for (index in 0 until invalid.length()) assertFalse(invalid.getString(index), validScriptName(invalid.getString(index)))
        assertTrue(validScriptName("中".repeat(125) + ".js"))
        assertFalse(validScriptName("中".repeat(126) + ".js"))
        fun client(result: JSONObject): ScriptClient {
            lateinit var rpc: RpcClient
            rpc = RpcClient { text ->
                val request = JSONObject(text)
                rpc.receive(json("v" to 2, "type" to "response", "id" to request.getString("id"), "ok" to true, "result" to result))
            }
            return ScriptClient(rpc)
        }
        val accepted = cases.getJSONArray("acceptedHello")
        for (index in 0 until accepted.length()) client(accepted.getJSONObject(index)).hello()
        val rejected = cases.getJSONArray("rejectedHello")
        for (index in 0 until rejected.length()) assertTrue(runCatching { client(rejected.getJSONObject(index)).hello() }.isFailure)
        val capabilities = cases.getJSONArray("storageCapabilities")
        for (index in 0 until capabilities.length()) {
            val case = capabilities.getJSONObject(index)
            assertEquals(case.getBoolean("supported"), client(case.getJSONObject("hello")).hello().scriptStorageSupported)
        }
        val files = client(cases.getJSONObject("fileList")).list()
        assertEquals(listOf("legacy..name.JS", "中文.ui.js"), files.map { it.name })
        assertEquals(listOf(1024L, 50700L), files.map { it.size })
    }
}

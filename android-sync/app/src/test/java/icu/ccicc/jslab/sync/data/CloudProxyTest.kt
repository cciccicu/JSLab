package icu.ccicc.jslab.sync.data

import icu.ccicc.jslab.sync.protocol.json
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test

class CloudProxyTest {
    @Test fun `forwards old device request and preserves raw status headers and JSON text`() = runTest {
        MockWebServer().use { server ->
            val body = "{\"runtimeContract\":{\"version\":2},\"source\":\"你好🌏\"}"
            server.enqueue(MockResponse().setResponseCode(403).setHeader("Content-Type", "application/json").setBody(body))
            val response = CloudProxy().forward(json("url" to server.url("/jslab-cloud/api/cloud/device/scripts").toString(),
                "method" to "POST", "headers" to json("Authorization" to "Bearer only-for-this-request", "Content-Type" to "application/json"),
                "body" to "{\"name\":\"中文.js\"}"))
            assertEquals(403, response.getInt("status"))
            assertEquals(body, response.getString("body"))
            assertEquals("application/json", response.getJSONObject("headers").getString("content-type"))
            val sent = server.takeRequest()
            assertEquals("POST", sent.method)
            assertEquals("Bearer only-for-this-request", sent.getHeader("Authorization"))
            assertEquals("{\"name\":\"中文.js\"}", sent.body.readUtf8())
        }
    }

    @Test fun `source APIs lift size caps while ordinary APIs retain them`() = runTest {
        val routes = listOf("scripts", "scripts/a", "market/submit", "market/12/source", "ai/generate")
        routes.forEach { route ->
            assertTrue(CloudProxy.carriesSource("/api/cloud/device/$route"))
            assertTrue(CloudProxy.carriesSource("/jslab-cloud/api/cloud/$route"))
        }
        assertFalse(CloudProxy.carriesSource("/api/cloud/device/entitlements"))
        assertFalse(CloudProxy.carriesSource("/unrelated/scripts"))
        val proxy = CloudProxy()
        MockWebServer().use { server ->
            val large = "中".repeat(70_000)
            server.enqueue(MockResponse().setBody(large))
            val response = proxy.forward(json("url" to server.url("/api/cloud/device/scripts").toString(), "method" to "PUT", "body" to large))
            assertEquals(large, response.getString("body"))
            server.takeRequest()
            assertTrue(runCatching { proxy.forward(json("url" to server.url("/api/cloud/device/entitlements").toString(), "method" to "POST", "body" to large)) }.isFailure)
            server.enqueue(MockResponse().setBody(large))
            assertTrue(runCatching { proxy.forward(json("url" to server.url("/api/cloud/device/entitlements").toString())) }.isFailure)
        }
    }

    @Test fun `redirects do not leak credentials and headers are allowlisted`() = runTest {
        MockWebServer().use { server ->
            val proxy = CloudProxy()
            server.enqueue(MockResponse().setResponseCode(302).setHeader("Location", "https://example.invalid/private"))
            assertEquals(302, proxy.forward(json("url" to server.url("/api/cloud/device/scripts").toString(),
                "headers" to json("Authorization" to "Bearer secret"))).getInt("status"))
            server.takeRequest()
            assertEquals(1, server.requestCount)
            assertTrue(runCatching { proxy.forward(json("url" to server.url("/").toString(), "headers" to json("Cookie" to "secret"))) }.isFailure)
            assertTrue(runCatching { proxy.forward(json("url" to server.url("/").toString(), "method" to "PATCH")) }.isFailure)
            server.enqueue(MockResponse().setBody("{}"))
            proxy.forward(json("url" to server.url("/").toString()))
            assertNull(server.takeRequest().getHeader("Authorization"))
        }
    }
}

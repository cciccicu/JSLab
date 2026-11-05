package icu.ccicc.jslab.sync.data

import icu.ccicc.jslab.sync.protocol.decodeUtf8
import icu.ccicc.jslab.sync.protocol.json
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject

class CloudProxy(private val client: OkHttpClient = OkHttpClient.Builder()
    .connectTimeout(10, TimeUnit.SECONDS).readTimeout(330, TimeUnit.SECONDS)
    .callTimeout(330, TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).build()) {

    suspend fun forward(payload: JSONObject): JSONObject {
        val urlText = payload.getString("url")
        require(urlText.toByteArray(Charsets.UTF_8).size <= 2048) { "云端 URL 过长" }
        val url = urlText.toHttpUrlOrNull() ?: throw IOException("云端 URL 无效")
        require(url.username.isEmpty() && url.password.isEmpty() && url.fragment == null) { "云端 URL 无效" }
        val method = payload.optString("method", "GET")
        require(method in setOf("GET", "POST", "PUT", "DELETE")) { "不支持的云端请求方式" }
        val source = carriesSource(url.encodedPath)
        val body = payload.optString("body", "").toByteArray(Charsets.UTF_8)
        require(source || body.size <= 64 * 1024) { "云端请求过大" }
        val request = Request.Builder().url(url)
        val headers = payload.optJSONObject("headers") ?: JSONObject()
        require(headers.length() <= 3) { "云端请求头过多" }
        headers.keys().forEach { name ->
            val value = headers.getString(name)
            require(name.lowercase() in setOf("authorization", "content-type", "accept") &&
                value.toByteArray(Charsets.UTF_8).size <= 1024 && '\r' !in value && '\n' !in value) { "云端请求头无效" }
            request.header(name, value)
        }
        val media = headers.keys().asSequence().firstOrNull { it.equals("content-type", true) }
            ?.let { headers.getString(it).toMediaTypeOrNull() }
        request.method(method, if (method == "GET") null else body.toRequestBody(media))
        // No logging interceptor or persistent cookie jar: wearable credentials live for this call only.
        return client.newCall(request.build()).executeJson(source)
    }

    private suspend fun Call.executeJson(source: Boolean): JSONObject = suspendCancellableCoroutine { continuation ->
        continuation.invokeOnCancellation { cancel() }
        enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (continuation.isActive) continuation.resumeWithException(IOException("云端网络请求失败"))
            }
            override fun onResponse(call: Call, response: Response) {
                try {
                    val result = response.use {
                        val output = ByteArrayOutputStream()
                        it.body?.byteStream()?.use { input ->
                            val buffer = ByteArray(8192)
                            while (true) {
                                val count = input.read(buffer)
                                if (count == -1) break
                                require(source || output.size() + count <= 128 * 1024) { "云端响应过大" }
                                output.write(buffer, 0, count)
                            }
                        }
                        json("status" to it.code, "headers" to json("content-type" to (it.header("Content-Type") ?: "application/octet-stream")),
                            "body" to decodeUtf8(output.toByteArray()))
                    }
                    if (continuation.isActive) continuation.resume(result)
                } catch (error: Exception) {
                    if (continuation.isActive) continuation.resumeWithException(IOException("云端响应读取失败"))
                }
            }
        })
    }

    companion object {
        fun carriesSource(path: String): Boolean {
            var route = path.substringAfterLast("/api/cloud/", "")
            if (route.isEmpty()) return false
            route = route.removePrefix("device/")
            return route == "scripts" || route.startsWith("scripts/") || route == "market/submit" ||
                route == "ai/generate" || (route.startsWith("market/") && route.endsWith("/source"))
        }
    }
}

package icu.ccicc.jslab.sync.data

import android.util.AtomicFile
import icu.ccicc.jslab.sync.EditorDocument
import icu.ccicc.jslab.sync.EditorKind
import icu.ccicc.jslab.sync.protocol.decodeUtf8
import icu.ccicc.jslab.sync.protocol.json
import icu.ccicc.jslab.sync.protocol.validScriptName
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject

data class SavedEditorDraft(val document: EditorDocument, val editorOpen: Boolean)
interface EditorDraftStore {
    suspend fun read(): SavedEditorDraft?
    suspend fun write(draft: SavedEditorDraft?)
}

class FileEditorDraftStore(file: File) : EditorDraftStore {
    // Older Android clients only understand source drafts. Never put saved data
    // into their draft file, where a downgrade could mistake it for JS source.
    private val storageFile = AtomicFile(File(file.parentFile, file.name + ".script-data"))
    private val file = AtomicFile(file)
    private val mutex = Mutex()

    override suspend fun read(): SavedEditorDraft? = withContext(Dispatchers.IO) {
        mutex.withLock {
            listOf(file, storageFile).sortedByDescending { it.baseFile.lastModified() }.firstNotNullOfOrNull { candidate ->
                runCatching { decodeDraft(candidate.openRead().use { decodeUtf8(it.readBytes()) }) }.getOrNull()
            }
        }
    }

    override suspend fun write(draft: SavedEditorDraft?) = withContext(Dispatchers.IO) {
        mutex.withLock {
            if (draft == null) { file.delete(); storageFile.delete() }
            else {
                val target = if (draft.document.kind == EditorKind.ScriptData) storageFile else file
                val other = if (draft.document.kind == EditorKind.ScriptData) file else storageFile
                val output = target.startWrite()
                try {
                    output.write(encodeDraft(draft).toByteArray(Charsets.UTF_8))
                    target.finishWrite(output)
                    other.delete()
                } catch (error: Exception) { target.failWrite(output); throw error }
            }
        }
    }
}

internal fun encodeDraft(draft: SavedEditorDraft): String = with(draft.document) {
    json("name" to name, "content" to content, "savedContent" to (savedContent ?: JSONObject.NULL),
        "deviceId" to (deviceId ?: ""), "remoteExists" to remoteExists, "editorOpen" to draft.editorOpen,
        "kind" to kind.name, "storageBase" to (storageBase ?: JSONObject.NULL)).toString()
}

internal fun decodeDraft(text: String): SavedEditorDraft {
    val value = JSONObject(text)
    val name = value.getString("name")
    require(validScriptName(name))
    val kind = if (!value.has("kind")) EditorKind.Script else
        EditorKind.entries.firstOrNull { it.name == value.getString("kind") } ?: error("无法识别的草稿类型")
    val storageBase = if (value.isNull("storageBase")) null else value.optString("storageBase").ifEmpty { null }
    val deviceId = value.optString("deviceId").ifEmpty { null }
    require(kind != EditorKind.ScriptData || (storageBase != null && deviceId != null)) { "脚本数据草稿缺少原始内容或所属设备" }
    return SavedEditorDraft(EditorDocument(name = name, content = value.getString("content"),
        savedContent = if (value.isNull("savedContent")) null else value.getString("savedContent"),
        deviceId = deviceId, remoteExists = value.optBoolean("remoteExists"),
        kind = kind, storageBase = storageBase),
        // Existing draft files did not contain visibility; keep their previous restore behavior.
        editorOpen = value.optBoolean("editorOpen", true))
}

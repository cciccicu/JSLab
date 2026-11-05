package icu.ccicc.jslab.sync.data

import icu.ccicc.jslab.sync.EditorDocument
import icu.ccicc.jslab.sync.EditorKind
import org.junit.Assert.*
import org.junit.Test

class EditorDraftStoreTest {
    @Test fun `parked draft round trip preserves text original contents owner and visibility`() {
        val draft = SavedEditorDraft(EditorDocument(name = "中文.ui.JS", content = "新内容🌏\n", savedContent = "old",
            deviceId = "original-device", remoteExists = true), editorOpen = false)
        val restored = decodeDraft(encodeDraft(draft))
        assertEquals(draft.document.name, restored.document.name)
        assertEquals(draft.document.content, restored.document.content)
        assertEquals(draft.document.savedContent, restored.document.savedContent)
        assertEquals(draft.document.deviceId, restored.document.deviceId)
        assertTrue(restored.document.dirty)
        assertFalse(restored.editorOpen)
    }

    @Test fun `drafts from previous Android version still restore without new visibility field`() {
        val restored = decodeDraft("""{"name":"legacy..name.JS","content":"旧草稿","savedContent":null,"deviceId":"","remoteExists":false}""")
        assertEquals("旧草稿", restored.document.content)
        assertNull(restored.document.deviceId)
        assertTrue(restored.document.dirty)
        assertTrue(restored.editorOpen)
        assertEquals(EditorKind.Script, restored.document.kind)
    }

    @Test fun `data draft preserves its kind and conflict snapshot without becoming source`() {
        val base = """{"data":{"count":1},"config":{}}"""
        val draft = SavedEditorDraft(EditorDocument(name = "main.js", content = "edited", savedContent = base,
            deviceId = "owner", remoteExists = true, kind = EditorKind.ScriptData, storageBase = base), true)
        val restored = decodeDraft(encodeDraft(draft)).document
        assertEquals(EditorKind.ScriptData, restored.kind)
        assertEquals(base, restored.storageBase)
        assertEquals("owner", restored.deviceId)
        assertTrue(restored.dirty)
        assertTrue(runCatching { decodeDraft(encodeDraft(draft).replace("ScriptData", "FutureKind")) }.isFailure)
        assertTrue(runCatching { decodeDraft(encodeDraft(draft).replace("\"storageBase\":", "\"unknownBase\":")) }.isFailure)
        assertTrue(runCatching { decodeDraft(encodeDraft(draft).replace("\"deviceId\":", "\"unknownOwner\":")) }.isFailure)
    }
}

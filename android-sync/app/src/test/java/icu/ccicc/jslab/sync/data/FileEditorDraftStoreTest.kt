package icu.ccicc.jslab.sync.data

import icu.ccicc.jslab.sync.EditorDocument
import icu.ccicc.jslab.sync.EditorKind
import java.io.File
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class FileEditorDraftStoreTest {
    @get:Rule val directory = TemporaryFolder()

    @Test fun `data draft survives restart in a separate file that old clients cannot open as source`() = runTest {
        val legacy = File(directory.root, "editor-draft.json")
        val storageFile = File(directory.root, "editor-draft.json.script-data")
        val base = """{"data":{},"config":{}}"""
        val draft = SavedEditorDraft(EditorDocument(name = "main.js", content = "edited", savedContent = base,
            deviceId = "owner", kind = EditorKind.ScriptData, storageBase = base), true)
        FileEditorDraftStore(legacy).write(draft)
        assertFalse(legacy.exists())
        assertTrue(storageFile.isFile)
        val restored = FileEditorDraftStore(legacy).read()!!.document
        assertEquals(EditorKind.ScriptData, restored.kind)
        assertEquals(base, restored.storageBase)
        assertEquals("edited", restored.content)
        FileEditorDraftStore(legacy).write(SavedEditorDraft(EditorDocument(name = "code.js", content = "source"), false))
        assertTrue(legacy.isFile)
        assertFalse(storageFile.exists())
        assertEquals(EditorKind.Script, FileEditorDraftStore(legacy).read()!!.document.kind)
        FileEditorDraftStore(legacy).write(null)
        assertFalse(legacy.exists())
        assertFalse(storageFile.exists())
    }
}

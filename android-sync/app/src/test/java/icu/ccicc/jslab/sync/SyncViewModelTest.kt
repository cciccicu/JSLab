package icu.ccicc.jslab.sync

import android.app.Application
import androidx.lifecycle.ViewModelStore
import icu.ccicc.jslab.sync.data.*
import icu.ccicc.jslab.sync.protocol.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SyncViewModelTest {
    private val stores = mutableListOf<ViewModelStore>()
    private val device = WearDevice("original", "原设备")

    @Before fun setup() { Dispatchers.setMain(StandardTestDispatcher()) }
    @After fun teardown() { stores.forEach { it.clear() }; Dispatchers.resetMain() }

    private fun model(session: FakeSession, drafts: MemoryDrafts = MemoryDrafts()): SyncViewModel {
        val settings = object : SyncSettings {
            override val flow = MutableStateFlow(SyncPreferences())
            override suspend fun theme(value: ThemeMode) { flow.value = flow.value.copy(theme = value) }
            override suspend fun proxy(enabled: Boolean) { flow.value = flow.value.copy(cloudProxy = enabled) }
        }
        return SyncViewModel(Application(), session, settings, drafts).also {
            ViewModelStore().apply { put("sync", it) }.also(stores::add)
        }
    }

    @Test fun `online create immediately creates a remote file and rejects duplicate names`() = runTest {
        val session = FakeSession(device)
        val model = model(session)
        runCurrent()
        model.create("new.js"); runCurrent()
        assertEquals(listOf("create:new.js", "refresh"), session.commands)
        assertTrue(session.files.containsKey("new.js"))
        assertNull(model.screen.value.editor)
        model.create("new.js"); runCurrent()
        assertEquals(1, session.commands.count { it.startsWith("create:") })
        assertTrue(model.screen.value.notice!!.text.contains("不会覆盖"))
    }

    @Test fun `saving an existing editor writes directly without an extra overwrite dialog`() = runTest {
        val session = FakeSession(device, linkedMapOf("main.js" to "old"))
        val model = model(session)
        runCurrent(); model.open("main.js"); runCurrent()
        model.edit("new"); model.save(); runCurrent()
        assertNull(model.screen.value.overwrite)
        assertEquals("new", session.files["main.js"])
        assertTrue(session.commands.contains("write:main.js:true"))
        assertFalse(model.screen.value.editor!!.dirty)
    }

    @Test fun `online imports upload immediately but same-name uploads wait for confirmation`() = runTest {
        val session = FakeSession(device, linkedMapOf("existing.js" to "old"))
        val model = model(session)
        runCurrent()
        model.acceptImport(ImportedScript("new.js", "new", device.id))
        assertEquals("new", session.files["new.js"])
        assertNull(model.screen.value.editor)
        model.acceptImport(ImportedScript("existing.js", "replacement", device.id))
        assertEquals("old", session.files["existing.js"])
        assertNotNull(model.screen.value.overwrite)
        model.confirmOverwrite(); runCurrent()
        assertEquals("replacement", session.files["existing.js"])
    }

    @Test fun `opaque document names can be supplied before uploading`() = runTest {
        val session = FakeSession(device)
        val model = model(session)
        runCurrent()
        model.acceptImport(ImportedScript(null, "手机文件内容", device.id))
        assertTrue(session.files.isEmpty())
        assertNotNull(model.screen.value.importName)
        model.nameImport("手机.js"); runCurrent()
        assertEquals("手机文件内容", session.files["手机.js"])
    }

    @Test fun `offline editing keeps a durable draft on home and resumes after the Mi Fitness device event`() = runTest {
        val session = FakeSession(device, ready = false)
        val drafts = MemoryDrafts()
        val model = model(session, drafts)
        runCurrent()
        model.create("offline.js"); model.edit("// 中文🌏\nconst x = 1;")
        val editorId = model.screen.value.editor!!.id
        model.parkEditor(retryHandshake = true); runCurrent()
        assertFalse(model.screen.value.editorOpen)
        assertEquals(1, model.screen.value.homePageRequest)
        assertEquals("// 中文🌏\nconst x = 1;", drafts.saved!!.document.content)
        assertFalse(drafts.saved!!.editorOpen)
        session.available = listOf(device)
        session.deviceChanges.emit(Unit); runCurrent()
        assertTrue(model.screen.value.editorOpen)
        assertEquals(editorId, model.screen.value.editor!!.id)
        model.save(); runCurrent()
        assertEquals("// 中文🌏\nconst x = 1;", session.files["offline.js"])
        assertFalse(model.screen.value.editor!!.dirty)
    }

    @Test fun `parked draft survives model recreation and can be reopened from the workspace`() = runTest {
        val firstSession = FakeSession(device, ready = false)
        val drafts = MemoryDrafts()
        val first = model(firstSession, drafts)
        runCurrent(); first.create("retained.js"); first.edit("still here"); first.parkEditor(); runCurrent()
        stores.first().clear()
        val second = model(FakeSession(device, ready = false), drafts)
        runCurrent()
        assertEquals("still here", second.screen.value.editor!!.content)
        assertFalse(second.screen.value.editorOpen)
        second.resumeEditor()
        assertTrue(second.screen.value.editorOpen)
    }

    @Test fun `connecting another device never uploads an original-device draft`() = runTest {
        val session = FakeSession(device, linkedMapOf("bound.js" to "old"))
        val model = model(session)
        runCurrent(); model.open("bound.js"); runCurrent(); model.edit("important")
        session.available = emptyList()
        model.disconnect(); model.parkEditor(retryHandshake = true); runCurrent()
        model.connect(WearDevice("other", "其他设备")); runCurrent()
        assertFalse(model.screen.value.editorOpen)
        model.resumeEditor(); model.save(); runCurrent()
        assertEquals("important", model.screen.value.editor!!.content)
        assertTrue(session.commands.none { it.startsWith("write:") })
        assertTrue(model.screen.value.notice!!.text.contains("另一台设备"))
    }

    @Test fun `a parked draft cannot be silently replaced by opening or importing another file`() = runTest {
        val session = FakeSession(device, linkedMapOf("one.js" to "one", "two.js" to "two"))
        val model = model(session)
        runCurrent(); model.open("one.js"); runCurrent(); model.edit("unsaved"); model.parkEditor(); runCurrent()
        model.open("two.js"); runCurrent()
        assertEquals("one.js", model.screen.value.editor!!.name)
        assertTrue(runCatching { model.acceptImport(ImportedScript("three.js", "three", device.id)) }.isFailure)
        assertEquals("unsaved", model.screen.value.editor!!.content)
        assertFalse(session.files.containsKey("three.js"))
    }

    @Test fun `failed writes retain the editor and persisted draft`() = runTest {
        val session = FakeSession(device, linkedMapOf("main.js" to "old"))
        val drafts = MemoryDrafts()
        val model = model(session, drafts)
        runCurrent(); model.open("main.js"); runCurrent(); model.edit("unsaved")
        session.writeError = IllegalStateException("连接中断")
        model.save(); runCurrent(); advanceTimeBy(351); runCurrent()
        assertTrue(model.screen.value.editor!!.dirty)
        assertEquals("unsaved", drafts.saved!!.document.content)
        assertEquals("old", session.files["main.js"])
    }

    @Test fun `rename refuses unsaved changes and existing target names before sending RPC`() = runTest {
        val session = FakeSession(device, linkedMapOf("one.js" to "one", "two.js" to "two"))
        val model = model(session)
        runCurrent(); model.open("one.js"); runCurrent(); model.edit("unsaved")
        model.rename("one.js", "next.js"); runCurrent()
        assertTrue(session.commands.none { it.startsWith("rename:") })
        model.edit("one"); model.rename("one.js", "two.js"); runCurrent()
        assertTrue(session.commands.none { it.startsWith("rename:") })
        model.rename("one.js", "next.js"); runCurrent()
        assertEquals("one", session.files["next.js"])
        assertNull(model.screen.value.editor)
    }

    @Test fun `startup retries discovery and connects when the device appears`() = runTest {
        val session = FakeSession(device, ready = false)
        val model = model(session)
        runCurrent()
        assertEquals(1, session.discoveries)
        session.available = listOf(device)
        advanceTimeBy(2_000); runCurrent()
        assertEquals(ConnectionPhase.Ready, model.link.value.phase)
        assertTrue(session.commands.contains("connect:${device.id}"))
    }

    @Test fun `newly connected device requires confirmation before an offline draft replaces an existing file`() = runTest {
        val session = FakeSession(device, linkedMapOf("same.js" to "remote"), ready = false)
        val model = model(session)
        runCurrent(); model.create("same.js"); model.edit("local")
        model.parkEditor(retryHandshake = true); runCurrent(); model.connect(device); runCurrent()
        model.save(); runCurrent()
        assertEquals("remote", session.files["same.js"])
        assertNotNull(model.screen.value.overwrite)
        model.confirmOverwrite(); runCurrent()
        assertEquals("local", session.files["same.js"])
    }

    @Test fun `a stalled handshake can be interrupted to return home without losing the draft`() = runTest {
        val session = FakeSession(device, ready = false)
        val drafts = MemoryDrafts()
        val model = model(session, drafts)
        runCurrent(); model.create("retained.js"); model.edit("important")
        session.connectGate = CompletableDeferred()
        model.connect(device); runCurrent()
        assertNotNull(model.screen.value.busy)
        model.parkEditor(retryHandshake = true); runCurrent()
        assertFalse(model.screen.value.editorOpen)
        assertNull(model.screen.value.busy)
        assertEquals("important", drafts.saved!!.document.content)
        session.connectGate!!.complete(Unit)
        session.available = listOf(device)
        model.discover(); runCurrent()
        assertTrue(model.screen.value.editorOpen)
        assertEquals("important", model.screen.value.editor!!.content)
    }

    @Test fun `confirmation from an old device cannot overwrite rename or delete on a new device`() = runTest {
        val session = FakeSession(device, linkedMapOf("main.js" to "original"))
        val model = model(session)
        runCurrent()
        model.acceptImport(ImportedScript("main.js", "replacement", device.id))
        model.connect(WearDevice("other", "其他设备")); runCurrent()
        model.confirmOverwrite(); runCurrent()
        model.rename("main.js", "renamed.js", device.id); runCurrent()
        model.delete("main.js", device.id); runCurrent()
        assertEquals("original", session.files["main.js"])
        assertTrue(session.commands.none { it.startsWith("write:") || it.startsWith("rename:") || it.startsWith("delete:") })
    }

    @Test fun `data edit uses storage RPC only and retains conflict drafts`() = runTest {
        val base = """{"data":{"count":1},"config":{}}"""
        val edited = """{"data":{"count":2},"config":{}}"""
        val session = FakeSession(device, linkedMapOf("main.js" to "source"))
        session.state.value = session.state.value.copy(scriptStorageSupported = true)
        session.savedData["main.js"] = base
        val drafts = MemoryDrafts()
        val model = model(session, drafts)
        runCurrent(); model.openStorage("main.js"); runCurrent()
        assertEquals(EditorKind.ScriptData, model.screen.value.editor!!.kind)
        model.edit(edited); model.save(); runCurrent()
        assertEquals(edited, session.savedData["main.js"])
        assertEquals("source", session.files["main.js"])
        assertFalse(model.screen.value.editor!!.dirty)
        model.edit(base)
        session.savedData["main.js"] = "runtime update"
        model.save(); runCurrent(); advanceTimeBy(351); runCurrent()
        assertTrue(model.screen.value.editor!!.dirty)
        assertEquals(base, drafts.saved!!.document.content)
        assertEquals(edited, drafts.saved!!.document.storageBase)
        assertEquals("runtime update", session.savedData["main.js"])
        assertTrue(session.commands.none { it.startsWith("write:") })
    }

    @Test fun `old wearable disables data editing while source read still works`() = runTest {
        val session = FakeSession(device, linkedMapOf("main.js" to "source"))
        val model = model(session)
        runCurrent(); model.openStorage("main.js"); runCurrent()
        assertTrue(session.commands.none { it.startsWith("storage:") })
        assertNull(model.screen.value.editor)
        model.open("main.js"); runCurrent()
        assertEquals("source", model.screen.value.editor!!.content)
    }

    @Test fun `data draft cannot save to another device and exports as JSON`() = runTest {
        val session = FakeSession(device, linkedMapOf("main.js" to "source"))
        session.state.value = session.state.value.copy(scriptStorageSupported = true)
        session.savedData["main.js"] = """{"data":{},"config":{}}"""
        val model = model(session)
        runCurrent(); model.openStorage("main.js"); runCurrent()
        model.edit("""{"data":{"draft":true},"config":{}}""")
        model.connect(WearDevice("other", "其他设备")); runCurrent()
        model.save(); runCurrent()
        assertTrue(session.commands.none { it.startsWith("storage:write") })
        assertTrue(model.screen.value.editor!!.dirty)
        model.exportEditor(); runCurrent()
        assertEquals("application/json", model.screen.value.export!!.mimeType)
        assertEquals("main.js.data.json", model.screen.value.export!!.name)
    }

    private class MemoryDrafts : EditorDraftStore {
        var saved: SavedEditorDraft? = null
        override suspend fun read() = saved
        override suspend fun write(draft: SavedEditorDraft?) { saved = draft }
    }

    private class FakeSession(
        private val original: WearDevice,
        val files: LinkedHashMap<String, String> = linkedMapOf(),
        ready: Boolean = true,
    ) : SyncSession {
        override val state = MutableStateFlow(LinkState(device = original.takeIf { ready },
            phase = if (ready) ConnectionPhase.Ready else ConnectionPhase.Disconnected,
            files = if (ready) metadata() else emptyList()))
        override val changes = MutableSharedFlow<Unit>()
        override val errors = MutableSharedFlow<String>()
        override val deviceChanges = MutableSharedFlow<Unit>()
        override var proxyEnabled = true
        var available: List<WearDevice> = if (ready) listOf(original) else emptyList()
        var discoveries = 0
        var writeError: Exception? = null
        var connectGate: CompletableDeferred<Unit>? = null
        val commands = mutableListOf<String>()
        val savedData = mutableMapOf<String, String>()
        private fun metadata() = files.map { ScriptFile(it.key, it.value.toByteArray().size.toLong()) }
        override suspend fun discover() { discoveries++; state.value = state.value.copy(devices = available) }
        override suspend fun connect(device: WearDevice) {
            commands += "connect:${device.id}"
            state.value = state.value.copy(device = device, phase = ConnectionPhase.Connecting)
            connectGate?.await()
            state.value = state.value.copy(device = device, phase = ConnectionPhase.Ready, files = metadata())
        }
        override suspend fun refresh() { commands += "refresh"; state.value = state.value.copy(files = metadata()) }
        override suspend fun create(name: String) { commands += "create:$name"; check(!files.containsKey(name)); files[name] = "" }
        override suspend fun read(name: String, progress: (TransferProgress) -> Unit): String { commands += "read:$name"; return files.getValue(name) }
        override suspend fun readStorage(name: String, progress: (TransferProgress) -> Unit): String {
            commands += "storage:read:$name"
            return savedData.getValue(name)
        }
        override suspend fun writeStorage(name: String, base: String, content: String, progress: (TransferProgress) -> Unit) {
            commands += "storage:write:$name"
            check(savedData[name] == base) { "脚本数据已变更，请重新读取" }
            savedData[name] = content
        }
        override suspend fun write(name: String, content: String, overwrite: Boolean, progress: (TransferProgress) -> Unit) {
            writeError?.let { throw it }
            commands += "write:$name:$overwrite"
            check(overwrite || !files.containsKey(name))
            files[name] = content
        }
        override suspend fun rename(name: String, newName: String) {
            commands += "rename:$name:$newName"; check(!files.containsKey(newName)); files[newName] = files.remove(name)!!
        }
        override suspend fun delete(name: String) { commands += "delete:$name"; files.remove(name) }
        override suspend fun launch() = Unit
        override fun disconnect() { state.value = LinkState(devices = state.value.devices) }
        override fun close() = disconnect()
    }
}

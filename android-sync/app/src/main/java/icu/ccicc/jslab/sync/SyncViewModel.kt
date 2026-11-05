package icu.ccicc.jslab.sync

import android.app.Application
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import icu.ccicc.jslab.sync.data.*
import icu.ccicc.jslab.sync.protocol.*
import java.io.File
import java.util.UUID
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

enum class EditorKind { Script, ScriptData }

data class EditorDocument(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val content: String,
    val savedContent: String? = null,
    val deviceId: String? = null,
    val remoteExists: Boolean = false,
    val kind: EditorKind = EditorKind.Script,
    val storageBase: String? = null,
) { val dirty get() = savedContent != content }
data class Notice(val text: String, val error: Boolean = false, val id: String = UUID.randomUUID().toString())
data class ExportDocument(val name: String, val content: String, val id: String = UUID.randomUUID().toString(), val mimeType: String = "application/javascript")
data class ImportedScript(val name: String?, val content: String, val deviceId: String?)
data class PendingUpload(val name: String, val content: String, val deviceId: String, val editorId: String? = null)
data class ScreenState(
    val busy: String? = null,
    val progress: TransferProgress? = null,
    val editor: EditorDocument? = null,
    val editorOpen: Boolean = false,
    val homePageRequest: Int = 0,
    val discovering: Boolean = false,
    val search: String = "",
    val notice: Notice? = null,
    val export: ExportDocument? = null,
    val overwrite: PendingUpload? = null,
    val importName: ImportedScript? = null,
)

class SyncViewModel @JvmOverloads constructor(
    application: Application,
    session: SyncSession? = null,
    settingsStore: SyncSettings? = null,
    draftStore: EditorDraftStore? = null,
) : AndroidViewModel(application) {
    private val repository = session ?: SyncRepository(application, viewModelScope)
    private val preferences = settingsStore ?: Preferences(application)
    val link = repository.state
    val settings = preferences.flow.stateIn(viewModelScope, SharingStarted.Eagerly, SyncPreferences())
    private val mutableScreen = MutableStateFlow(ScreenState())
    val screen = mutableScreen.asStateFlow()
    private val drafts = draftStore ?: FileEditorDraftStore(File(application.filesDir, "editor-draft.json"))
    private var draftJob: Job? = null
    private var draftLoaded = false
    private var refreshQueued = false
    private var operation: Job? = null
    private var operationSequence = 0L
    private var discovery: Job? = null
    private var discoverySequence = 0L
    private var autoConnect = true
    private var preferredDeviceId: String? = null
    private var resumeAfterConnect = false

    init {
        viewModelScope.launch { settings.collect { repository.proxyEnabled = it.cloudProxy } }
        viewModelScope.launch { repository.errors.collect { notice(it, true) } }
        viewModelScope.launch {
            repository.deviceChanges.collect { if (autoConnect && draftLoaded) startDiscovery() }
        }
        viewModelScope.launch {
            repository.changes.collect {
                refreshQueued = true
                delay(250)
                if (mutableScreen.value.busy == null && link.value.phase == ConnectionPhase.Ready) refresh()
            }
        }
        val restoring = task("正在恢复工作区") {
            val restored = drafts.read()
            if (restored != null) mutableScreen.update { it.copy(editor = restored.document,
                editorOpen = restored.editorOpen, notice = Notice("已恢复上次未保存的草稿")) }
            draftLoaded = true
        }
        viewModelScope.launch { restoring?.join(); if (draftLoaded) startDiscovery() }
    }

    private fun notice(text: String, error: Boolean = false) { mutableScreen.update { it.copy(notice = Notice(text, error)) } }
    fun dismissNotice() { mutableScreen.update { it.copy(notice = null) } }
    fun search(value: String) { mutableScreen.update { it.copy(search = value) } }
    private fun task(label: String, block: suspend () -> Unit): Job? {
        if (mutableScreen.value.busy != null) return null
        val sequence = ++operationSequence
        mutableScreen.update { it.copy(busy = label, progress = null) }
        val job = viewModelScope.launch(start = CoroutineStart.LAZY) {
            try { block()
            } catch (cancelled: CancellationException) {
                if (cancelled is TimeoutCancellationException) notice("操作超时，请检查小米运动健康及手环连接后重试", true)
                else throw cancelled
            } catch (error: Exception) { notice(error.message ?: "操作失败，请重试", true)
            } finally {
                if (sequence == operationSequence) {
                    mutableScreen.update { it.copy(busy = null, progress = null) }
                    if (refreshQueued && link.value.phase == ConnectionPhase.Ready) {
                        refreshQueued = false
                        refresh()
                    }
                }
            }
        }
        operation = job
        job.start()
        return job
    }
    private fun progress(value: TransferProgress) { mutableScreen.update { it.copy(progress = value) } }
    fun discover() {
        if (!draftLoaded) return
        autoConnect = true
        preferredDeviceId = link.value.device?.id ?: preferredDeviceId
        cancelOperation()
        repository.disconnect()
        startDiscovery()
    }
    private fun startDiscovery() {
        val sequence = ++discoverySequence
        discovery?.cancel()
        if (!autoConnect || link.value.phase != ConnectionPhase.Disconnected) {
            mutableScreen.update { it.copy(discovering = false) }; return
        }
        discovery = viewModelScope.launch {
            mutableScreen.update { it.copy(discovering = true) }
            try {
                repeat(15) {
                    if (link.value.phase != ConnectionPhase.Disconnected) return@launch
                    if (screen.value.busy == null) {
                        repository.discover()
                        val device = link.value.devices.firstOrNull { it.id == preferredDeviceId } ?: link.value.devices.firstOrNull()
                        if (device != null && screen.value.busy == null) { connect(device); return@launch }
                    }
                    if (it < 14) delay(2_000)
                }
                notice("尚未完成握手，请确认设备已连接小米运动健康并打开 JSLab")
            } catch (cancelled: CancellationException) { throw cancelled
            } catch (_: Exception) { notice("握手失败，请检查小米运动健康后重试", true)
            } finally {
                if (sequence == discoverySequence) mutableScreen.update { it.copy(discovering = false) }
            }
        }
    }
    fun connect(device: WearDevice) {
        discovery?.cancel()
        if (screen.value.busy != null) return
        autoConnect = true
        preferredDeviceId = device.id
        task("正在与 JSLab 握手") {
            repository.connect(device)
            val editor = screen.value.editor
            if (resumeAfterConnect && editor != null && (editor.deviceId == null || editor.deviceId == device.id)) {
                mutableScreen.update { it.copy(editorOpen = true) }
                persistDraft(immediate = true)
            }
            resumeAfterConnect = false
            dismissNotice()
        }
    }
    private fun cancelOperation() {
        operationSequence++
        operation?.cancel()
        mutableScreen.update { it.copy(busy = null, progress = null, overwrite = null, importName = null) }
    }
    fun disconnect() {
        autoConnect = false
        discovery?.cancel()
        cancelOperation()
        repository.disconnect()
        notice("已断开同步连接")
    }
    fun refresh() = task("正在刷新脚本") { refreshQueued = false; repository.refresh() }
    fun launchWearApp() = task("正在打开手环应用") { repository.launch(); notice("已请求打开 JSLab") }

    fun create(name: String) {
        if (!validScriptName(name)) { notice("请输入不含路径的 .js 文件名（最多 128 字符）", true); return }
        if (link.value.phase == ConnectionPhase.Ready) {
            task("正在新建 $name") {
                require(link.value.files.none { it.name == name }) { "$name 已存在，新建操作不会覆盖文件" }
                repository.create(name)
                repository.refresh()
                notice("已新建 $name")
            }
        } else if (canReplaceEditor()) {
            mutableScreen.update { it.copy(editor = EditorDocument(name = name, content = ""), editorOpen = true) }
            persistDraft()
        }
    }
    fun open(name: String) {
        val current = screen.value.editor
        if (current?.kind == EditorKind.Script && current.name == name && current.deviceId == link.value.device?.id) { resumeEditor(); return }
        if (!canReplaceEditor()) return
        task("正在读取 $name") {
            val device = link.value.device?.id
            val content = repository.read(name, ::progress)
            mutableScreen.update { it.copy(editor = EditorDocument(name = name, content = content, savedContent = content, deviceId = device, remoteExists = true), editorOpen = true) }
            persistDraft()
        }
    }
    private fun canReplaceEditor(): Boolean {
        if (screen.value.editor?.dirty != true) return true
        notice("已有未保存的草稿，请先继续编辑、保存或放弃该草稿", true)
        return false
    }
    fun openStorage(name: String, reload: Boolean = false) {
        if (!link.value.scriptStorageSupported) { notice("当前手环不支持编辑脚本数据，请升级 JSLab", true); return }
        val current = screen.value.editor
        if (!reload && current?.kind == EditorKind.ScriptData && current.name == name && current.deviceId == link.value.device?.id) { resumeEditor(); return }
        if (!reload && !canReplaceEditor()) return
        task("正在读取脚本数据") {
            val device = link.value.device?.id
            require(device != null && (!reload || current?.deviceId == device)) { "设备连接已变化，请重新操作" }
            val base = repository.readStorage(name, ::progress)
            require(link.value.device?.id == device && link.value.phase == ConnectionPhase.Ready) { "设备连接已变化，请重新操作" }
            val content = validateStorageDocument(base).toString(2)
            mutableScreen.update { it.copy(editor = EditorDocument(name = name, content = content, savedContent = content,
                deviceId = device, remoteExists = true, kind = EditorKind.ScriptData, storageBase = base), editorOpen = true) }
            persistDraft()
        }
    }
    fun edit(content: String) { mutableScreen.update { it.copy(editor = it.editor?.copy(content = content)) }; persistDraft() }
    fun closeEditor() {
        resumeAfterConnect = false
        mutableScreen.update { it.copy(editor = null, editorOpen = false, overwrite = null) }
        persistDraft(immediate = true)
    }
    fun parkEditor(retryHandshake: Boolean = false) {
        if (screen.value.editor == null) return
        if (screen.value.busy != null) {
            if (!retryHandshake) return
            cancelOperation()
            repository.disconnect()
        }
        resumeAfterConnect = retryHandshake
        if (retryHandshake) {
            autoConnect = true
            preferredDeviceId = screen.value.editor?.deviceId ?: preferredDeviceId
        }
        mutableScreen.update { it.copy(editorOpen = false, overwrite = null,
            homePageRequest = it.homePageRequest + if (retryHandshake) 1 else 0) }
        persistDraft(immediate = true)
        if (retryHandshake) {
            val owner = screen.value.editor?.deviceId
            if (owner != null && link.value.device?.id != owner) repository.disconnect()
            if (link.value.phase != ConnectionPhase.Ready) startDiscovery()
        }
    }
    fun resumeEditor() {
        if (screen.value.editor != null && screen.value.busy == null) {
            mutableScreen.update { it.copy(editorOpen = true) }
            persistDraft(immediate = true)
        }
    }
    fun save() {
        val editor = screen.value.editor ?: return
        if (link.value.phase != ConnectionPhase.Ready) { notice("请先保留草稿并返回首页完成握手", true); return }
        if (editor.deviceId != null && editor.deviceId != link.value.device?.id) {
            notice("此草稿属于另一台设备，请在小米运动健康中切换回原设备，或先导出到手机", true); return
        }
        if (editor.kind == EditorKind.ScriptData) {
            if (!link.value.scriptStorageSupported) { notice("当前手环不支持编辑脚本数据，请升级 JSLab", true); return }
            task("正在保存脚本数据") {
                require(editor.deviceId != null) { "缺少草稿所属设备，请重新读取" }
                val base = editor.storageBase ?: error("缺少原始数据，请重新读取")
                validateStorageDocument(editor.content)
                repository.writeStorage(editor.name, base, editor.content, ::progress)
                require(link.value.device?.id == editor.deviceId && link.value.phase == ConnectionPhase.Ready) { "设备连接已变化，请重新操作" }
                mutableScreen.update { state -> state.copy(editor = state.editor?.let {
                    if (it.id == editor.id) it.copy(savedContent = editor.content, storageBase = editor.content) else it
                }) }
                persistDraft()
                notice("脚本数据已保存到穿戴设备")
            }
            return
        }
        val upload = PendingUpload(editor.name, editor.content, link.value.device!!.id, editor.id)
        if (!editor.remoteExists && link.value.files.any { it.name == editor.name }) {
            mutableScreen.update { it.copy(overwrite = upload) }
        } else task("正在保存 ${editor.name}") { upload(upload, editor.remoteExists) }
    }
    fun dismissOverwrite() { mutableScreen.update { it.copy(overwrite = null) } }
    fun confirmOverwrite() {
        val document = screen.value.overwrite ?: return
        dismissOverwrite()
        task("正在上传 ${document.name}") { upload(document, true) }
    }
    private suspend fun upload(document: PendingUpload, overwrite: Boolean) {
        require(link.value.device?.id == document.deviceId && link.value.phase == ConnectionPhase.Ready) { "设备连接已变化，请重新操作" }
        repository.write(document.name, document.content, overwrite, ::progress)
        mutableScreen.update { state -> state.copy(editor = state.editor?.let {
            if (it.id == document.editorId) it.copy(savedContent = document.content, remoteExists = true, deviceId = document.deviceId) else it
        }) }
        persistDraft()
        notice(if (document.editorId == null) "已上传 ${document.name}" else "已保存到穿戴设备")
        repository.refresh()
    }
    fun canRename(name: String): Boolean {
        val editor = screen.value.editor
        if (screen.value.editorOpen && editor?.name == name && editor.deviceId != null && editor.deviceId != link.value.device?.id) {
            notice("请在小米运动健康中切换回此草稿所属的设备", true); return false
        }
        if (editor?.name == name && editor.deviceId == link.value.device?.id && editor.dirty) {
            notice("请先保存当前更改，再重命名文件", true); return false
        }
        return true
    }
    fun rename(name: String, newName: String, expectedDeviceId: String? = link.value.device?.id) = task("正在重命名") {
        require(expectedDeviceId != null && link.value.device?.id == expectedDeviceId) { "设备连接已变化，请重新操作" }
        require(canRename(name)) { "请先保存当前更改，再重命名文件" }
        if (name == newName) { notice("文件名未更改"); return@task }
        require(link.value.files.none { it.name == newName }) { "$newName 已存在，重命名操作不会覆盖文件" }
        repository.rename(name, newName)
        if (screen.value.editor?.name == name && screen.value.editor?.deviceId == link.value.device?.id) closeEditor()
        repository.refresh()
        notice("已重命名为 $newName")
    }
    fun delete(name: String, expectedDeviceId: String? = link.value.device?.id) = task("正在删除 $name") {
        require(expectedDeviceId != null && link.value.device?.id == expectedDeviceId) { "设备连接已变化，请重新操作" }
        repository.delete(name)
        if (screen.value.editor?.name == name && screen.value.editor?.deviceId == link.value.device?.id) closeEditor()
        repository.refresh(); notice("已删除 $name")
    }

    fun import(uri: Uri) = task("正在导入脚本") {
        check(canReplaceEditor()) { "请先处理已保留的草稿" }
        val target = link.value.device?.id.takeIf { link.value.phase == ConnectionPhase.Ready }
        val document = withContext(Dispatchers.IO) {
            val resolver = getApplication<Application>().contentResolver
            val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
                val column = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (it.moveToFirst() && column >= 0) it.getString(column) else null
            }
            val content = resolver.openInputStream(uri)?.use { decodeUtf8(it.readBytes()) }
                ?: throw IllegalArgumentException("无法读取文件")
            ImportedScript(name, content, target)
        }
        acceptImport(document)
    }
    internal suspend fun acceptImport(document: ImportedScript) {
        check(canReplaceEditor()) { "请先处理已保留的草稿" }
        val name = document.name
        if (name == null || !validScriptName(name)) {
            mutableScreen.update { it.copy(importName = document) }; return
        }
        if (document.deviceId == null) {
            mutableScreen.update { it.copy(editor = EditorDocument(name = name, content = document.content), editorOpen = true) }
            persistDraft()
            notice("已导入草稿，握手成功后可保存到设备")
        } else {
            check(link.value.device?.id == document.deviceId) { "设备连接已变化，请重新导入" }
            val upload = PendingUpload(name, document.content, document.deviceId)
            if (link.value.files.any { it.name == name }) mutableScreen.update { it.copy(overwrite = upload) }
            else upload(upload, false)
        }
    }
    fun dismissImportName() { mutableScreen.update { it.copy(importName = null) } }
    fun nameImport(name: String) {
        val document = screen.value.importName ?: return
        if (!validScriptName(name)) return
        dismissImportName()
        task("正在导入 $name") { acceptImport(document.copy(name = name)) }
    }
    fun export(name: String) = task("正在准备导出") {
        val content = repository.read(name, ::progress)
        mutableScreen.update { it.copy(export = ExportDocument(name, content)) }
    }
    fun exportEditor() = task("正在准备导出") {
        val editor = screen.value.editor ?: return@task
        mutableScreen.update { it.copy(export = if (editor.kind == EditorKind.ScriptData)
            ExportDocument(editor.name + ".data.json", editor.content, mimeType = "application/json") else ExportDocument(editor.name, editor.content)) }
    }
    fun finishExport(uri: Uri?) {
        val document = screen.value.export ?: return
        mutableScreen.update { it.copy(export = null) }
        if (uri == null) return
        task("正在导出到手机") {
            withContext(Dispatchers.IO) {
                getApplication<Application>().contentResolver.openOutputStream(uri, "wt")?.use {
                    it.write(document.content.toByteArray(Charsets.UTF_8))
                } ?: throw IllegalArgumentException("无法写入所选位置")
            }
            notice("已导出 ${document.name}")
        }
    }
    fun setTheme(value: ThemeMode) { viewModelScope.launch { preferences.theme(value) } }
    fun setProxy(enabled: Boolean) { viewModelScope.launch { preferences.proxy(enabled) } }
    fun fontsComingSoon() = notice("字体更换即将上线")

    fun flushDraft() { if (draftLoaded) persistDraft(immediate = true) }

    private fun persistDraft(immediate: Boolean = false) {
        draftJob?.cancel()
        val editor = screen.value.editor
        val savedDraft = editor?.takeIf { it.dirty }?.let { SavedEditorDraft(it, screen.value.editorOpen) }
        draftJob = viewModelScope.launch {
            if (!immediate) delay(350)
            try {
                drafts.write(savedDraft)
            } catch (cancelled: CancellationException) { throw cancelled
            } catch (_: Exception) {
                notice("手机草稿保存失败，请先导出脚本以保留修改", true)
            }
        }
    }

    override fun onCleared() { repository.close(); super.onCleared() }
}

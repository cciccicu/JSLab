package icu.ccicc.jslab.sync.ui

import android.content.ActivityNotFoundException
import android.content.Intent
import androidx.core.net.toUri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import icu.ccicc.jslab.sync.*
import icu.ccicc.jslab.sync.data.*
import icu.ccicc.jslab.sync.protocol.*
import java.text.DateFormat
import java.util.Date
import java.util.Locale

private val PanelShape = RoundedCornerShape(24.dp)
private enum class Destination(val title: String, val icon: ImageVector) {
    Workspace("首页", Icons.Outlined.Home),
    Settings("设置", Icons.Outlined.Tune),
}
private sealed interface FileDialog {
    data object Create : FileDialog
    data class Rename(val file: ScriptFile, val deviceId: String?) : FileDialog
    data class Delete(val file: ScriptFile, val dirty: Boolean = false, val deviceId: String?) : FileDialog
    data object ImportName : FileDialog
}

@Composable
fun SyncApp(model: SyncViewModel) {
    val state by model.screen.collectAsStateWithLifecycle()
    val link by model.link.collectAsStateWithLifecycle()
    val settings by model.settings.collectAsStateWithLifecycle()
    SyncTheme(settings.theme) {
        val editorStateHolder = rememberSaveableStateHolder()
        val editorId = state.editor?.id
        DisposableEffect(editorId) { onDispose { editorId?.let(editorStateHolder::removeState) } }
        var destination by rememberSaveable { mutableIntStateOf(0) }
        val currentDestination = Destination.entries.getOrElse(destination) { Destination.Workspace }
        var dialog by remember { mutableStateOf<FileDialog?>(null) }
        var discard by remember { mutableStateOf(false) }
        LaunchedEffect(state.homePageRequest) { if (state.homePageRequest > 0) destination = 0 }
        val importFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(model::import) }
        val exportFile = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/javascript"), model::finishExport)
        val exportData = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json"), model::finishExport)
        LaunchedEffect(state.export?.id) { state.export?.let { if (it.mimeType == "application/json") exportData.launch(it.name) else exportFile.launch(it.name) } }
        var reloadData by remember { mutableStateOf(false) }
        val closeEditor = { if (state.busy == null) { if (state.editor?.dirty == true) discard = true else model.closeEditor() } }
        BackHandler(enabled = state.editor != null && state.editorOpen) { closeEditor() }
        fun rename(file: ScriptFile, deviceId: String? = link.device?.id) { if (model.canRename(file.name)) dialog = FileDialog.Rename(file, deviceId) }
        fun delete(file: ScriptFile, deviceId: String? = link.device?.id) {
            val editor = state.editor
            dialog = FileDialog.Delete(file, editor?.name == file.name && editor.deviceId == deviceId && editor.dirty, deviceId)
        }
        if (state.editor != null && state.editorOpen) {
            editorStateHolder.SaveableStateProvider(state.editor!!.id) {
            EditorScreen(state, link, onEdit = model::edit, onBack = closeEditor, onSave = model::save,
                onExport = { model.exportEditor() }, onDismissNotice = model::dismissNotice,
                onHandshake = { model.parkEditor(retryHandshake = true) },
                onStorage = { state.editor?.let { model.openStorage(it.name) } },
                onReloadStorage = { state.editor?.let { if (it.dirty) reloadData = true else model.openStorage(it.name, reload = true) } },
                onRename = { state.editor?.let { rename(ScriptFile(it.name, it.content.toByteArray().size.toLong()), it.deviceId) } },
                onDelete = { state.editor?.let { delete(ScriptFile(it.name, it.content.toByteArray().size.toLong()), it.deviceId) } })
            }
        } else {
            BoxWithConstraints(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
                val wide = maxWidth >= 840.dp
                Row(Modifier.fillMaxSize()) {
                    if (wide) NavigationRail(containerColor = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxHeight().statusBarsPadding()) {
                        Spacer(Modifier.height(24.dp))
                        Destination.entries.forEachIndexed { index, entry ->
                            NavigationRailItem(selected = currentDestination == entry, onClick = { destination = index },
                                icon = { Icon(entry.icon, entry.title) }, label = { Text(entry.title) })
                        }
                    }
                    Scaffold(
                        modifier = Modifier.weight(1f),
                        containerColor = MaterialTheme.colorScheme.background,
                        bottomBar = {
                            if (!wide) BottomNavigation(currentDestination.ordinal) { destination = it }
                        },
                    ) { padding ->
                        Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.TopCenter) {
                            Column(Modifier.widthIn(max = 900.dp).fillMaxSize()) {
                                Header(if (currentDestination == Destination.Workspace) "JSLab Sync" else currentDestination.title)
                                NoticeBar(state.notice, model::dismissNotice)
                                if (link.phase != ConnectionPhase.Connecting) BusyBar(state)
                                when (currentDestination) {
                                    Destination.Workspace -> WorkspaceScreen(state, link,
                                        onRetryHandshake = model::discover, onRefresh = model::refresh, onSearch = model::search,
                                        onCreate = { dialog = FileDialog.Create }, onImport = { importFile.launch(arrayOf("*/*")) },
                                        onOpen = model::open, onRename = { rename(it) },
                                        onDelete = { delete(it) }, onExport = { model.export(it.name) }, onResumeDraft = model::resumeEditor,
                                        onStorage = { model.openStorage(it) })
                                    Destination.Settings -> SettingsScreen(settings, model::setTheme, model::setProxy, model::fontsComingSoon)
                                }
                            }
                        }
                    }
                }
            }
        }
        if (reloadData) AlertDialog(onDismissRequest = { reloadData = false }, title = { Text("重新读取脚本数据？") },
            text = { Text("当前编辑内容会被设备上的最新数据替换。请先导出需要保留的修改。") },
            confirmButton = { TextButton(onClick = { reloadData = false; state.editor?.let { model.openStorage(it.name, reload = true) } }) { Text("重新读取") } },
            dismissButton = { TextButton(onClick = { reloadData = false }) { Text("取消") } })
        if (dialog != null) FileActionDialog(dialog!!, onDismiss = { dialog = null }) { value ->
            when (val action = dialog) {
                FileDialog.Create -> model.create(value)
                is FileDialog.Rename -> model.rename(action.file.name, value, action.deviceId)
                is FileDialog.Delete -> model.delete(action.file.name, action.deviceId)
                FileDialog.ImportName -> model.nameImport(value)
                null -> Unit
            }
            dialog = null
        }
        if (discard) AlertDialog(onDismissRequest = { discard = false },
            icon = { Icon(Icons.Outlined.EditNote, null) }, title = { Text("有未保存的修改") },
            text = { Text("修改尚未保存到设备，可保留为手机草稿，稍后继续编辑。") },
            confirmButton = { TextButton(onClick = {
                discard = false; model.parkEditor(retryHandshake = link.phase != ConnectionPhase.Ready)
            }) { Text("保留并返回") } },
            dismissButton = { Column {
                TextButton(onClick = { discard = false }) { Text("继续编辑") }
                TextButton(onClick = { discard = false; model.closeEditor() }) { Text("放弃修改", color = MaterialTheme.colorScheme.error) }
            } })
        if (state.overwrite != null) AlertDialog(onDismissRequest = model::dismissOverwrite,
            title = { Text("覆盖同名脚本？") },
            text = { Text("设备上已存在 ${state.overwrite!!.name}，是否覆盖？") },
            confirmButton = { TextButton(onClick = model::confirmOverwrite) { Text("确认覆盖") } },
            dismissButton = { TextButton(onClick = model::dismissOverwrite) { Text("取消") } })
        if (state.importName != null) FileActionDialog(FileDialog.ImportName, model::dismissImportName, model::nameImport)
    }
}

@Composable
internal fun Header(title: String) {
    Text(title, Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 18.dp),
        style = MaterialTheme.typography.titleLarge)
}

@Composable
internal fun BottomNavigation(selected: Int, onSelect: (Int) -> Unit) {
    NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
        Destination.entries.forEachIndexed { index, entry ->
            NavigationBarItem(selected = selected == index, onClick = { onSelect(index) },
                icon = { Icon(entry.icon, entry.title) }, label = { Text(entry.title) })
        }
    }
}

@Composable
internal fun NoticeBar(notice: Notice?, onDismiss: () -> Unit) {
    if (notice == null) return
    val colors = MaterialTheme.colorScheme
    Surface(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 4.dp),
        shape = RoundedCornerShape(16.dp), color = if (notice.error) colors.errorContainer else colors.primaryContainer) {
        Row(Modifier.padding(start = 14.dp, top = 6.dp, bottom = 6.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(if (notice.error) Icons.Outlined.ErrorOutline else Icons.Outlined.CheckCircle, null, modifier = Modifier.size(18.dp))
            Text(notice.text, Modifier.weight(1f).padding(horizontal = 10.dp), style = MaterialTheme.typography.bodyMedium)
            IconButton(onClick = onDismiss) { Icon(Icons.Outlined.Close, "关闭提示", Modifier.size(18.dp)) }
        }
    }
}

@Composable
internal fun BusyBar(state: ScreenState) {
    if (state.busy == null) return
    Column(Modifier.padding(horizontal = 24.dp, vertical = 8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(state.progress?.label ?: state.busy, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            state.progress?.let { Text("${(it.fraction * 100).toInt()}%", style = MaterialTheme.typography.bodyMedium) }
        }
        Spacer(Modifier.height(8.dp))
        val progress = state.progress
        if (progress == null) LinearProgressIndicator(Modifier.fillMaxWidth())
        else LinearProgressIndicator(progress = { progress.fraction }, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
internal fun WorkspaceScreen(state: ScreenState, link: LinkState, onRetryHandshake: () -> Unit, onRefresh: () -> Unit,
    onSearch: (String) -> Unit, onCreate: () -> Unit, onImport: () -> Unit, onOpen: (String) -> Unit,
    onRename: (ScriptFile) -> Unit, onDelete: (ScriptFile) -> Unit, onExport: (ScriptFile) -> Unit,
    onResumeDraft: () -> Unit = {}, onStorage: (String) -> Unit = {}) {
    val ready = link.phase == ConnectionPhase.Ready
    val available = ready && state.busy == null
    val files = link.files.filter { it.name.contains(state.search, ignoreCase = true) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 24.dp, end = 24.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item { HandshakeStatus(state, link, onRetryHandshake) }
        if (state.editor != null && !state.editorOpen) item { DraftCard(state.editor, onResumeDraft) }
        if (!ready) item {
            Panel {
                Text("使用步骤", style = MaterialTheme.typography.titleMedium)
                SetupStep("01", "连接设备", "在小米运动健康中配对并连接手环或手表。")
                SetupStep("02", "打开 JSLab", "在手环或手表上安装并打开 JSLab。")
                SetupStep("03", "确认授权", "首次使用时，按小米运动健康提示允许设备管理。")
                Text("握手成功后会自动显示脚本。也可先新建或导入手机草稿。",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = onCreate, enabled = state.busy == null, shape = RoundedCornerShape(16.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 12.dp),
                    modifier = Modifier.weight(1f).heightIn(min = 52.dp)) {
                    Icon(Icons.Outlined.Add, null, Modifier.size(20.dp)); Spacer(Modifier.width(6.dp))
                    Text(if (ready) "新建脚本" else "新建草稿", maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                OutlinedButton(onClick = onImport, enabled = state.busy == null, shape = RoundedCornerShape(16.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 12.dp),
                    modifier = Modifier.weight(1f).heightIn(min = 52.dp)) {
                    Icon(Icons.Outlined.FileUpload, null, Modifier.size(20.dp)); Spacer(Modifier.width(6.dp))
                    Text(if (ready) "上传脚本" else "导入草稿", maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        if (ready) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("脚本", style = MaterialTheme.typography.titleLarge)
                        Text("${link.files.size} 个脚本" + (link.syncedAt?.let {
                            " · ${DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(it))} 刷新"
                        } ?: ""), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = onRefresh, enabled = available) { Icon(Icons.Outlined.Refresh, "刷新脚本") }
                }
            }
            if (link.files.isNotEmpty()) item {
                OutlinedTextField(value = state.search, onValueChange = onSearch, modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("搜索脚本名称") }, leadingIcon = { Icon(Icons.Outlined.Search, null) },
                    singleLine = true, shape = RoundedCornerShape(16.dp))
            }
            if (files.isEmpty()) item {
                EmptyCard(Icons.Outlined.DataObject,
                    if (state.search.isNotEmpty()) "没有找到匹配的脚本" else "暂无脚本",
                    if (state.search.isNotEmpty()) "请尝试其他关键词。" else "点击上方按钮新建或上传脚本。")
            }
            items(files, key = { it.name }) { file -> ScriptRow(file, available, onOpen, onRename, onDelete, onExport,
                link.scriptStorageSupported, onStorage) }
        }
    }
}

@Composable
private fun HandshakeStatus(state: ScreenState, link: LinkState, onRetry: () -> Unit) {
    val ready = link.phase == ConnectionPhase.Ready
    val colors = MaterialTheme.colorScheme
    Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp), color = colors.surface,
        border = BorderStroke(1.dp, colors.outlineVariant)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (!ready && (state.discovering || link.phase == ConnectionPhase.Connecting)) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            } else Box(Modifier.size(8.dp).background(if (ready) Success else colors.outline, CircleShape))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(if (ready) "握手成功" else "等待握手", style = MaterialTheme.typography.titleMedium)
                Text(if (ready) link.device?.name ?: "JSLab 已就绪"
                    else if (link.phase == ConnectionPhase.Connecting) "正在与设备上的 JSLab 握手…"
                    else "设备连接由小米运动健康管理。",
                    style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
            if (!ready) TextButton(onClick = onRetry, enabled = !state.discovering || link.phase == ConnectionPhase.Connecting,
                contentPadding = PaddingValues(horizontal = 8.dp)) { Text("重试握手", maxLines = 1) }
        }
    }
}

@Composable
private fun ScriptRow(file: ScriptFile, enabled: Boolean, onOpen: (String) -> Unit, onRename: (ScriptFile) -> Unit,
    onDelete: (ScriptFile) -> Unit, onExport: (ScriptFile) -> Unit, storageSupported: Boolean, onStorage: (String) -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Surface(onClick = { onOpen(file.name) }, enabled = enabled, shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surface, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, top = 12.dp, bottom = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                Text("JS", color = MaterialTheme.colorScheme.primary, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
            }
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(file.name, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("${formatSize(file.size)}  ·  JavaScript", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Box {
                IconButton(onClick = { menu = true }, enabled = enabled) { Icon(Icons.Outlined.MoreHoriz, "${file.name} 的更多操作") }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text(if (storageSupported) "编辑脚本数据" else "脚本数据（需更新手环）") },
                        enabled = storageSupported, leadingIcon = { Icon(Icons.Outlined.Storage, null) },
                        onClick = { menu = false; onStorage(file.name) })
                    DropdownMenuItem(text = { Text("导出到手机") }, leadingIcon = { Icon(Icons.Outlined.FileDownload, null) }, onClick = { menu = false; onExport(file) })
                    DropdownMenuItem(text = { Text("重命名") }, leadingIcon = { Icon(Icons.Outlined.DriveFileRenameOutline, null) }, onClick = { menu = false; onRename(file) })
                    DropdownMenuItem(text = { Text("删除", color = MaterialTheme.colorScheme.error) }, leadingIcon = { Icon(Icons.Outlined.DeleteOutline, null) }, onClick = { menu = false; onDelete(file) })
                }
            }
        }
    }
}

@Composable
private fun EmptyCard(icon: ImageVector, title: String, description: String) {
    Surface(Modifier.fillMaxWidth(), shape = PanelShape, color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(horizontal = 24.dp, vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, null, Modifier.size(36.dp), tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(16.dp))
            Text(title, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            Text(description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun DraftCard(document: EditorDocument, onResume: () -> Unit) {
    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.EditNote, null, tint = MaterialTheme.colorScheme.primary)
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(if (document.kind == EditorKind.ScriptData) "脚本数据草稿" else "本地草稿", style = MaterialTheme.typography.titleMedium)
                Text(document.name, style = MaterialTheme.typography.bodyMedium, maxLines = 2,
                    overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            TextButton(onClick = onResume) { Text("继续编辑") }
        }
    }
}

@Composable
private fun SetupStep(number: String, title: String, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(number, color = MaterialTheme.colorScheme.primary, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.titleMedium)
        Column {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SettingsScreen(settings: SyncPreferences, onTheme: (ThemeMode) -> Unit, onProxy: (Boolean) -> Unit,
    onFonts: () -> Unit = {}) {
    val context = LocalContext.current
    var openError by remember { mutableStateOf(false) }
    fun browse(url: String) {
        try { context.startActivity(Intent(Intent.ACTION_VIEW, url.toUri())) }
        catch (_: ActivityNotFoundException) { openError = true }
    }
    LazyColumn(contentPadding = PaddingValues(start = 24.dp, end = 24.dp, bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        item {
            Panel {
                Text("JSLab Sync", style = MaterialTheme.typography.titleLarge)
                Text("JSLab 脚本同步器", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            Panel {
                Text("外观", style = MaterialTheme.typography.titleMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ThemeMode.entries.forEach { mode -> FilterChip(selected = settings.theme == mode, onClick = { onTheme(mode) },
                        label = { Text(when (mode) { ThemeMode.System -> "跟随系统"; ThemeMode.Light -> "浅色"; ThemeMode.Dark -> "深色" }) }) }
                }
            }
        }
        item {
            Panel {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.CloudSync, null, tint = MaterialTheme.colorScheme.primary)
                    Text("云端转发", Modifier.weight(1f).padding(start = 12.dp), style = MaterialTheme.typography.titleMedium)
                    Switch(checked = settings.cloudProxy, onCheckedChange = onProxy)
                }
                Text("连接期间，通过手机网络访问设备中配置的 JSLab 云端。", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
            }
        }
        item {
            Panel {
                Text("使用与帮助", style = MaterialTheme.typography.titleMedium)
                SettingsLink("字体更换", "即将上线", Icons.Outlined.FontDownload, onFonts)
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                SettingsLink("JSLab 使用文档", "查看脚本与云端功能说明", Icons.AutoMirrored.Outlined.MenuBook) { browse("https://ccicc.icu/jslab-cloud/docs") }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                SettingsLink("ccicc.icu", "访问官网", Icons.AutoMirrored.Outlined.OpenInNew) { browse("https://ccicc.icu") }
            }
        }
        item {
            Text("JSLab Sync ${BuildConfig.VERSION_NAME}\nccicc.icu", modifier = Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    if (openError) AlertDialog(onDismissRequest = { openError = false }, title = { Text("无法打开链接") },
        text = { Text("请在手机上安装或启用浏览器后重试。") }, confirmButton = { TextButton(onClick = { openError = false }) { Text("知道了") } })
}

@Composable
private fun SettingsLink(title: String, caption: String, icon: ImageVector, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(caption, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(Icons.Outlined.ChevronRight, null, Modifier.size(18.dp))
    }
}

@Composable
private fun Panel(content: @Composable ColumnScope.() -> Unit) {
    Surface(Modifier.fillMaxWidth(), shape = PanelShape, color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp), content = content)
    }
}

@Composable
private fun FileActionDialog(action: FileDialog, onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    val initial = if (action is FileDialog.Rename) action.file.name else ""
    var name by remember(action) { mutableStateOf(initial) }
    val deletion = action is FileDialog.Delete
    AlertDialog(onDismissRequest = onDismiss,
        title = { Text(when (action) { FileDialog.Create -> "新建脚本"; is FileDialog.Rename -> "重命名脚本"; is FileDialog.Delete -> "删除脚本？"; FileDialog.ImportName -> "输入脚本文件名" }) },
        text = {
            if (action is FileDialog.Delete) Text("${action.file.name} 将从穿戴设备中删除，此操作无法撤销。" + if (action.dirty) "当前未保存的草稿也会被放弃。" else "")
            else OutlinedTextField(value = name, onValueChange = { name = it }, singleLine = true,
                label = { Text("文件名") }, placeholder = { Text("hello.js") }, supportingText = { Text("使用 .js 后缀，最多 128 字符") },
                isError = name.isNotEmpty() && !validScriptName(name), shape = RoundedCornerShape(14.dp))
        },
        confirmButton = { TextButton(onClick = { onConfirm(name) }, enabled = deletion || validScriptName(name)) {
            Text(if (deletion) "确认删除" else "确定", color = if (deletion) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
        } }, dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } })
}

internal fun formatSize(bytes: Long): String = when {
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> String.format(Locale.ROOT, "%.1f KB", bytes / 1024.0)
    else -> String.format(Locale.ROOT, "%.2f MB", bytes / (1024.0 * 1024))
}

@Preview(name = "工作台 · 浅色", showBackground = true, widthDp = 412, heightDp = 915)
@Composable
fun WorkspacePreview() {
    SyncTheme(ThemeMode.Light) {
        Scaffold(containerColor = MaterialTheme.colorScheme.background, bottomBar = { BottomNavigation(0) {} }) { padding ->
            Column(Modifier.padding(padding)) {
                Header("JSLab Sync")
                WorkspaceScreen(ScreenState(), LinkState(device = WearDevice("preview", "Xiaomi Smart Band 9 Pro"),
                    phase = ConnectionPhase.Ready, syncedAt = 1792646400000, files = listOf(ScriptFile("hello.js", 1024), ScriptFile("clock.ui.js", 4608))),
                    {}, {}, {}, {}, {}, {}, {}, {}, {})
            }
        }
    }
}

@Preview(name = "工作台 · 深色", showBackground = true, widthDp = 412, heightDp = 915)
@Composable
fun DarkWorkspacePreview() {
    SyncTheme(ThemeMode.Dark) { Scaffold(containerColor = MaterialTheme.colorScheme.background, bottomBar = { BottomNavigation(0) {} }) { padding -> Column(Modifier.padding(padding)) {
        Header("JSLab Sync")
        WorkspaceScreen(ScreenState(), LinkState(), {}, {}, {}, {}, {}, {}, {}, {}, {})
    } } }
}

package icu.ccicc.jslab.sync.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import icu.ccicc.jslab.sync.ScreenState
import icu.ccicc.jslab.sync.EditorKind
import icu.ccicc.jslab.sync.data.ConnectionPhase
import icu.ccicc.jslab.sync.data.LinkState
import icu.ccicc.jslab.sync.ui.editor.JavaScriptEditorController
import io.github.rosemoe.sora.widget.CodeEditor

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun EditorScreen(state: ScreenState, link: LinkState, onEdit: (String) -> Unit,
    onBack: () -> Unit, onSave: () -> Unit, onExport: () -> Unit, onDismissNotice: () -> Unit,
    onHandshake: () -> Unit = {}, onRename: () -> Unit = {}, onDelete: () -> Unit = {},
    onStorage: () -> Unit = {}, onReloadStorage: () -> Unit = {}) {
    val document = state.editor ?: return
    val storageEditor = document.kind == EditorKind.ScriptData
    val controller = rememberSaveable(document.id, saver = JavaScriptEditorController.Saver) { JavaScriptEditorController(document.content) }
    val status = controller.status
    val latestOnEdit by rememberUpdatedState(onEdit)
    val colors = MaterialTheme.colorScheme
    val dark = colors.surface.luminance() < .5f
    val preview = LocalInspectionMode.current
    val busy = state.busy != null
    val ready = link.phase == ConnectionPhase.Ready
    val correctDevice = document.deviceId == null || document.deviceId == link.device?.id
    var menu by remember { mutableStateOf(false) }
    var searchOpen by rememberSaveable(document.id) { mutableStateOf(false) }
    var query by rememberSaveable(document.id) { mutableStateOf("") }
    var replacement by rememberSaveable(document.id) { mutableStateOf("") }
    var matchCase by rememberSaveable(document.id) { mutableStateOf(false) }
    var replaceOpen by rememberSaveable(document.id) { mutableStateOf(false) }
    var goToLine by remember { mutableStateOf(false) }
    var licenses by remember { mutableStateOf(false) }
    BackHandler(enabled = searchOpen) { searchOpen = false }
    LaunchedEffect(controller, searchOpen, query, matchCase) { controller.search(if (searchOpen) query else "", matchCase) }

    Scaffold(containerColor = colors.background, modifier = Modifier.imePadding(),
        topBar = {
            TopAppBar(colors = TopAppBarDefaults.topAppBarColors(containerColor = colors.background),
                title = {
                    Column {
                        Text(document.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text((if (storageEditor) "数据 · " else "") + if (document.dirty) "未保存" else "已保存", color = colors.onSurfaceVariant, style = MaterialTheme.typography.bodySmall,
                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                },
                navigationIcon = { IconButton(onClick = onBack, enabled = !busy) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回首页") } },
                actions = {
                    IconButton(onClick = { searchOpen = !searchOpen }) { Icon(Icons.Outlined.Search, "查找与替换") }
                    TextButton(onClick = onSave, enabled = !busy && ready && correctDevice && (!storageEditor || link.scriptStorageSupported)) { Text("保存") }
                    Box {
                        IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "编辑器操作") }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            DropdownMenuItem(text = { Text("导出到手机") }, enabled = !busy,
                                leadingIcon = { Icon(Icons.Outlined.FileDownload, null) }, onClick = { menu = false; onExport() })
                            DropdownMenuItem(text = { Text("跳转到行") }, onClick = { menu = false; goToLine = true })
                            DropdownMenuItem(text = { Text("自动换行") }, trailingIcon = { Checkbox(checked = controller.wordWrap, onCheckedChange = null) },
                                onClick = { controller.toggleWordWrap() })
                            HorizontalDivider()
                            DropdownMenuItem(text = { Text(if (storageEditor) "重新读取数据" else if (link.scriptStorageSupported) "编辑脚本数据" else "脚本数据（需更新手环）") },
                                enabled = !busy && ready && correctDevice && document.remoteExists && link.scriptStorageSupported,
                                onClick = { menu = false; if (storageEditor) onReloadStorage() else onStorage() })
                            if (!storageEditor) {
                            DropdownMenuItem(text = { Text("重命名") }, enabled = !busy && ready && correctDevice && document.remoteExists,
                                onClick = { menu = false; onRename() })
                            DropdownMenuItem(text = { Text("删除", color = colors.error) }, enabled = !busy && ready && correctDevice && document.remoteExists,
                                onClick = { menu = false; onDelete() })
                            }
                            HorizontalDivider()
                            DropdownMenuItem(text = { Text("返回首页") }, onClick = { menu = false; onHandshake() })
                            DropdownMenuItem(text = { Text("开源许可") }, onClick = { menu = false; licenses = true })
                        }
                    }
                })
        },
        bottomBar = { EditorToolbar(controller, busy, onGoToLine = { goToLine = true }) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            NoticeBar(state.notice, onDismissNotice)
            BusyBar(state)
            if (storageEditor) Text("以 JSON 编辑 data 和 config 两个对象。保存时会检查设备数据是否已变化，冲突时保留当前修改。",
                Modifier.padding(horizontal = 16.dp, vertical = 8.dp), style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
            if (!ready || !correctDevice) Surface(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), color = colors.primaryContainer, shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Text(if (!correctDevice && ready) "此草稿属于另一台设备，请在小米运动健康中切换回原设备。" else "当前为本地草稿，握手成功后可保存到设备。", style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = onHandshake) { Text("保留草稿并返回首页") }
                }
            }
            if (searchOpen) SearchPanel(query, { query = it }, replacement, { replacement = it }, matchCase,
                onMatchCase = { matchCase = !matchCase }, replaceOpen, onToggleReplace = { replaceOpen = !replaceOpen },
                controller, busy, onClose = { searchOpen = false })
            key(document.id) {
                AndroidView(
                    modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp).clip(RoundedCornerShape(12.dp)),
                    factory = { context -> CodeEditor(context).also { controller.attach(it, document.content, dark, onEdit = { text -> latestOnEdit(text) }, preview = preview) } },
                    onRelease = controller::detach,
                    update = { controller.applyTheme(dark); controller.setReadOnly(busy) },
                )
            }
        }
    }
    if (goToLine) {
        var line by remember { mutableStateOf(status.line.toString()) }
        val target = line.toIntOrNull()
        AlertDialog(onDismissRequest = { goToLine = false }, title = { Text("跳转到行") },
            text = { OutlinedTextField(value = line, onValueChange = { line = it.filter(Char::isDigit) }, singleLine = true,
                label = { Text("行号") }, supportingText = { Text("1–${status.lines}") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                isError = line.isNotEmpty() && (target == null || target !in 1..status.lines)) },
            confirmButton = { TextButton(onClick = { controller.goToLine(target!!); goToLine = false }, enabled = target != null && target in 1..status.lines) { Text("跳转") } },
            dismissButton = { TextButton(onClick = { goToLine = false }) { Text("取消") } })
    }
    if (licenses) {
        val context = LocalContext.current
        val text = remember { listOf("NOTICE.txt", "Sora-LGPL-2.1.txt", "JavaScript-Grammar-MIT.txt", "Eclipse-TM4E-EPL-2.0.txt")
            .joinToString("\n\n") { name -> context.assets.open("licenses/$name").bufferedReader().use { it.readText() } } }
        AlertDialog(onDismissRequest = { licenses = false }, title = { Text("开源许可") },
            text = { Text(text, Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()), style = MaterialTheme.typography.bodySmall) },
            confirmButton = { TextButton(onClick = { licenses = false }) { Text("关闭") } })
    }
}

@Composable
private fun EditorToolbar(controller: JavaScriptEditorController, busy: Boolean, onGoToLine: () -> Unit) {
    val status = controller.status
    Surface(color = MaterialTheme.colorScheme.surface) {
        Column(Modifier.navigationBarsPadding()) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp)) {
                IconButton(onClick = controller::undo, enabled = !busy && status.canUndo) { Icon(Icons.AutoMirrored.Outlined.Undo, "撤销") }
                IconButton(onClick = controller::redo, enabled = !busy && status.canRedo) { Icon(Icons.AutoMirrored.Outlined.Redo, "重做") }
                IconButton(onClick = { controller.move(true) }, enabled = !busy) { Icon(Icons.Outlined.ChevronLeft, "光标左移") }
                IconButton(onClick = { controller.move(false) }, enabled = !busy) { Icon(Icons.Outlined.ChevronRight, "光标右移") }
                IconButton(onClick = controller::indent, enabled = !busy) { Icon(Icons.AutoMirrored.Outlined.FormatIndentIncrease, "增加缩进") }
                IconButton(onClick = controller::unindent, enabled = !busy) { Icon(Icons.AutoMirrored.Outlined.FormatIndentDecrease, "减少缩进") }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp)) {
                listOf("(", ")", "{", "}", "[", "]", "'", "\"", "`", ";", ":", "=", "/", ".", ",").forEach { symbol ->
                    TextButton(onClick = { controller.insert(symbol) }, enabled = !busy,
                        contentPadding = PaddingValues(horizontal = 12.dp), modifier = Modifier.defaultMinSize(minWidth = 40.dp)) {
                        Text(symbol, fontFamily = FontFamily.Monospace)
                    }
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${status.lines} 行 · ${formatSize(status.bytes)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("行 ${status.line} · 列 ${status.column}", Modifier.clickable(onClick = onGoToLine),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
private fun SearchPanel(query: String, onQuery: (String) -> Unit, replacement: String, onReplacement: (String) -> Unit,
    matchCase: Boolean, onMatchCase: () -> Unit, replaceOpen: Boolean, onToggleReplace: () -> Unit,
    controller: JavaScriptEditorController, busy: Boolean, onClose: () -> Unit) {
    val status = controller.status
    val options = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false)
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(value = query, onValueChange = onQuery, label = { Text("查找") }, singleLine = true,
                modifier = Modifier.weight(1f), keyboardOptions = options,
                trailingIcon = { IconToggleButton(checked = matchCase, onCheckedChange = { onMatchCase() },
                    modifier = Modifier.semantics { contentDescription = "区分大小写" }) { Text("Aa") } })
            IconButton(onClick = onClose) { Icon(Icons.Outlined.Close, "关闭查找") }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("${status.matchIndex}/${status.matches.coerceAtLeast(0)}", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
            IconButton(onClick = { controller.nextMatch(true) }, enabled = status.matches > 0) { Icon(Icons.Outlined.KeyboardArrowUp, "上一个匹配") }
            IconButton(onClick = { controller.nextMatch() }, enabled = status.matches > 0) { Icon(Icons.Outlined.KeyboardArrowDown, "下一个匹配") }
            TextButton(onClick = onToggleReplace) { Text("替换") }
        }
        if (replaceOpen) Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(value = replacement, onValueChange = onReplacement, label = { Text("替换为") }, singleLine = true,
                modifier = Modifier.weight(1f), keyboardOptions = options)
            TextButton(onClick = { controller.replaceCurrent(replacement) }, enabled = !busy && status.matches > 0) { Text("替换") }
            TextButton(onClick = { controller.replaceAll(replacement) }, enabled = !busy && status.matches > 0) { Text("全部") }
        }
    }
}

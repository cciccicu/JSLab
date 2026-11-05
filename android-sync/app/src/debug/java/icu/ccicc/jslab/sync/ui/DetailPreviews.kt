package icu.ccicc.jslab.sync.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import icu.ccicc.jslab.sync.EditorDocument
import icu.ccicc.jslab.sync.EditorKind
import icu.ccicc.jslab.sync.ScreenState
import icu.ccicc.jslab.sync.data.*

@Preview(name = "原生编辑器", widthDp = 412, heightDp = 915, locale = "zh-rCN")
@Composable
fun EditorPreview(mode: ThemeMode = ThemeMode.Light) {
    SyncTheme(mode) {
        EditorScreen(ScreenState(editor = EditorDocument(name = "hello.js", content = """
            // JSLab 示例脚本
            const message = 'Hello, JSLab 🌏';
            const count = 42;
            const pattern = /jslab/gi;
            const title = `JSLab ${'$'}{count}`;

            function greet(name) {
              console.log('你好，' + name);
            }

            greet('JSLab');
        """.trimIndent())), LinkState(device = WearDevice("preview", "Xiaomi Smart Band 9 Pro"), phase = ConnectionPhase.Ready), {}, {}, {}, {}, {})
    }
}

@Preview(name = "离线编辑", widthDp = 412, heightDp = 915, locale = "zh-rCN")
@Composable
fun OfflineEditorPreview() {
    SyncTheme(ThemeMode.Light) {
        EditorScreen(ScreenState(editor = EditorDocument(name = "draft.js", content = "// 本地草稿\nconsole.log('你好 🌏');"), editorOpen = true),
            LinkState(), {}, {}, {}, {}, {})
    }
}

@Preview(name = "脚本数据", widthDp = 412, heightDp = 915, locale = "zh-rCN")
@Composable
fun ScriptDataPreview() {
    val content = """
        {
          "data": {
            "count": 42,
            "message": "你好，JSLab 🌏",
            "history": [1, 2, 3]
          },
          "config": {
            "enabled": true
          }
        }
    """.trimIndent()
    SyncTheme(ThemeMode.Light) {
        EditorScreen(ScreenState(editor = EditorDocument(name = "hello.js", content = content, savedContent = content,
            deviceId = "preview", remoteExists = true, kind = EditorKind.ScriptData, storageBase = content), editorOpen = true),
            LinkState(device = WearDevice("preview", "Xiaomi Smart Band 9 Pro"), phase = ConnectionPhase.Ready,
                scriptStorageSupported = true), {}, {}, {}, {}, {})
    }
}

@Preview(name = "保留草稿返回首页", widthDp = 412, heightDp = 915, locale = "zh-rCN")
@Composable
fun ParkedDraftPreview() {
    SyncTheme(ThemeMode.Light) {
        Scaffold(containerColor = MaterialTheme.colorScheme.background, bottomBar = { BottomNavigation(0) {} }) { padding ->
            Column(Modifier.padding(padding)) {
                Header("JSLab Sync")
                WorkspaceScreen(ScreenState(editor = EditorDocument(name = "draft.js", content = "console.log('你好');")),
                    LinkState(), {}, {}, {}, {}, {}, {}, {}, {}, {})
            }
        }
    }
}

@Preview(name = "等待握手", widthDp = 412, heightDp = 915, locale = "zh-rCN")
@Composable
fun WaitingHandshakePreview() {
    SyncTheme(ThemeMode.Light) {
        Scaffold(containerColor = MaterialTheme.colorScheme.background, bottomBar = { BottomNavigation(0) {} }) { padding ->
            Column(Modifier.padding(padding)) {
                Header("JSLab Sync")
                WorkspaceScreen(ScreenState(discovering = true), LinkState(), {}, {}, {}, {}, {}, {}, {}, {}, {})
            }
        }
    }
}

@Preview(name = "设置", widthDp = 412, heightDp = 915, locale = "zh-rCN")
@Composable
fun SettingsPreview() {
    SyncTheme(ThemeMode.Light) {
        Scaffold(containerColor = MaterialTheme.colorScheme.background, bottomBar = { BottomNavigation(1) {} }) { padding ->
            Column(Modifier.padding(padding)) {
                Header("设置")
                SettingsScreen(SyncPreferences(), {}, {})
            }
        }
    }
}

package icu.ccicc.jslab.sync.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.android.tools.screenshot.PreviewTest
import icu.ccicc.jslab.sync.data.ThemeMode

/** Host-side Layoutlib rendering: never starts an emulator or initializes the device transport. */
class PreviewScreenshots {
    @PreviewTest
    @Preview(name = "工作台", widthDp = 412, heightDp = 915, locale = "zh-rCN", showBackground = true)
    @Composable
    fun workspace() { WorkspacePreview() }

    @PreviewTest
    @Preview(name = "360dp工作台", widthDp = 360, heightDp = 800, locale = "zh-rCN", showBackground = true)
    @Composable
    fun compactWorkspace() { WorkspacePreview() }

    @PreviewTest
    @Preview(name = "深色工作台", widthDp = 412, heightDp = 915, locale = "zh-rCN", showBackground = true)
    @Composable
    fun workspaceDark() { DarkWorkspacePreview() }

    @PreviewTest
    @Preview(name = "窄屏大字", widthDp = 320, heightDp = 800, fontScale = 1.3f, locale = "zh-rCN", showBackground = true)
    @Composable
    fun narrow() { DarkWorkspacePreview() }

    @PreviewTest
    @Preview(name = "编辑器", widthDp = 412, heightDp = 915, locale = "zh-rCN", showBackground = true)
    @Composable
    fun editor() { EditorPreview() }

    @PreviewTest
    @Preview(name = "编辑器深色", widthDp = 412, heightDp = 915, locale = "zh-rCN", showBackground = true)
    @Composable
    fun editorDark() { EditorPreview(ThemeMode.Dark) }

    @PreviewTest
    @Preview(name = "编辑器窄屏大字", widthDp = 320, heightDp = 800, fontScale = 1.3f, locale = "zh-rCN", showBackground = true)
    @Composable
    fun editorNarrow() { EditorPreview() }

    @PreviewTest
    @Preview(name = "等待握手", widthDp = 412, heightDp = 915, locale = "zh-rCN", showBackground = true)
    @Composable
    fun waitingHandshake() { WaitingHandshakePreview() }

    @PreviewTest
    @Preview(name = "设置", widthDp = 412, heightDp = 915, locale = "zh-rCN", showBackground = true)
    @Composable
    fun settings() { SettingsPreview() }

    @PreviewTest
    @Preview(name = "离线编辑", widthDp = 412, heightDp = 915, locale = "zh-rCN", showBackground = true)
    @Composable
    fun offlineEditor() { OfflineEditorPreview() }

    @PreviewTest
    @Preview(name = "保留草稿返回首页", widthDp = 412, heightDp = 915, locale = "zh-rCN", showBackground = true)
    @Composable
    fun parkedDraft() { ParkedDraftPreview() }

    @PreviewTest
    @Preview(name = "脚本数据", widthDp = 412, heightDp = 915, locale = "zh-rCN", showBackground = true)
    @Composable
    fun scriptData() { ScriptDataPreview() }

    @PreviewTest
    @Preview(name = "脚本数据窄屏", widthDp = 320, heightDp = 800, fontScale = 1.3f, locale = "zh-rCN", showBackground = true)
    @Composable
    fun scriptDataNarrow() { ScriptDataPreview() }
}

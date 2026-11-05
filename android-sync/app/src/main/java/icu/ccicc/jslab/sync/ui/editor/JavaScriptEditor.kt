package icu.ccicc.jslab.sync.ui.editor

import android.content.Context
import android.graphics.Typeface
import android.os.Build
import android.text.InputType
import android.util.TypedValue
import android.view.inputmethod.EditorInfo
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.listSaver
import io.github.rosemoe.sora.event.*
import io.github.rosemoe.sora.langs.textmate.TextMateColorScheme
import io.github.rosemoe.sora.langs.textmate.TextMateLanguage
import io.github.rosemoe.sora.langs.textmate.TextMateAnalyzer
import io.github.rosemoe.sora.lang.styling.MappedSpans
import io.github.rosemoe.sora.lang.styling.Styles
import io.github.rosemoe.sora.langs.textmate.registry.GrammarRegistry
import io.github.rosemoe.sora.langs.textmate.registry.ThemeRegistry
import io.github.rosemoe.sora.langs.textmate.registry.model.ThemeModel
import io.github.rosemoe.sora.langs.textmate.registry.provider.AssetsFileResolver
import io.github.rosemoe.sora.langs.textmate.registry.FileProviderRegistry
import io.github.rosemoe.sora.widget.CodeEditor
import io.github.rosemoe.sora.widget.EditorSearcher
import io.github.rosemoe.sora.widget.SelectionMovement
import org.eclipse.tm4e.core.registry.IThemeSource

data class EditorStatus(
    val line: Int = 1,
    val column: Int = 1,
    val lines: Int = 1,
    val bytes: Long = 0,
    val canUndo: Boolean = false,
    val canRedo: Boolean = false,
    val matches: Int = 0,
    val matchIndex: Int = 0,
)

/** Owns commands, not the View lifetime: AndroidView creates and releases the native widget. */
@Stable
class JavaScriptEditorController(initialText: String = "") {
    internal var view: CodeEditor? = null
        private set
    var status by mutableStateOf(EditorStatus(lines = initialText.count { it == '\n' } + 1,
        bytes = initialText.toByteArray(Charsets.UTF_8).size.toLong()))
        private set
    var wordWrap by mutableStateOf(false)
        private set
    private var start = 0
    private var end = 0
    private var x = 0
    private var y = 0
    private var fontSize = 14f
    private var query = ""
    private var matchCase = false
    private var darkTheme: Boolean? = null
    private var byteCount = 0L

    fun attach(editor: CodeEditor, content: String, dark: Boolean, onEdit: (String) -> Unit, preview: Boolean = false) {
        check(view == null)
        view = editor
        byteCount = content.toByteArray(Charsets.UTF_8).size.toLong()
        editor.apply {
            typefaceText = Typeface.MONOSPACE
            typefaceLineNumber = Typeface.MONOSPACE
            setTextSize(fontSize)
            setScaleTextSizes(9f, 30f)
            setLineSpacing(0f, 1.4f)
            val density = resources.displayMetrics.density
            setLineNumberMarginLeft(10f * density)
            setDividerMargin(8f * density, 10f * density)
            isScalable = true
            isLineNumberEnabled = true
            setPinLineNumber(true)
            isHighlightCurrentLine = true
            isHighlightBracketPair = true
            isBlockLineEnabled = true
            isWordwrap = wordWrap
            tabWidth = 2
            props.singleDirectionDragging = false
            props.singleDirectionFling = false
            props.autoIndent = true
            props.symbolPairAutoCompletion = true
            setScrollBarEnabled(true)
            setVerticalExtraSpaceFactor(.4f)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            setText(content)
        }
        applyTheme(dark)
        if (preview) JavaScriptLanguages.highlightPreview(editor)
        val a = editor.text.indexer.getCharPosition(start.coerceIn(0, editor.text.length))
        val b = editor.text.indexer.getCharPosition(end.coerceIn(start.coerceAtMost(editor.text.length), editor.text.length))
        editor.setSelectionRegion(a.line, a.column, b.line, b.column, false)
        editor.subscribeEvent(ContentChangeEvent::class.java) { _, _ ->
            val text = editor.text.toString()
            byteCount = text.toByteArray(Charsets.UTF_8).size.toLong()
            onEdit(text)
            refreshStatus()
            editor.post { if (view === editor) refreshStatus() }
        }
        editor.subscribeEvent(SelectionChangeEvent::class.java) { _, _ -> refreshStatus() }
        editor.subscribeEvent(PublishSearchResultEvent::class.java) { _, _ -> refreshStatus() }
        editor.subscribeEvent(TextSizeChangeEvent::class.java) { _, _ -> captureViewport() }
        editor.subscribeEvent(ScrollEvent::class.java) { _, _ -> captureViewport() }
        editor.subscribeEvent(BuildEditorInfoEvent::class.java) { event, _ ->
            event.editorInfo.imeOptions = event.editorInfo.imeOptions or EditorInfo.IME_FLAG_NO_FULLSCREEN
        }
        val restoredX = x
        val restoredY = y
        editor.post {
            if (view === editor) {
                editor.scroller.startScroll(0, 0, restoredX.coerceIn(0, editor.scrollMaxX), restoredY.coerceIn(0, editor.scrollMaxY), 0)
                editor.invalidate()
            }
        }
        search(query, matchCase)
        refreshStatus()
    }

    fun detach(editor: CodeEditor) {
        if (view !== editor) return
        captureViewport()
        view = null
        darkTheme = null
        editor.release()
    }

    fun applyTheme(dark: Boolean) {
        val editor = view ?: return
        if (darkTheme == dark) return
        JavaScriptLanguages.apply(editor, dark)
        darkTheme = dark
    }

    fun setReadOnly(readOnly: Boolean) { view?.isEditable = !readOnly }
    fun undo() { view?.takeIf { it.isEditable && it.canUndo() }?.undo(); refreshStatus() }
    fun redo() { view?.takeIf { it.isEditable && it.canRedo() }?.redo(); refreshStatus() }
    fun indent() { view?.takeIf { it.isEditable }?.indentOrCommitTab(); refreshStatus() }
    fun unindent() { view?.takeIf { it.isEditable }?.unindentSelection(); refreshStatus() }
    fun insert(text: String) {
        view?.takeIf { it.isEditable }?.let { editor ->
            editor.requestFocus()
            editor.commitText(text, true, true)
            editor.showSoftInput()
        }
    }
    fun move(left: Boolean) { view?.moveSelection(if (left) SelectionMovement.LEFT else SelectionMovement.RIGHT) }
    fun toggleWordWrap() { wordWrap = !wordWrap; view?.isWordwrap = wordWrap }
    fun goToLine(line: Int) {
        val editor = view ?: return
        editor.setSelection((line - 1).coerceIn(0, editor.lineCount - 1), 0)
        editor.requestFocus()
    }
    fun search(value: String, caseSensitive: Boolean = false) {
        query = value
        matchCase = caseSensitive
        val searcher = view?.searcher ?: return
        if (value.isEmpty()) searcher.stopSearch()
        else searcher.search(value, EditorSearcher.SearchOptions(EditorSearcher.SearchOptions.TYPE_NORMAL, !caseSensitive))
        refreshStatus()
    }
    fun nextMatch(previous: Boolean = false) {
        view?.searcher?.takeIf { it.hasQuery() }?.let { if (previous) it.gotoPrevious() else it.gotoNext() }
    }
    fun replaceCurrent(replacement: String) {
        view?.takeIf { it.isEditable }?.searcher?.takeIf { it.hasQuery() }?.let {
            if (!it.isMatchedPositionSelected) it.gotoNext()
            it.replaceCurrentMatch(replacement)
        }
    }
    fun replaceAll(replacement: String) {
        view?.takeIf { it.isEditable }?.searcher?.takeIf { it.hasQuery() }?.replaceAll(replacement)
    }
    private fun captureViewport() {
        view?.let {
            start = it.cursor.left
            end = it.cursor.right
            x = it.offsetX
            y = it.offsetY
            fontSize = textSizeSp(it)
        }
    }

    @Suppress("DEPRECATION")
    private fun textSizeSp(editor: CodeEditor): Float = if (Build.VERSION.SDK_INT >= 34) {
        TypedValue.deriveDimension(TypedValue.COMPLEX_UNIT_SP, editor.textSizePx, editor.resources.displayMetrics)
    } else editor.textSizePx / editor.resources.displayMetrics.scaledDensity
    private fun refreshStatus() {
        val editor = view ?: return
        captureViewport()
        val searcher = editor.searcher
        status = EditorStatus(editor.cursor.rightLine + 1, editor.cursor.rightColumn + 1,
            editor.lineCount, byteCount,
            editor.canUndo(), editor.canRedo(), if (searcher.hasQuery()) searcher.matchedPositionCount else 0,
            if (searcher.hasQuery()) searcher.currentMatchedPositionIndex + 1 else 0)
    }

    companion object {
        val Saver = listSaver<JavaScriptEditorController, Any>(
            save = { editor ->
                editor.captureViewport()
                listOf(editor.start, editor.end, editor.x, editor.y, editor.fontSize, editor.wordWrap)
            },
            restore = { values -> JavaScriptEditorController().apply {
                start = values[0] as Int; end = values[1] as Int
                x = values[2] as Int; y = values[3] as Int
                fontSize = values[4] as Float; wordWrap = values[5] as Boolean
            } },
        )
    }
}

/** Separate registries keep simultaneous light/dark previews and editor instances independent. */
internal object JavaScriptLanguages {
    private data class Bundle(val grammars: GrammarRegistry, val themes: ThemeRegistry, val theme: ThemeModel)
    private val bundles = mutableMapOf<Boolean, Bundle>()
    private var providerAdded = false

    @Synchronized
    private fun bundle(context: Context, dark: Boolean): Bundle = bundles.getOrPut(dark) {
        if (!providerAdded) {
            FileProviderRegistry.getInstance().addFileProvider(AssetsFileResolver(context.applicationContext.assets))
            providerAdded = true
        }
        val name = if (dark) "jslab-dark" else "jslab-light"
        val themes = ThemeRegistry()
        val model = context.assets.open("textmate/$name.json").use {
            ThemeModel(IThemeSource.fromInputStream(it, "$name.json", null), name).apply { isDark = dark }
                .also { theme -> themes.loadTheme(theme, true) }
        }
        val grammars = GrammarRegistry(null)
        grammars.setTheme(model)
        grammars.loadGrammars("textmate/languages.json")
        Bundle(grammars, themes, model)
    }

    fun apply(editor: CodeEditor, dark: Boolean) {
        val bundle = bundle(editor.context, dark)
        editor.colorScheme = TextMateColorScheme(bundle.themes, bundle.theme)
        editor.setEditorLanguage(TextMateLanguage.create("source.js", bundle.grammars, bundle.themes, true).apply {
            tabSize = 2
            useTab(false)
            setCompleterKeywords(KEYWORDS)
        })
    }

    // Layoutlib captures one frame without draining the background analyzer. Use the very same
    // TextMate tokenizer synchronously for that frame; real editing remains incremental.
    fun highlightPreview(editor: CodeEditor) {
        val analyzer = editor.editorLanguage.analyzeManager as TextMateAnalyzer
        var state = analyzer.initialState
        val spans = MappedSpans.Builder(editor.lineCount)
        for (line in 0 until editor.lineCount) {
            val result = analyzer.tokenizeLine(editor.text.getLine(line), state, line)
            result.spans?.forEach { spans.add(line, it) }
            state = result.state
        }
        spans.determine(editor.lineCount - 1)
        editor.styles = Styles(spans.build())
    }

    private val KEYWORDS = arrayOf("async", "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete",
        "do", "else", "export", "extends", "false", "finally", "for", "from", "function", "if", "import", "in", "instanceof", "let",
        "new", "null", "of", "return", "static", "super", "switch", "this", "throw", "true", "try", "typeof", "undefined", "var",
        "void", "while", "yield", "console", "ui", "dialog", "script", "system", "Promise", "JSON", "Math", "Date", "setTimeout", "clearTimeout")
}

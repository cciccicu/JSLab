package icu.ccicc.jslab.sync.ui.editor

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Looper
import android.os.SystemClock
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.FrameLayout
import io.github.rosemoe.sora.lang.styling.TextStyle
import io.github.rosemoe.sora.widget.CodeEditor
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ActivityController
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.annotation.LooperMode
import org.robolectric.RobolectricTestRunner

/** Runs the actual native editor/grammar/IME on the host; no device or emulator is involved. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@LooperMode(LooperMode.Mode.PAUSED)
class JavaScriptEditorTest {
    private lateinit var activity: ActivityController<Activity>
    private lateinit var editor: CodeEditor
    private lateinit var controller: JavaScriptEditorController
    private val edits = mutableListOf<String>()

    @Before fun setUp() { activity = Robolectric.buildActivity(Activity::class.java).setup() }
    @After fun tearDown() {
        if (::editor.isInitialized) controller.detach(editor)
        activity.pause().stop().destroy()
        shadowOf(Looper.getMainLooper()).idle()
    }

    private fun open(source: String) {
        controller = JavaScriptEditorController()
        editor = CodeEditor(activity.get())
        controller.attach(editor, source, false, edits::add)
        activity.get().setContentView(FrameLayout(activity.get()).apply {
            addView(editor, FrameLayout.LayoutParams(320, 320))
        })
        editor.measure(View.MeasureSpec.makeMeasureSpec(320, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(320, View.MeasureSpec.EXACTLY))
        editor.layout(0, 0, 320, 320)
        editor.draw(Canvas(Bitmap.createBitmap(320, 320, Bitmap.Config.ARGB_8888)))
        shadowOf(Looper.getMainLooper()).idle()
    }

    private fun await(reason: String, condition: () -> Boolean) {
        val deadline = System.nanoTime() + 5_000_000_000
        while (System.nanoTime() < deadline) {
            shadowOf(Looper.getMainLooper()).idle()
            if (condition()) return
            Thread.sleep(10)
        }
        assertTrue(reason, condition())
    }

    private fun color(line: Int, column: Int): Int {
        val span = editor.getSpansForLine(line).last { it.column <= column }
        return editor.colorScheme.getColor(TextStyle.getForegroundColorId(span.style))
    }

    @Test fun `JavaScript tokens distinguish keywords strings numbers multiline comments and templates`() {
        open("const answer = 42;\nconst text = 'const answer';\n/* comment\n continues */\nconst template = `hello ${'$'}{answer}`;\nconst regex = /ab+c/g;")
        await("TextMate must finish native editor highlighting") { editor.getSpansForLine(5).size > 3 }
        assertNotEquals(color(0, 0), color(0, 6))
        assertNotEquals(color(0, 15), color(0, 6))
        assertEquals(color(1, 14), color(1, 20))
        assertNotEquals(color(1, 14), color(0, 0))
        assertEquals(color(2, 3), color(3, 3))
        assertNotEquals(color(4, 18), color(4, 27))
        assertNotEquals(color(5, 15), color(0, 6))
        assertTrue("Loading a document must not mark it modified", edits.isEmpty())
    }

    @Test fun `native IME completes brackets and Enter keeps JavaScript indentation`() {
        open("")
        editor.requestFocus()
        val ime = editor.onCreateInputConnection(EditorInfo())!!
        ime.commitText("{", 1)
        assertEquals("{}", editor.text.toString())
        assertEquals(1, editor.cursor.rightColumn)
        editor.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER))
        editor.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER))
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals("{\n  \n}", editor.text.toString())
        assertEquals(2, editor.cursor.rightColumn)
    }

    @Test fun `undo redo and theme changes keep Unicode content and dirty callbacks intact`() {
        val source = "console.log('中文');"
        open(source)
        editor.setSelection(0, source.length)
        controller.insert(" 🌏")
        assertEquals(source + " 🌏", edits.last())
        assertTrue(controller.status.canUndo)
        controller.applyTheme(true)
        assertEquals(source + " 🌏", editor.text.toString())
        controller.undo()
        assertEquals(source, edits.last())
        controller.redo()
        assertEquals(source + " 🌏", edits.last())
        assertEquals((source + " 🌏").toByteArray(Charsets.UTF_8).size.toLong(), controller.status.bytes)
    }

    @Test fun `one diagonal drag scrolls a long document on both axes`() {
        open((1..180).joinToString("\n") { "const line$it = '${"x".repeat(1200)}';" })
        await("Long lines and many rows must have a two-axis viewport") { editor.scrollMaxX > 300 && editor.scrollMaxY > 1000 }
        val time = SystemClock.uptimeMillis()
        listOf(Triple(MotionEvent.ACTION_DOWN, 250f, 250f), Triple(MotionEvent.ACTION_MOVE, 230f, 230f),
            Triple(MotionEvent.ACTION_MOVE, 80f, 70f), Triple(MotionEvent.ACTION_UP, 80f, 70f)).forEachIndexed { index, (action, x, y) ->
            val event = MotionEvent.obtain(time, time + index * 32L, action, x, y, 0)
            editor.dispatchTouchEvent(event)
            editor.computeScroll()
            editor.draw(Canvas(Bitmap.createBitmap(320, 320, Bitmap.Config.ARGB_8888)))
            event.recycle()
        }
        assertTrue("Diagonal scrolling must move horizontally", editor.offsetX > 0)
        assertTrue("Diagonal scrolling must move vertically", editor.offsetY > 0)
        controller.goToLine(150)
        assertEquals(150, controller.status.line)
    }

    @Test fun `search replacement is literal supports case choice and can be undone`() {
        open("hello Hello hello ${'$'}1")
        controller.search("hello", true)
        await("Case-sensitive search") { controller.status.matches == 2 }
        controller.nextMatch()
        controller.replaceCurrent("${'$'}2")
        assertEquals("${'$'}2 Hello hello ${'$'}1", editor.text.toString())
        controller.undo()
        assertEquals("hello Hello hello ${'$'}1", editor.text.toString())
        controller.search("hello", false)
        await("Case-insensitive search") { controller.status.matches == 3 }
        controller.replaceAll("${'$'}2")
        await("Replace all must preserve literal dollar characters") { editor.text.toString() == "${'$'}2 ${'$'}2 ${'$'}2 ${'$'}1" }
        controller.undo()
        assertEquals("hello Hello hello ${'$'}1", editor.text.toString())
    }

    @Test fun `selection indentation groups undo and read-only operations do not change content`() {
        open("one();\ntwo();")
        editor.selectAll()
        controller.indent()
        assertEquals("  one();\n  two();", editor.text.toString())
        controller.unindent()
        assertEquals("one();\ntwo();", editor.text.toString())
        controller.setReadOnly(true)
        controller.insert("x"); controller.indent(); controller.undo()
        assertEquals("one();\ntwo();", editor.text.toString())
    }
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function createEditorPage() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'workspace', 'editor', 'editor.ux'), 'utf8');
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*;\r?\n/gm, '')
    .replace('export default', 'return');
  const page = new Function('DEFAULT_FONT_PROFILE', 'DEFAULT_FONT_SIZE',
    'DEFAULT_HIGHLIGHT_ENABLED', 'DEFAULT_HIGHLIGHT_CHAR_THRESHOLD',
    'DEFAULT_HIGHLIGHT_LINE_THRESHOLD', 'DEFAULT_HIGHLIGHT_PALETTE',
    script)({}, 20, false, 2048, 80, 'default');
  Object.assign(page, page.private);
  page.activateEditorSession = () => {};
  page.loadEditorPreferences = () => {};
  page.updateTime = () => {};
  page.onInit();
  page.hideInputMethod = false;
  page.editorVisible = true;
  page.codeWidth = 720;
  page.codeHeight = 780;
  page.cursorHeight = 20;
  const calls = [];
  page.$element = () => ({
    scrollTo(target) {
      calls.push(target);
      // Reproduce a device that resets any missing axis to zero.
      page.onCodeScroll({ detail: { scrollX: target.left === undefined ? 0 : target.left,
        scrollY: target.top === undefined ? 0 : target.top } });
    }
  });
  return { page, calls };
}

async function reveal(page) {
  page.scheduleCursorReveal();
  await new Promise(resolve => setTimeout(resolve, 10));
}

async function run() {
  const { page, calls } = createEditorPage();
  assert.equal(page.syntaxHighlightEnabled, false);
  assert.equal(page.highlightCharThreshold, 2048);
  assert.equal(page.highlightLineThreshold, 80);
  const template = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'workspace', 'editor', 'editor.ux'), 'utf8');
  assert.match(template, /top: \{\{cursorY\}\}px;[^"]*height: \{\{cursorHeight\}\}px;/,
    'The cursor uses the same row coordinates in both rendering modes');
  assert.match(template, /<text elif="\{\{!highlightRendering\}\}" class="code code-plain-text"/,
    'Plain code remains a single text component');
  assert.match(template, /class="code code-plain-text"[^>]*width: \{\{codeWidth\}\}px;/,
    'Plain text uses the same explicit document width as cursor coordinates');
  assert.doesNotMatch(template, /plainCodeLines|cursorVisualY|cursorVisualHeight/);
  const { page: layoutPage } = createEditorPage();
  const document = {
    lines: [{ text: 'code' }].concat(Array.from({ length: 19 }, () => ({ text: '' }))),
    sourceLength: 23,
    cursor: { x: 0, y: 380, height: 20 },
    width: 336
  };
  const state = { document, source: 'code' + '\n'.repeat(19), highlight: null };
  layoutPage.getEditorState = () => state;
  layoutPage.initialHighlightComplete = true;
  layoutPage.updateCodeDisplay();
  assert.equal(layoutPage.codeTextHeight, 20, 'Trailing empty lines do not enlarge the plain text component');
  assert.equal(layoutPage.codeHeight, 400, 'The document still reserves room for its logical lines');
  assert.equal(layoutPage.cursorY, 380, 'The caret can enter the final empty line');
  document.lines[1].text = 'next';
  document.lines.length = 2;
  document.sourceLength = 9;
  document.cursor.y = 20;
  state.source = 'code\nnext';
  layoutPage.updateCodeDisplay();
  assert.equal(layoutPage.codeTextHeight, 40, 'Nonempty final lines retain their height');
  document.lines = [{ text: '' }];
  document.cursor.y = 0;
  state.source = '';
  layoutPage.updateCodeDisplay();
  assert.equal(layoutPage.codeTextHeight, 20, 'An empty document retains one text line');
  page.cursorHeight = 20;
  page.onCodeScroll({ detail: { scrollX: 72, scrollY: 98 } });
  const clicks = [];
  page.moveCursorTo = (x, y) => clicks.push({ x, y });
  global.vibrate = () => {};
  page.onCodeClick({ detail: { offsetX: 30, offsetY: 25, clientX: 140, clientY: 140 } });
  assert.deepEqual(clicks.pop(), { x: 30, y: 25 },
    'Document-local click coordinates take priority over viewport coordinates');
  page.onCodeClick({ detail: { clientX: 140, clientY: 140 } });
  assert.deepEqual(clicks.pop(), { x: 206, y: 154 },
    'Viewport coordinates are converted only when local coordinates are absent');
  delete global.vibrate;
  page.cursorX = 500;
  page.cursorY = 110;
  await reveal(page);
  assert.deepEqual(calls.pop(), { left: 220, top: 98, behavior: 'instant' },
    'Horizontal reveal must preserve the vertical scroll position');

  page.onCodeScroll({ detail: { scrollX: 112, scrollY: 50 } });
  page.cursorX = 200;
  page.cursorY = 350;
  await reveal(page);
  assert.deepEqual(calls.pop(), { left: 112, top: 280, behavior: 'instant' },
    'Vertical reveal must preserve the horizontal scroll position');

  page.onCodeScroll({ detail: { scrollX: 0, scrollY: 0 } });
  page.cursorX = 700;
  page.cursorY = 760;
  await reveal(page);
  assert.deepEqual(calls.pop(), { left: 396, top: 639, behavior: 'instant' },
    'Reveal coordinates must stay inside the content bounds');

  page.cursorX = 650;
  page.cursorY = 680;
  assert.equal(page.getCursorRevealTarget(), null, 'Visible caret should not trigger another scroll');
}

run().then(() => console.log('editor scroll tests passed'))
  .catch(error => { console.error(error); process.exitCode = 1; });

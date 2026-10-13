const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test("editorDocument", async () => {
  // Check incremental state against an independent full-text oracle, not device timing.
  const root = path.join(__dirname, '..', 'src', 'utils', 'editor');
  const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const read = name => fs.readFileSync(path.join(root, name), 'utf8');
  const wide = /[\u2014\u2018\u2019\u201c\u201d\u2026\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uff60\uffe0-\uffe6]/g;

  function expectedWidth(text, profile, size) {
    const count = (text.match(wide) || []).length;
    return (text.length - count) * profile.asciiWidthRatio * size + count * profile.wideWidthRatio * size;
  }
  function check(document, source, offset, profile, size) {
    const lines = source.split('\n');
    const prefix = source.slice(0, offset).split('\n');
    assert.deepEqual(document.lines.map(line => line.text), lines);
    assert.equal(document.sourceLength, source.length);
    assert.equal(document.cursor.offset, offset);
    assert.equal(document.cursor.line, prefix.length - 1);
    assert.equal(document.cursor.column, prefix[prefix.length - 1].length);
    assert.equal(document.cursor.wideCount, (prefix[prefix.length - 1].match(wide) || []).length);
    assert.equal(new Set(document.lines.map(line => line.id)).size, lines.length);
    const widths = lines.map(line => expectedWidth(line, profile, size));
    const maxWidth = Math.max(...widths);
    assert.ok(Math.abs(document.maxLineWidth - maxWidth) < 1e-8);
    assert.equal(document.maxWidthCount, widths.filter(width => Math.abs(width - maxWidth) < 1e-8).length);
    assert.ok(document.width >= Math.ceil(document.maxLineWidth * 1.15) + 48);
    assert.equal((document.width - 336) % 64, 0);
    assert.ok(Math.abs(document.cursor.x - expectedWidth(prefix[prefix.length - 1], profile, size)) < 1e-8);
    assert.equal(document.cursor.y, (prefix.length - 1) * document.cursor.height);
    assert.ok(document.cursor.x >= 0 && document.cursor.column <= document.lines[document.cursor.line].text.length);
  }

  async function run() {
    const metricsUrl = url(read('codeEditor.js'));
    const documentSource = read('codeDocument.js').replace("'./codeEditor.js'", JSON.stringify(metricsUrl));
    const api = await import(url(documentSource));
    const profiles = [
      { asciiWidthRatio: 0.5, wideWidthRatio: 1, lineHeightRatio: 1 },
      { asciiWidthRatio: 0.37, wideWidthRatio: 0.93, lineHeightRatio: 1.2, lineHeightOffset: 1 }
    ];
    const fixtures = ['', '\n', 'a中b\n\nlongest line\n尾行\n', 'ab\r\n中\t文\nxy', '😀\n“…”'];
    for (const profile of profiles) {
      for (const source of fixtures) {
        for (let offset = 0; offset <= source.length; offset += 1) {
          for (const addition of ['a', '中', '\n', 'x\n\n文\n']) {
            const document = api.createCodeDocument(source, profile, 17, offset);
            const change = api.insertCodeText(document, addition);
            check(document, source.slice(0, offset) + addition + source.slice(offset),
              offset + addition.length, profile, 17);
            assert.equal(change.addedLines.length, addition.split('\n').length - 1);
            // Delete the inserted code units, including every newly inserted newline.
            for (let count = addition.length; count > 0; count -= 1) api.deleteCodeBackward(document);
            check(document, source, offset, profile, 17);
          }
          const document = api.createCodeDocument(source, profile, 17, offset);
          const removed = api.deleteCodeBackward(document);
          if (!offset) assert.equal(removed, null);
          else check(document, source.slice(0, offset - 1) + source.slice(offset), offset - 1, profile, 17);
        }
      }
    }

    const profile = profiles[1];
    const source = 'abcdef\n\n中a\nabcdefgh\n';
    const document = api.createCodeDocument(source, profile, 17, 5);
    for (let index = 0; index < 5; index += 1) {
      api.moveCodeCursor(document, 'left');
      check(document, source, 4 - index, profile, 17);
    }
    assert.equal(api.moveCodeCursor(document, 'left'), false);
    for (let offset = 1; offset <= source.length; offset += 1) {
      api.moveCodeCursor(document, 'right');
      check(document, source, offset, profile, 17);
    }
    assert.equal(api.moveCodeCursor(document, 'right'), false);
    api.moveCodeCursorToPoint(document, 5 * document.asciiWidth, 0);
    api.moveCodeCursor(document, 'down');
    assert.equal(document.cursor.column, 0);
    api.moveCodeCursor(document, 'down');
    assert.equal(document.cursor.column, 2);
    api.moveCodeCursor(document, 'down');
    assert.equal(document.cursor.column, 5, 'vertical movement keeps the desired column across short lines');
    check(document, source, source.indexOf('abcdefgh') + 5, profile, 17);
    for (const [x, y] of [[-5, -8], [Infinity, Infinity], [NaN, NaN], [10, 2 * document.cursor.height]]) {
      api.moveCodeCursorToPoint(document, x, y);
      check(document, source, document.cursor.offset, profile, 17);
    }
    const mixed = api.createCodeDocument('a中b', profiles[0], 16);
    for (const [x, column] of [[0, 0], [3.9, 0], [4, 1], [15.9, 1], [16, 2], [28, 3]]) {
      api.moveCodeCursorToPoint(mixed, x, 0);
      assert.equal(mixed.cursor.column, column);
    }

    // Longest-line ties, deleting the unique maximum, and splitting it at the cursor.
    const longest = api.createCodeDocument('abcdef\nabcdef\nx', profiles[0], 16, 6);
    api.deleteCodeBackward(longest);
    check(longest, 'abcde\nabcdef\nx', 5, profiles[0], 16);
    api.moveCodeCursorToPoint(longest, Infinity, 16);
    api.deleteCodeBackward(longest);
    check(longest, 'abcde\nabcde\nx', 11, profiles[0], 16);
    api.moveCodeCursorToPoint(longest, 16, 0);
    api.insertCodeText(longest, '\n');
    check(longest, 'ab\ncde\nabcde\nx', 3, profiles[0], 16);

    const repeated = api.createCodeDocument('abcdefgh\nx', profiles[0], 16, 8);
    api.deleteCodeBackward(repeated);
    const other = repeated.lines[1];
    Object.defineProperty(other, 'width', { configurable: true, get() { throw new Error('other maximum was rescanned'); } });
    api.deleteCodeBackward(repeated);
    api.deleteCodeBackward(repeated);
    Object.defineProperty(other, 'width', { configurable: true, writable: true, value: 8 });
    check(repeated, 'abcde\nx', 5, profiles[0], 16);
    api.moveCodeCursorToPoint(repeated, Infinity, 16);
    api.insertCodeText(repeated, 'xxxxxxxx');
    api.moveCodeCursorToPoint(repeated, Infinity, 0);
    api.deleteCodeBackward(repeated);
    check(repeated, 'abcd\nxxxxxxxxx', 4, profiles[0], 16);

    // Ordinary edits must not revisit unrelated line text or replace the line array.
    const isolated = api.createCodeDocument('abc\nuntouched', profiles[0], 16, 1);
    const rows = isolated.lines;
    Object.defineProperty(rows[1], 'text', { get() { throw new Error('unrelated line was scanned'); } });
    api.insertCodeText(isolated, '中');
    api.deleteCodeBackward(isolated);
    api.moveCodeCursor(isolated, 'left');
    assert.equal(isolated.lines, rows);
    assert.equal(isolated.cursor.offset, 0);
    const minimumHeight = api.createCodeDocument('\na', { ...profiles[0], lineHeightRatio: 0.8, lineHeightOffset: -8 }, 8, 2);
    assert.equal(minimumHeight.cursor.height, 1);
    assert.equal(minimumHeight.cursor.y, 1);
  }

  await run();
});

test("editorScroll", async () => {

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

  await run();
});

test("javascriptHighlighter", async () => {

  async function loadHighlighter() {
    const sourcePath = path.join(__dirname, '..', 'src', 'utils', 'editor', 'javascriptHighlighter.js');
    const paletteSource = fs.readFileSync(path.join(path.dirname(sourcePath), 'highlightPalette.js'), 'utf8');
    const paletteUrl = 'data:text/javascript;base64,' + Buffer.from(paletteSource).toString('base64');
    const palette = await import(paletteUrl);
    const lexerUrl = 'data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(path.dirname(sourcePath), 'javascriptLexer.js'), 'utf8')).toString('base64');
    const source = fs.readFileSync(sourcePath, 'utf8').replace("'./highlightPalette.js'", JSON.stringify(paletteUrl))
      .replace("'./javascriptLexer.js'", JSON.stringify(lexerUrl));
    const dataUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
    return { ...await import(dataUrl), ...palette };
  }

  function reconstruct(lines) {
    return lines.map(line => line.tokens.map(token => token.text).join('')).join('\n');
  }

  function reconstructTokens(tokens) {
    return tokens.map(token => token.text).join('');
  }

  function tokensOfType(tokens, type) {
    return tokens.filter(token => token.type === type).map(token => token.text);
  }

  function createMalformedSource(seed, length) {
    const characters = "abcXYZ09_'\"`/\\*+-.()[]{}\n\r\t中文\0";
    let value = seed >>> 0;
    let result = '';
    for (let index = 0; index < length; index += 1) {
      value = (value * 1664525 + 1013904223) >>> 0;
      result += characters[value % characters.length];
    }
    return result;
  }

  async function run() {
    const highlighter = await loadHighlighter();
    for (const name of ['constructor', 'toString', 'valueOf', '__proto__']) {
      assert.equal(highlighter.highlightJavascript(name)[0].type, 'plain');
    }
    for (const name of ['ui', 'dialog', 'script', 'system', 'globalThis']) {
      assert.equal(highlighter.highlightJavascript(name)[0].type, 'builtin');
    }
    const cases = [
      '',
      '\n',
      'const value = 1;\n\nconsole.log(value);\n',
      'function inp() {\n  input(\'输入答案\', value => value)\n}',
      '/* first line\n * second line\n */\nconst text = `a\nb`;',
      'const broken = "line one\nline two";',
      '#!/usr/bin/env qjs\nconst value = 1;',
      'const values = [0xFF_FF, 0b1010_0101, 0o755, 1_000.25e-2, 42n];',
      'const matcher = /https?:\\/\\/[a-z]+/giu;\nconst ratio = total / count;',
      'value+// comment after an operator\nnextValue',
      'const unfinishedRegex = /[abc\\/\nnextLine();',
      'const unfinishedComment = /* still editing',
      'const unfinishedTemplate = `value: ${data',
      'function 计算结果(输入值) { return 输入值 ?? 0 }',
      'const privateLike = object.#field?.value;',
      'const invalid = 0x__ +++++ / ??? \0'
    ];

    cases.forEach((source, caseIndex) => {
      const lines = highlighter.highlightJavascriptLines(source, 'case-' + caseIndex);
      assert.strictEqual(reconstruct(lines), source);
      assert.strictEqual(lines.length, source.split('\n').length);
      assert.ok(lines.every(line => line.tokens.every(token => token.text.indexOf('\n') === -1)));
      assert.strictEqual(new Set(lines.map(line => line.lineKey)).size, lines.length);
      lines.forEach(line => {
        assert.strictEqual(new Set(line.tokens.map(token => token.tokenKey)).size, line.tokens.length);
      });
    });

    await checkIncrementalHighlight(highlighter);

    const syntaxSource = [
      '#!/usr/bin/env qjs',
      'async function 计算(value) {',
      '  const pattern = /a[\\/]b+/giu;',
      '  const number = 0xFF_FF + 42n + .5;',
      '  value+// keep this comment',
      '  return value / 2;',
      '}'
    ].join('\n');
    const syntaxTokens = highlighter.highlightJavascript(syntaxSource, 'syntax');
    assert.strictEqual(reconstructTokens(syntaxTokens), syntaxSource);
    assert.deepStrictEqual(tokensOfType(syntaxTokens, 'regex'), ['/a[\\/]b+/giu']);
    assert.ok(tokensOfType(syntaxTokens, 'comment').includes('// keep this comment'));
    assert.ok(tokensOfType(syntaxTokens, 'number').includes('0xFF_FF'));
    assert.ok(tokensOfType(syntaxTokens, 'number').includes('42n'));
    assert.ok(tokensOfType(syntaxTokens, 'number').includes('.5'));
    assert.ok(tokensOfType(syntaxTokens, 'function').includes('计算'));

    const presets = highlighter.getHighlightPalettePresets();
    assert.ok(presets.length >= 3);
    assert.strictEqual(highlighter.normalizeHighlightPalette('missing'),
      highlighter.DEFAULT_HIGHLIGHT_PALETTE);
    const defaultPaletteTokens = highlighter.highlightJavascript(syntaxSource, 'palette-default', 'midnight');
    const classicPaletteTokens = highlighter.highlightJavascript(syntaxSource, 'palette-classic', 'classic');
    assert.strictEqual(reconstructTokens(defaultPaletteTokens), syntaxSource);
    assert.strictEqual(reconstructTokens(classicPaletteTokens), syntaxSource);
    assert.deepStrictEqual(defaultPaletteTokens.map(token => token.type),
      classicPaletteTokens.map(token => token.type));
    assert.ok(defaultPaletteTokens.some((token, index) => token.color !== classicPaletteTokens[index].color));

    for (let seed = 1; seed <= 100; seed += 1) {
      const malformedSource = createMalformedSource(seed, seed * 3);
      const malformedTokens = highlighter.highlightJavascript(malformedSource, 'malformed-' + seed);
      assert.strictEqual(reconstructTokens(malformedTokens), malformedSource);
    }

    const cappedSource = Array(250).fill('const value = call();').join('\n');
    const cappedTokens = highlighter.highlightJavascript(cappedSource, 'capped-tokens', undefined, 220);
    assert.strictEqual(cappedTokens.length, 1);
    assert.strictEqual(cappedTokens[0].type, 'plain');
    assert.strictEqual(cappedTokens[0].text, cappedSource);
    const cappedLines = highlighter.highlightJavascriptLines(cappedSource, 'capped', undefined, 220);
    assert.strictEqual(reconstruct(cappedLines), cappedSource);
    assert.ok(cappedLines.every(line => line.tokens.every(token => token.text.indexOf('\n') === -1)));

    const ui2048Module = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'examples', 'ui2048Example.js'), 'utf8');
    const ui2048Source = ui2048Module.replace(/^export default `/, '').replace(/`;?\s*$/, '');
    const ui2048Tokens = highlighter.highlightJavascript(ui2048Source, 'ui-2048', undefined,
      ui2048Source.length);
    assert.strictEqual(reconstructTokens(ui2048Tokens), ui2048Source);
    assert.ok(ui2048Tokens.some(token => token.type !== 'plain'), '2048 example should be highlighted');

    // Check fallback semantics, without treating desktop timing as device evidence.
    const pathologicalSource = Array(10000).fill('a+').join('');
    const pathologicalTokens = highlighter.highlightJavascript(pathologicalSource, 'pathological');
    assert.strictEqual(pathologicalTokens.length, 1);
    assert.strictEqual(pathologicalTokens[0].text, pathologicalSource);
    assert.strictEqual(highlighter.highlightJavascript(pathologicalSource, 'infinite', undefined, Infinity).length, 1);

    const mergedPlainSource = new Array(20001).join('(');
    const mergedPlainTokens = highlighter.highlightJavascript(mergedPlainSource, 'merged-plain');
    assert.strictEqual(mergedPlainTokens.length, 1);
    assert.strictEqual(mergedPlainTokens[0].text, mergedPlainSource);
  }

  async function checkIncrementalHighlight(highlighter) {
    const root = path.join(__dirname, '..', 'src', 'utils', 'editor');
    const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
    const metricsUrl = dataUrl(fs.readFileSync(path.join(root, 'codeEditor.js'), 'utf8'));
    const metrics = await import(metricsUrl);
    const api = await import(dataUrl(fs.readFileSync(path.join(root, 'codeDocument.js'), 'utf8')
      .replace("'./codeEditor.js'", JSON.stringify(metricsUrl))));
    const font = { asciiWidthRatio: 0.5, wideWidthRatio: 1, lineHeightRatio: 1 };
    const colors = lines => lines.map(line => line.tokens.flatMap(token => Array(token.text.length).fill(token.color)));
    function session(source) {
      const document = api.createCodeDocument(source, font, 16);
      const cache = highlighter.createHighlightState('midnight');
      let view = highlighter.commitHighlightedLines([], highlighter.highlightCodeDocument(cache, document));
      function check() {
        assert.strictEqual(reconstruct(view), source);
        assert.deepStrictEqual(colors(view), colors(highlighter.highlightJavascriptLines(source, 'fresh', 'midnight')));
        assert.strictEqual(new Set(view.map(line => line.lineKey)).size, view.length);
        for (const line of view) assert.strictEqual(new Set(line.tokens.map(token => token.tokenKey)).size, line.tokens.length);
      }
      check();
      return {
        document, cache, get view() { return view; },
        edit(offset, addition, remove = false) {
          const position = api.createCodeDocument(source, font, 16, offset).cursor;
          api.moveCodeCursorToPoint(document, position.x, position.y);
          const change = remove ? api.deleteCodeBackward(document) : api.insertCodeText(document, addition);
          source = remove ? source.slice(0, offset - 1) + source.slice(offset) : source.slice(0, offset) + addition + source.slice(offset);
          const update = highlighter.highlightCodeDocument(cache, document, change);
          assert.ok(update);
          view = highlighter.commitHighlightedLines(view, update);
          check();
          return update;
        }
      };
    }

    const local = session('const a = 1;\nconst b = 2;\nreturn a + b;');
    const first = local.view[0];
    const edited = local.view[1];
    const number = edited.tokens.find(token => token.text === '2');
    const last = local.view[2];
    const update = local.edit(24, '3');
    assert.strictEqual(update.updates.length, 1, 'ordinary edits only rescan the edited line');
    assert.strictEqual(local.view[0], first);
    assert.strictEqual(local.view[1], edited);
    assert.strictEqual(local.view[1].tokens.find(token => token.text === '23'), number);
    assert.strictEqual(local.view[2], last);
    local.edit(25, '', true);
    local.edit(13, '\n中\n');
    assert.strictEqual(local.view[4], last, 'inserting lines retains the unchanged suffix nodes and keys');
    local.edit(13, '', true);

    const samples = [
      'const a = 1;\nconst b = 2;\nconst c = 3;',
      '/* first\nmiddle\nlast */\nrun();',
      'const text = ' + String.fromCharCode(96) + 'first\nmiddle\nlast' + String.fromCharCode(96) + ';\nrun();',
      "const text = 'first\\\nsecond';\nrun();",
      "const text = 'first\\\r\n\r\nsecond';\nrun();",
      'return\n/foo/g;\nvalue / 2;',
      'name\n \n()\nkeep;',
      '#!/usr/bin/env qjs\nrun();'
    ];
    for (const source of samples) {
      const current = session(source);
      const offset = source.indexOf('\n') + 1;
      current.edit(offset, '/*');
      current.edit(offset + 2, '\n*/');
      current.edit(offset + 3, '', true);
      current.edit(0, '\n');
      current.edit(1, '', true);
    }
    const lookahead = session('name\n \n()\nlast;');
    lookahead.edit(7, 'x');
    assert.ok(lookahead.view[0].tokens.every(token => token.color === highlighter.getPaletteColors('midnight').plain));
    lookahead.edit(8, '', true);
    assert.ok(lookahead.view[0].tokens.some(token => token.color === highlighter.getPaletteColors('midnight').function));

    const regex = session('return\n/foo/g;\nvalue / 2;');
    regex.edit(6, '', true);
    regex.edit(5, 'n');
    const continued = session("const s = 'a\\\nb';\nlast();");
    continued.edit(13, '', true);
    continued.edit(12, '\\');

    const paste = session('start();\nend();');
    const tail = paste.view[1];
    paste.edit(8, '\n' + Array(140).fill('next();').join('\n'));
    assert.strictEqual(paste.view[paste.view.length - 1], tail);

    const capped = api.createCodeDocument('a+'.repeat(20), font, 16, 0);
    const cappedState = highlighter.createHighlightState('midnight', 4);
    assert.strictEqual(highlighter.highlightCodeDocument(cappedState, capped), null);
    const closeAsComment = api.insertCodeText(capped, '//');
    assert.ok(highlighter.highlightCodeDocument(cappedState, capped, closeAsComment).initial,
      'a capped document can recover on an edit without retaining partial lexer state');
  }

  await run();
});

test("fontProfile", async () => {
  const editorRoot = path.join(__dirname, '..', 'src', 'utils', 'editor');
  const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

  async function run() {
    const profileSource = fs.readFileSync(path.join(editorRoot, 'fontProfile.js'), 'utf8')
      .replace("import file from '@system.file';", 'const file = { readText: options => options.fail() };');
    const profileUrl = dataUrl(profileSource);
    const profile = await import(profileUrl);
    const first = await profile.readActiveFontProfile();
    first.name = 'changed';
    assert.equal((await profile.readActiveFontProfile()).name, profile.DEFAULT_FONT_PROFILE.name);
    assert.deepEqual(profile.validateFontProfile(profile.DEFAULT_FONT_PROFILE), profile.DEFAULT_FONT_PROFILE);
    assert.throws(() => profile.validateFontProfile({ ...profile.DEFAULT_FONT_PROFILE, sourceName: '../bad.ttf' }));
    assert.throws(() => profile.validateFontProfile({ ...profile.DEFAULT_FONT_PROFILE, asciiWidthRatio: Infinity }));

    const packageSource = fs.readFileSync(path.join(editorRoot, 'fontManager.js'), 'utf8')
      .replace("import file from '@system.file';", 'const file = {};')
      .replace("'./fontProfile.js'", JSON.stringify(profileUrl))
      .replace(/import \{ decodeBase64 \}[^;]+;/, '')
      .replace(/import \{ formatAdler32, updateAdler32 \}[^;]+;/, '');
    const { validResumeState } = await import(dataUrl(packageSource + '\nexport { validResumeState };'));
    const state = {
      version: 2, expectedBytes: 6000, chunkBytes: 3072,
      fingerprint: '0123456789abcdef', checksum: '00000001', checksumAlgorithm: 'adler32',
      nextIndex: 1, bytes: 3072, adlerA: 1, adlerB: 0, profile: profile.DEFAULT_FONT_PROFILE
    };
    const valid = value => validResumeState(value, state.profile, 6000, 3072, state.fingerprint, state.checksum);
    assert.equal(valid(state), true);
    for (const patch of [{ nextIndex: '1' }, { nextIndex: 1.5 }, { bytes: '3072' },
      { adlerA: NaN }, { adlerB: Infinity }, { nextIndex: 3, bytes: 6000 }]) {
      assert.equal(valid({ ...state, ...patch }), false);
    }
  }

  await run();
});

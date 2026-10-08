// Check incremental state against an independent full-text oracle, not device timing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
  console.log('editor document checks passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function loadHighlighter() {
  const sourcePath = path.join(__dirname, '..', 'src', 'utils', 'editor', 'javascriptHighlighter.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  return import(dataUrl);
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

  const pathologicalSource = Array(100000).fill('a+').join('');
  const startedAt = Date.now();
  const pathologicalTokens = highlighter.highlightJavascript(pathologicalSource, 'pathological');
  const elapsed = Date.now() - startedAt;
  assert.strictEqual(pathologicalTokens.length, 1);
  assert.strictEqual(pathologicalTokens[0].text, pathologicalSource);
  assert.ok(elapsed < 1000, 'pathological input took ' + elapsed + 'ms');

  const mergedPlainSource = new Array(200001).join('(');
  const mergedStartedAt = Date.now();
  const mergedPlainTokens = highlighter.highlightJavascript(mergedPlainSource, 'merged-plain');
  const mergedElapsed = Date.now() - mergedStartedAt;
  assert.strictEqual(mergedPlainTokens.length, 1);
  assert.strictEqual(mergedPlainTokens[0].text, mergedPlainSource);
  assert.ok(mergedElapsed < 1000, 'merged plain input took ' + mergedElapsed + 'ms');

  console.log('javascriptHighlighter tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

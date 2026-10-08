// Pure logic / delegation checks; these do not emulate Vela rendering or native services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'src', 'utils');
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
async function load(name, replacements = []) {
  let source = read(name);
  for (const [before, after] of replacements) {
    assert(source.includes(before), 'Loader anchor missing: ' + before);
    source = source.replace(before, after);
  }
  return import(url(source));
}

async function run() {
  const preferences = await load('editor/editorPreferences.js');
  for (const value of [null, undefined, '', '  ', false, [], {}, Infinity, 'Infinity', NaN]) {
    assert.equal(preferences.normalizeFontSize(value), 16);
  }
  assert.equal(preferences.normalizeFontSize('20.6'), 21);
  assert.equal(preferences.normalizeFontSize(0), 8);
  assert.equal(preferences.normalizeFontSize(100), 48);
  assert.equal(preferences.normalizeFontSize('bad', 22), 22);
  assert.equal(preferences.normalizeFontSize('bad', Infinity), 16);

  const codeEditor = await load('editor/codeEditor.js');
  const fontProfile = { lineHeightRatio: 1.2, lineHeightOffset: 1,
    asciiWidthRatio: 0.5, wideWidthRatio: 1 };
  assert.equal(codeEditor.countWideCharacters('a中b'), 1);
  assert.equal(codeEditor.getCodeWidth(0), 336);
  assert.equal(codeEditor.getLineHeight({ lineHeightRatio: 0.8, lineHeightOffset: -8 }, 8), 1);
  assert.equal(codeEditor.getCharacterWidth('中', fontProfile, 16), 16);

  const routes = await load('core/routeManager.js', [["import router from '@system.router';", 'const router = {};']]);
  for (const input of ['settingsEditor', '/settings/editor/', '/settings//editor', '\\settings\\editor']) {
    assert.equal(routes.resolveRoute(input), '/settings/editor');
  }
  assert.equal(routes.resolveRoute('///'), '/');
  assert.equal(routes.resolveRoute('hap://app/example/page'), 'hap://app/example/page');
  assert.throws(() => routes.resolveRoute('/settings/../editor'), /非法/);

  const feedback = await load('core/uiFeedback.js', [
    ["import prompt from '@system.prompt';", 'const prompt = { showToast: value => globalThis.__smallToast = value };'],
    ["import vibrator from '@system.vibrator';", 'const vibrator = {};']
  ]);
  for (const [duration, expected] of [[undefined, 1500], [300, 1500], ['2000', 2000], [20000, 10000], [Infinity, 1500]]) {
    feedback.showToast(0, duration);
    assert.deepEqual(globalThis.__smallToast, { message: '0', duration: expected });
  }
  delete globalThis.__smallToast;

  const compat = await load('core/runtimeCompat.js');
  let loaded = 0;
  const unavailable = compat.loadOptionalSystemModule({ canIUse() { throw new Error('unsupported query'); } },
    'system.battery', ['getStatus'], () => { loaded += 1; });
  assert.equal(loaded, 0);
  assert.throws(() => unavailable.getStatus(), error => error.code === 203);
  const callbacks = [];
  await new Promise(resolve => unavailable.getStatus({
    fail(_message, code) { callbacks.push(code); },
    complete() { callbacks.push('complete'); resolve(); }
  }));
  assert.deepEqual(callbacks, [203, 'complete']);
  const module = {};
  assert.equal(compat.loadOptionalSystemModule({}, 'system.audio', ['play'], () => module), module);
  let nativeCallback;
  compat.scheduleNextTick({ $nextTick(callback) { nativeCallback = callback; } }, () => callbacks.push('tick'));
  assert.equal(callbacks.length, 2);
  nativeCallback();
  assert.equal(callbacks[2], 'tick');

  const contractUrl = url(read('runtime/runtimeContract.js'));
  const consoleModule = await load('runtime/consoleBuffer.js', [["'./runtimeContract.js'", JSON.stringify(contractUrl)]]);
  const buffer = consoleModule.createConsoleBuffer(() => {});
  const value = Object.create(Object.fromEntries(Array.from({ length: 9 }, (_, i) => ['inherited' + i, i])));
  buffer.console.log(value);
  assert.equal(buffer.read(), '{}');
  for (let i = 0; i < 65; i += 1) buffer.console.log(i);
  assert.match(buffer.read(), /^已省略/);
  buffer.dispose();
  assert.equal(buffer.read(), '');
  console.log('small shared module checks passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

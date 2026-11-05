const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function homepage(content) {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/index/index.ux'), 'utf8')
    .match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*;\r?\n/gm, '').replace('export default', 'return');
  const calls = { dialogs: [], editors: [], routes: [], runs: [] };
  let settle;
  const page = new Function('push', 'showToast', 'vibrate', 'utf8ByteLength', 'formatFileSize', 'formatError', source)(
    route => calls.routes.push(route), () => {}, () => {}, value => Buffer.byteLength(value, 'utf8'),
    bytes => bytes + ' B', error => error.message);
  Object.assign(page, page.private, { pageActive: true, pageVisible: true, selectedFileIndex: 0, fileList: [{ name: 'large.js' }],
    $app: { $def: {
      getScriptManager: () => ({ read: async () => content }),
      openDialog(type, options, owner) { calls.dialogs.push({ type, options, owner }); return new Promise(resolve => { settle = resolve; }); },
      openEditor: (...args) => calls.editors.push(args),
      openRunner: (...args) => calls.runs.push(args)
    } }
  });
  return { page, calls, settle: action => settle({ action }) };
}

test('scripts over 48 KiB wait for confirmation before preparing or navigating to the editor', async () => {
  const content = '中'.repeat(16385);
  const h = homepage(content); const pending = h.page.openSelected('edit');
  await Promise.resolve();
  assert.equal(h.calls.dialogs.length, 1);
  assert.equal(h.calls.dialogs[0].type, 'confirm');
  assert.equal(h.calls.dialogs[0].owner, h.page);
  assert.match(h.calls.dialogs[0].options.message, /48 KiB/);
  assert.deepEqual(h.calls.editors, []); assert.deepEqual(h.calls.routes, []);
  assert.equal(h.page.fileActionBusy, true);
  h.page.openSelected('edit'); assert.equal(h.calls.dialogs.length, 1);
  h.settle('confirm'); await pending;
  assert.deepEqual(h.calls.editors, [['large.js', content]]);
  assert.deepEqual(h.calls.routes, ['editor']); assert.equal(h.page.fileActionBusy, false);
});

test('canceling or leaving a large-script warning never opens the editor', async () => {
  for (const action of ['cancel', 'confirm']) {
    const h = homepage('x'.repeat(48 * 1024 + 1)); const pending = h.page.openSelected('edit');
    await Promise.resolve();
    if (action === 'confirm') h.page.pageActive = false;
    h.settle(action); await pending;
    assert.deepEqual(h.calls.editors, []); assert.deepEqual(h.calls.routes, []);
  }
});

test('scripts at the 48 KiB boundary open directly and large scripts can still run directly', async () => {
  const content = 'x'.repeat(48 * 1024);
  const h = homepage(content); await h.page.openSelected('edit');
  assert.equal(h.calls.dialogs.length, 0); assert.deepEqual(h.calls.editors, [['large.js', content]]);
  const run = homepage(content + 'x'); await run.page.openSelected('run');
  assert.equal(run.calls.dialogs.length, 0); assert.deepEqual(run.calls.runs, [['large.js', content + 'x']]);
});

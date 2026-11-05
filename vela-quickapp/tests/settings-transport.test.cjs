const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(options = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/settings/settings.ux'), 'utf8');
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^\s*import .*;[ \t]*$/gm, '').replace('export default', 'globalThis.page =');
  const writes = [], dialogs = [], toasts = [];
  const context = {
    getCurrentClock: () => '12:00', startPageClock() {}, stopPageClock() {},
    vibrate() {}, showToast: value => toasts.push(value), formatError: (error, operation) => operation + '：' + error.message,
    back() {}, push() {}
  };
  vm.runInNewContext(script, context);
  const page = Object.assign({}, context.page, context.page.private);
  let reads = 0, delivered = false, cancellations = 0;
  page.$app = { $def: {
    deliverDialog: () => delivered,
    cancelOwnedDialog: () => { cancellations++; },
    getCloudClients: () => ({ deviceAccount: { getState: async () => {
      reads++;
      return { paired: false, transport: options.transport || 'interconnect' };
    } } }),
    getConfigManager: () => ({ set: async (key, value) => {
      writes.push({ key, value });
      if (options.save) return options.save();
    } }),
    openDialog: async (type, dialog, owner) => {
      dialogs.push({ type, dialog, owner });
      return options.result || { action: 'confirm', value: 'fetch' };
    }
  } };
  return { page, writes, dialogs, toasts, reads: () => reads, cancellations: () => cancellations,
    deliverNextDialog: () => { delivered = true; } };
}

test('transport is selected from settings without pairing and saved under the existing key', async () => {
  const state = fixture();
  state.page.onInit(); state.page.onShow();
  await flush();
  assert.equal(state.page.transport, 'interconnect');
  assert.equal(state.page.transportLabel, 'AstroBox 网络桥接');
  assert.deepEqual(state.writes, [], 'Reading an automatic default must not persist it');
  await state.page.selectTransport();
  assert.equal(state.dialogs[0].type, 'select');
  assert.equal(state.dialogs[0].dialog.value, 'interconnect');
  assert.equal(state.dialogs[0].owner, state.page);
  assert.deepEqual(state.writes, [{ key: 'cloud.transport', value: 'fetch' }]);
  assert.equal(state.page.transportLabel, 'fetch 直连');
  state.deliverNextDialog(); state.page.onShow();
  assert.equal(state.reads(), 1, 'Returning from a dialog must not race a fresh settings read');
  state.page.onDestroy();
  assert.equal(state.cancellations(), 1);
  const accountSource = fs.readFileSync(path.join(__dirname, '../src/pages/settings/cloud/cloud.ux'), 'utf8');
  assert.doesNotMatch(accountSource, /@click="selectTransport"|saveTransport\(/);
});

test('canceling or failing to save keeps the previous transport', async () => {
  const canceled = fixture({ result: { action: 'cancel' } });
  await canceled.page.loadTransport();
  await canceled.page.selectTransport();
  assert.deepEqual(canceled.writes, []);
  const failed = fixture({ save: async () => { throw new Error('write failed'); } });
  await failed.page.loadTransport();
  await failed.page.selectTransport();
  assert.equal(failed.page.transport, 'interconnect');
  assert.equal(failed.page.transportLabel, 'AstroBox 网络桥接');
  assert.equal(failed.page.transportBusy, false);
  assert.deepEqual(failed.toasts, ['保存云服务传输方式：write failed']);
});

test('duplicate saves and late updates after leaving settings are ignored', async () => {
  let finish;
  const state = fixture({ save: () => new Promise(resolve => { finish = resolve; }) });
  await state.page.loadTransport();
  const saving = state.page.saveTransport('fetch');
  state.page.saveTransport('interconnect');
  assert.equal(state.writes.length, 1);
  state.page.onDestroy(); finish(); await saving;
  assert.equal(state.page.transport, 'interconnect');
  assert.deepEqual(state.toasts, []);
});

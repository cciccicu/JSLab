const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(options = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/index/index.ux'), 'utf8');
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*;\s*$/gm, '').replace('export default', 'globalThis.page =');
  const dialogs = [], writes = [], errors = [];
  const config = options.config || {};
  let reads = 0, settle;
  const context = {
    console: { error: (...args) => errors.push(args) },
    getCurrentClock: () => '12:00', startPageClock() {}, stopPageClock() {},
    setNetworkFeedbackVisible() {}, stopNetworkFeedback() {},
    formatError: error => error.message, formatFileSize: String, formatModifiedDate: String,
    showToast() {}
  };
  vm.runInNewContext(script, context);
  const page = Object.assign({}, context.page, context.page.private);
  page.$app = { $def: {
    deliverDialog: () => false,
    cancelOwnedDialog: () => { if (settle) settle({ action: 'cancel' }); },
    getScriptManager: () => ({ list: async () => [] }),
    getConfigManager: () => ({
      get: async (key, fallback) => key in config ? config[key] : fallback,
      set: async (key, value) => { writes.push({ key, value }); config[key] = value; }
    }),
    getCloudClients: () => ({ deviceAccount: { getDefaultTransport: () => {
      reads++;
      return options.detect ? options.detect() : Promise.resolve(options.transport || 'interconnect');
    } } }),
    openDialog(type, dialog, owner) {
      if (options.failDialog) return Promise.reject(new Error('dialog busy'));
      dialogs.push({ type, dialog, owner });
      return new Promise(resolve => { settle = resolve; });
    }
  } };
  return { page, dialogs, writes, errors, config, reads: () => reads, dismiss: () => settle({ action: 'confirm' }) };
}

test('unsupported fetch triggers one homepage notice and remembers dismissal across restarts', async () => {
  const state = fixture({ config: { 'cloud.transport': 'fetch' } });
  state.page.onShow(); state.page.onShow();
  await flush();
  assert.equal(state.reads(), 1);
  assert.equal(state.dialogs.length, 1);
  assert.equal(state.dialogs[0].type, 'alert');
  assert.equal(state.dialogs[0].owner, state.page);
  assert.match(state.dialogs[0].dialog.message, /也可在设置中切换传输方式/);
  assert.deepEqual(state.writes, []);
  state.page.onHide(); state.dismiss(); await flush();
  assert.deepEqual(state.writes, [{ key: 'cloud.fetchUnsupportedNoticeShown', value: true }]);
  assert.equal(state.config['cloud.transport'], 'fetch', 'The notice must not overwrite a manual choice');
  state.page.onShow(); await flush();
  assert.equal(state.dialogs.length, 1);
  const restarted = fixture({ config: state.config });
  restarted.page.onShow(); await flush();
  assert.equal(restarted.dialogs.length, 0);
  assert.equal(restarted.reads(), 0);
});

test('fetch-capable devices do not show the unsupported notice', async () => {
  const state = fixture({ transport: 'fetch' });
  state.page.onShow(); await flush();
  state.page.onShow(); await flush();
  assert.equal(state.dialogs.length, 0);
  assert.equal(state.reads(), 1);
  assert.deepEqual(state.writes, []);
});

test('a delayed device check does not open a dialog over another page', async () => {
  let finish;
  const detected = new Promise(resolve => { finish = resolve; });
  const state = fixture({ detect: () => detected });
  state.page.onShow(); await flush();
  state.page.onHide(); finish('interconnect'); await flush();
  assert.equal(state.dialogs.length, 0);
  assert.deepEqual(state.writes, []);
  state.page.onShow(); await flush();
  assert.equal(state.dialogs.length, 1);
  state.dismiss(); await flush();
});

test('active operations defer the notice and a failed dialog never marks it as shown', async () => {
  const busy = fixture();
  busy.page.cloudBusy = true;
  busy.page.onShow(); await flush();
  assert.equal(busy.dialogs.length, 0);
  assert.deepEqual(busy.writes, []);
  busy.page.cloudBusy = false;
  busy.page.onShow(); await flush();
  assert.equal(busy.dialogs.length, 1);
  busy.dismiss(); await flush();
  const failed = fixture({ failDialog: true });
  failed.page.onShow(); await flush();
  assert.deepEqual(failed.writes, []);
  assert.equal(failed.page.transportNoticePending, false);
  assert.equal(failed.page.transportNoticeChecked, false);
});

test('leaving the homepage permanently while a notice is open does not mark it dismissed', async () => {
  const state = fixture();
  state.page.onShow(); await flush();
  state.page.onDestroy(); await flush();
  assert.deepEqual(state.writes, []);
});

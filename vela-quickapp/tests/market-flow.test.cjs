const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const flush = () => new Promise(resolve => setImmediate(resolve));

function pageFixture(relative) {
  const timers = new Map(), navigation = [], toasts = [];
  let nextTimer = 0;
  const ux = fs.readFileSync(path.join(__dirname, '../src/pages/tools/market', relative), 'utf8');
  const script = ux.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\s*$/gm, '').replace('export default', 'globalThis.page =');
  const context = {
    console, getCurrentClock: () => '12:00', startPageClock() {}, stopPageClock() {},
    startNetworkFeedback() {}, stopNetworkFeedback() {}, setNetworkFeedbackVisible() {},
    enterNetworkPage: (_page, next) => next(), errorMessage: error => error.message,
    formatError: error => error.message, vibrate() {}, showToast: text => toasts.push(text),
    back: () => navigation.push('back'), push() {},
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  vm.runInNewContext(script, context);
  const page = Object.assign({}, context.page, context.page.protected || {}, context.page.private);
  const app = { deliverDialog() {}, cancelOwnedDialog() {} };
  page.$app = { $def: app };
  return {
    page, app, navigation, toasts, timers
  };
}

for (const status of ['pending', 'published', 'rejected']) {
  test(`handset ${status} submission closes the form and hands the result to my publications`, async () => {
    const fixture = pageFixture('upload/upload.ux');
    const { page, app } = fixture;
    Object.assign(page, { stage: 'details', marketName: 'name', description: 'description', tags: '', supportedDevices: ['pro'], selectedName: 'local.js' });
    let finish, calls = 0;
    app.openDialog = async () => ({ action: 'confirm' });
    app.getCloudClients = () => ({ marketClient: { submitMarketScript() { calls++; return new Promise(resolve => { finish = resolve; }); } } });
    page.submit();
    await flush();
    assert.equal(page.stage, 'submitting');
    assert.equal(page.busy, true);
    page.submit();
    assert.equal(calls, 1);
    const result = { marketId: 4, status, statusText: 'state: ' + status };
    finish(result);
    await flush();
    assert.equal(app.marketSubmissionResult, result);
    assert.equal(app.marketRefreshNeeded, true);
    assert.deepEqual(fixture.navigation, ['back']);
  });
}

test('a failed handset submission restores the same draft', async () => {
  const { page, app, navigation } = pageFixture('upload/upload.ux');
  Object.assign(page, { stage: 'details', marketName: 'name', description: 'description', tags: 'tool', supportedDevices: ['pro'], selectedName: 'local.js' });
  app.openDialog = async () => ({ action: 'confirm' });
  app.getCloudClients = () => ({ marketClient: { submitMarketScript: async () => { throw new Error('offline'); } } });
  page.submit();
  await flush();
  assert.equal(page.stage, 'details');
  assert.equal(page.busy, false);
  assert.equal(page.selectedName, 'local.js');
  assert.equal(page.marketName, 'name');
  assert.equal(page.submissionText, 'offline');
  assert.deepEqual(navigation, []);
});

test('returning from submission opens my publications and removes a search that hid the result', async () => {
  const { page, app } = pageFixture('market.ux');
  Object.assign(page, { initialized: true, mine: false, query: 'unrelated' });
  app.marketRefreshNeeded = true;
  app.marketSubmissionResult = { marketId: 4, status: 'rejected', statusText: '已拒绝' };
  const calls = [];
  app.getCloudClients = () => ({ marketClient: { listMarketScripts: async (query, mine) => {
    calls.push({ query, mine }); return [{ id: 4, status: 'rejected', statusText: '已拒绝' }];
  } } });
  page.onShow();
  await flush();
  assert.equal(page.mine, true);
  assert.equal(page.query, '');
  assert.equal(page.statusText, '已拒绝');
  assert.equal(app.marketSubmissionResult, null);
  assert.deepEqual(calls, [{ query: '', mine: true }]);
  page.onDestroy();
});

test('handset pending reviews refresh only after an explicit refresh action', async () => {
  const fixture = pageFixture('market.ux');
  const { page, app } = fixture;
  page.mine = true;
  let calls = 0;
  app.getCloudClients = () => ({ marketClient: { listMarketScripts: async () => {
    calls++;
    return [{ id: 1, status: calls === 1 ? 'pending' : 'published' }];
  } } });
  page.onShow();
  await flush();
  assert.equal(page.visibleScripts[0].statusText, '待审核');
  page.onHide();
  page.onShow();
  await flush();
  assert.equal(calls, 1, 'showing the page again must not automatically fetch review states');
  assert.equal(fixture.timers.size, 0);
  page.load();
  await flush();
  assert.equal(calls, 2);
  assert.equal(page.visibleScripts[0].statusText, '已发布');
  page.onDestroy();
});

test('handset detail shows full rejection reasons and does not poll when visible again', async () => {
  const fixture = pageFixture('view/view.ux');
  const { page, app } = fixture;
  Object.assign(page, { marketId: '4', isMineView: true });
  const reason = '详细原因'.repeat(200);
  let sourceReads = 0;
  app.getCloudClients = () => ({ marketClient: {
    getMarketScript: async () => { sourceReads++; return { id: 4, source: 'console.log(1)', status: 'rejected', statusText: '已拒绝', reviewReason: reason }; }
  } });
  page.onShow(); await flush();
  page.onHide(); page.onShow(); await flush();
  assert.equal(page.statusLabel, '已拒绝');
  assert.equal(page.reviewReason, reason);
  assert.equal(page.statusText, '审核拒绝原因：' + reason);
  assert.equal(sourceReads, 1);
  assert.equal(fixture.timers.size, 0);
  page.onDestroy();
});

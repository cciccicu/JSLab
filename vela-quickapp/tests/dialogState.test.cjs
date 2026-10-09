// Check pure request ownership and the real Vela style compiler; no UI/device simulation.
require('../scripts/check-runtime-contract.cjs');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { UxParser } = require('@aiot-toolkit/parser');
const { ProjectType } = require('@aiot-toolkit/shared-utils');
const StyleToTypescript = require('@aiot-toolkit/parser/lib/ux/translate/vela/StyleToTypescript').default;
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const methods = ['openDialog', 'getDialog', 'settleDialog', 'deliverDialog', 'cancelOwnedDialog', 'closeOwnedDialog', 'dialogDestroyed'];
const limits = JSON.parse(read('../runtime-contract.json')).dialogs;

function loadDialogState(push, back) {
  const source = read('src/utils/core/dialogState.js').replace(/^import .*;\r?\n/gm, '').replace(/export function /g, 'function ');
  return new Function('push', 'back', 'DIALOG_LIMITS', source + '\nreturn {' + methods.join(',') + '};')(push, back, limits);
}

function loadApp(state) {
  const source = read('src/app.ux').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?\n/gm, '').replace('export default', 'return');
  // app.ux assembles these imports at module load time; this suite only exercises its dialog bridge.
  const clients = { deviceAccount: {}, deviceAi: {}, marketClient: {}, cloudFilesClient: {} };
  return new Function('requestDialog', ...methods.slice(1), ...Object.keys(clients), source)(
    ...methods.map(method => state[method]), ...Object.values(clients)
  );
}

async function checkOwnership() {
  let route, failPush = false, backs = 0;
  const state = loadDialogState((name, params) => {
    if (failPush) throw new Error('native route failure');
    route = { name, ...params };
  }, () => { backs++; });
  const app = loadApp(state);
  // A separate bundle really has a separate module; pages must use the app bridge.
  const pageCopy = loadDialogState(() => {}, () => {});
  const owner = {}, otherOwner = {};
  const cases = [
    ['alert', {}, null], ['confirm', { secondaryText: '另存' }, null],
    ['text', { value: '初值' }, '新值'], ['number', { value: 3 }, 5],
    ['select', { items: [{ label: '运行', value: 'run' }] }, 'run']
  ];
  for (const [type, options, value] of cases) {
    const result = app.openDialog(type, options, owner);
    const pageType = type === 'alert' ? 'confirm' : type;
    assert.equal(pageCopy.getDialog(pageType, route.dialogId), null);
    const data = app.getDialog(pageType, route.dialogId);
    assert.ok(data, type + ' must be readable from the app instance');
    assert.equal(app.getDialog(pageType, 'stale-id'), null);
    assert.equal(app.deliverDialog(owner), false, 'opening is not a completed result');
    await assert.rejects(app.openDialog('alert', {}, otherOwner), { code: 'DIALOG_BUSY' });
    assert.equal(app.settleDialog(data, 'confirm', value), true);
    assert.equal(app.settleDialog(data, 'cancel', null), false);
    app.dialogDestroyed(data); // Must preserve an already confirmed result.
    assert.equal(app.deliverDialog(otherOwner), false);
    assert.equal(app.deliverDialog(owner), true);
    assert.deepEqual(await result, { action: 'confirm', value });
    assert.equal(app.deliverDialog(owner), false);
  }
  let result = app.openDialog('confirm', {}, owner);
  const oldData = app.getDialog('confirm', route.dialogId);
  // Invalid-page recovery and native destruction record cancellation before delivery.
  app.dialogDestroyed({ id: route.dialogId });
  assert.equal(app.deliverDialog(owner), true);
  assert.deepEqual(await result, { action: 'cancel', value: null });
  result = app.openDialog('confirm', {}, owner);
  app.dialogDestroyed(oldData); // A late old-page callback cannot cancel a new request.
  assert.equal(app.deliverDialog(owner), false);
  assert.equal(app.closeOwnedDialog(otherOwner), false);
  assert.equal(app.closeOwnedDialog(owner), true);
  assert.equal(backs, 1);
  assert.equal(app.deliverDialog(owner), true);
  assert.deepEqual(await result, { action: 'cancel', value: null });
  result = app.openDialog('text', {}, owner);
  app.cancelOwnedDialog(otherOwner);
  app.cancelOwnedDialog(owner);
  assert.deepEqual(await result, { action: 'cancel', value: null });
  failPush = true;
  await assert.rejects(app.openDialog('alert', {}, owner), { code: 'DIALOG_OPEN_FAILED' });
  failPush = false;
  result = app.openDialog('alert', {}, owner);
  app.cancelOwnedDialog(owner);
  await result;
  console.log('Dialog app ownership/result/reopen checks passed');
}

async function checkCompiledStyles() {
  for (const name of ['confirm', 'select', 'text-input', 'number-input']) {
    const filePath = path.join(root, 'src/pages/overlay', name, name + '.ux');
    const options = { filePath, projectPath: root, projectType: ProjectType.VELA_UX, content: fs.readFileSync(filePath, 'utf8'), onLog: () => {} };
    const { ast } = await new UxParser(options, { sourceRoot: 'src' }, {}, () => {}).parser();
    const { targetTree } = new StyleToTypescript(options, {}).translate(ast.style, []);
    const style = name => {
      const rule = targetTree.find(([selectors]) => selectors.length === 1 && selectors[0][1] === name);
      assert.ok(rule, filePath + ': missing compiled .' + name);
      return rule[1];
    };
    assert.equal(style('page').width, '336px');
    assert.equal(style('page').height, '480px');
    assert.equal(style('btn').width, '72px');
    assert.equal(style('btn').position, 'absolute');
    if (name === 'number-input') assert.equal(style('input-card').height, '102px');
    else if (name === 'text-input') assert.equal(style('input-card').height, '123px');
    else assert.equal(style(name === 'select' ? 'choices' : 'body').flexDirection, 'column');
    console.log(name + ': shared styles compiled (' + targetTree.length + ' rules)');
  }
}

(async () => { await checkOwnership(); await checkCompiledStyles(); })().catch(error => { console.error(error); process.exitCode = 1; });

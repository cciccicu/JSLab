const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function loadDialogState() {
  const sourcePath = path.join(__dirname, '..', 'src', 'utils', 'core', 'dialogState.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  return import(dataUrl);
}

async function loadScriptDialogApi() {
  const sourcePath = path.join(__dirname, '..', 'src', 'utils', 'runtime', 'scriptDialogApi.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  return import(dataUrl);
}

function createApp(dialog) {
  return {
    dialog,
    closeDialog(dialogId) {
      if (!this.dialog || this.dialog.id !== dialogId) return false;
      this.dialog = null;
      return true;
    }
  };
}

async function run() {
  const state = await loadDialogState();
  let callbackCount = 0;
  let callbackValue = null;
  const request = state.createDialogRequest('text', {
    title: 'Name',
    callbacks: {
      onConfirm(value) {
        callbackCount += 1;
        callbackValue = value;
      }
    }
  });

  assert.strictEqual(request.type, 'text');
  assert.strictEqual(request.title, 'Name');
  assert.strictEqual(typeof request.id, 'string');
  assert.strictEqual(typeof request.callbacks.onConfirm, 'function');

  const app = createApp(request);
  assert.strictEqual(state.settleDialog(app, request, 'onConfirm', 'demo'), true);
  assert.strictEqual(state.settleDialog(app, request, 'onConfirm', 'duplicate'), false);
  assert.strictEqual(callbackCount, 1);
  assert.strictEqual(callbackValue, 'demo');

  let callbackErrors = 0;
  const originalError = console.error;
  console.error = () => { callbackErrors += 1; };
  const throwingRequest = state.createDialogRequest('confirm', {
    callbacks: { onConfirm: () => { throw new Error('expected'); } }
  });
  assert.strictEqual(state.settleDialog(createApp(throwingRequest), throwingRequest, 'onConfirm'), true);
  console.error = originalError;
  assert.strictEqual(callbackErrors, 1);

  let canceled = false;
  const active = state.createDialogRequest('number', {
    callbacks: { onCancel: () => { canceled = true; } }
  });
  const recoveryApp = createApp(active);
  assert.strictEqual(state.recoverInvalidDialog(recoveryApp), true);
  assert.strictEqual(canceled, true);
  assert.strictEqual(state.recoverInvalidDialog(recoveryApp), false);

  const userDialogs = await loadScriptDialogApi();
  let opened = null;
  let runActive = true;
  const dialogApi = userDialogs.createScriptDialogApi({
    openDialog(type, options) {
      opened = { type, options };
      return 'opened-dialog';
    }
  }, () => runActive);

  const selectedPromise = dialogApi.select({
    title: 'Color',
    message: 'Choose',
    options: ['red', 'blue'],
    initialValue: 'blue'
  });
  assert.strictEqual(opened.type, 'select');
  assert.deepStrictEqual(opened.options.options, ['red', 'blue']);
  assert.strictEqual(opened.options.initialValue, 'blue');
  opened.options.callbacks.onSelect('blue');
  assert.strictEqual(await selectedPromise, 'blue');

  const rejectedPromise = dialogApi.confirm({ title: 'Continue?' });
  opened.options.callbacks.onReject();
  assert.strictEqual(await rejectedPromise, false);

  const canceledPromise = dialogApi.confirm({ title: 'Cancel?' });
  opened.options.callbacks.onCancel();
  assert.strictEqual(await canceledPromise, null);

  runActive = false;
  await assert.rejects(dialogApi.text({ title: 'Inactive' }), /no longer active/);

  console.log('dialogState tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

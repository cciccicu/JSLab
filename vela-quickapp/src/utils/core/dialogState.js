let dialogSequence = 0;

function nextDialogId() {
  dialogSequence += 1;
  return 'dialog-' + Date.now() + '-' + dialogSequence;
}

export function createDialogRequest(type, options) {
  const request = Object.assign({}, options || {});
  request.id = nextDialogId();
  request.type = type;
  return request;
}

export function getDialog(appDefinition, type, fallback) {
  const dialog = appDefinition.dialog;
  return dialog && dialog.id && dialog.type === type ? dialog : fallback;
}

export function settleDialog(appDefinition, dialog, action, value) {
  if (!dialog || !dialog.id) return false;
  const activeDialog = appDefinition.dialog;
  if (!activeDialog || activeDialog.id !== dialog.id) return false;
  if (!appDefinition.closeDialog(dialog.id)) return false;

  const callbacks = dialog.callbacks || {};
  const callback = callbacks[action];
  if (typeof callback === 'function') {
    try {
      callback(value);
    } catch (error) {
      console.error('Dialog callback failed:', error);
    }
  }
  return true;
}

export function recoverInvalidDialog(appDefinition) {
  const activeDialog = appDefinition.dialog;
  if (!activeDialog) return false;
  return settleDialog(appDefinition, activeDialog, 'onCancel');
}

export default {
  createDialogRequest,
  getDialog,
  settleDialog,
  recoverInvalidDialog
};

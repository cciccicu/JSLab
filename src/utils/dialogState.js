export function getDialog(appDefinition, type, fallback) {
  const dialog = appDefinition.dialog;
  return dialog && dialog.type === type ? dialog : fallback;
}

export function invokeDialogCallback(appDefinition, dialog, callbackName, value) {
  const callbacks = dialog.callbacks || {};
  const callback = callbacks[callbackName];
  appDefinition.closeDialog();

  if (typeof callback === 'function') callback(value);
}

export default {
  getDialog,
  invokeDialogCallback
};

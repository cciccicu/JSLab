function openDialog(appDefinition, isActive, type, options, fallbackTitle, valueKeys, callbacks) {
  return new Promise((resolve, reject) => {
    if (!isActive()) {
      reject(new Error('script is no longer active'));
      return;
    }
    const source = options && typeof options === 'object' ? options : {};
    const request = { title: String(source.title || fallbackTitle), message: String(source.message || ''), callbacks: {} };
    valueKeys.forEach((key) => { if (source[key] !== undefined) request[key] = source[key]; });
    Object.keys(callbacks).forEach((name) => {
      request.callbacks[name] = (value) => { if (isActive()) resolve(callbacks[name](value)); };
    });
    if (!appDefinition.openDialog(type, request)) reject(new Error('another dialog is already open'));
  });
}

export function createScriptDialogApi(appDefinition, isActive) {
  return {
    text(value) { return openDialog(appDefinition, isActive, 'text', value, '文本输入', ['placeholder', 'initialValue', 'maxLength'], { onConfirm: result => result, onCancel: () => null }); },
    number(value) { return openDialog(appDefinition, isActive, 'number', value, '数字输入', ['initialValue'], { onConfirm: result => result, onCancel: () => null }); },
    select(value) { return openDialog(appDefinition, isActive, 'select', value, '选择', ['options', 'initialValue'], { onSelect: result => result, onCancel: () => null }); },
    confirm(value) { return openDialog(appDefinition, isActive, 'confirm', value, '确认', [], { onConfirm: () => true, onReject: () => false, onCancel: () => null }); }
  };
}

export default { createScriptDialogApi };

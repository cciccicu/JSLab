export function createScriptDialogApi(appDefinition, isActive, owner) {
  const api = {};
  ['alert', 'confirm', 'text', 'number', 'select'].forEach(type => {
    api[type] = options => {
      if (!isActive()) {
        const error = new Error('运行页已退出'); error.code = 'DIALOG_INACTIVE';
        return Promise.reject(error);
      }
      return appDefinition.openDialog(type, options, owner);
    };
  });
  return api;
}
export default { createScriptDialogApi };

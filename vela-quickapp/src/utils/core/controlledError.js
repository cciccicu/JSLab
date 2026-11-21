// The original message remains the protocol error for older clients.
export function controlledError(message) {
  const error = new Error(message);
  error.jslabControlled = true;
  return error;
}

export function bridgeErrorInfo(error) {
  const message = error && error.message ? error.message : String(error || '未知错误');
  if (!error || error.jslabControlled !== true) return { message };
  const translations = [
    ['Failed to create script directory: ', '创建脚本目录失败，系统错误码：'],
    ['Invalid script directory response', '系统返回了无效的脚本目录信息'],
    ['Failed to list scripts: ', '读取脚本列表失败，系统错误码：'],
    ['Failed to read script: ', '读取脚本失败，系统错误码：'],
    ['Failed to write script: ', '写入脚本失败，系统错误码：'],
    ['Failed to rename script: ', '重命名脚本失败，系统错误码：'],
    ['Failed to delete script: ', '删除脚本失败，系统错误码：'],
    ['scriptData read failed: ', '读取脚本数据失败，系统错误码：'],
    ['scriptData write failed: ', '写入脚本数据失败，系统错误码：']
  ];
  const display = translations.reduce((text, item) => text.replace(item[0], item[1]), message);
  return { message, origin: 'jslab', display };
}

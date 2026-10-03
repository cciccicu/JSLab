const VELA_ERROR_MESSAGES = {
  200: 'Vela 系统内部错误',
  201: '用户拒绝了本次请求',
  202: '传给系统接口的参数无效',
  203: '当前设备不支持此系统接口',
  204: '系统接口请求超时',
  205: '系统检测到重复提交',
  207: '用户拒绝授权且选择不再询问',
  300: '设备存储 I/O 错误'
};

const ENGLISH_MESSAGES = {
  'Failed to create script directory': '无法创建脚本目录',
  'Invalid script directory response': '系统返回的脚本目录数据格式无效',
  'Failed to list scripts': '无法列出脚本目录',
  'Failed to read script': '无法读取脚本文件',
  'Failed to write script': '无法写入脚本文件',
  'Failed to rename script': '无法重命名脚本文件',
  'Failed to delete script': '无法删除脚本文件',
  'Failed to read configuration': '无法读取配置文件',
  'Failed to access configuration': '无法访问配置文件',
  'Failed to write configuration': '无法写入配置文件'
};

function cleanDetail(value) {
  let text = '';
  if (typeof value === 'string' || typeof value === 'number') text = String(value);
  else if (value && typeof value.message === 'string') text = value.message;
  else if (value && typeof value === 'object') {
    try { text = JSON.stringify(value); } catch (error) { text = ''; }
  }
  text = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (/authorization|bearer\s|token["'=:\s]/i.test(text)) return '';
  return text.length > 96 ? text.slice(0, 93) + '...' : text;
}

function createNativeError(source, data, code) {
  const error = new Error('native_api_error');
  error.source = String(source || 'vela');
  error.nativeCode = Number(code);
  error.detail = cleanDetail(data);
  return error;
}

function nativeReason(code) {
  return VELA_ERROR_MESSAGES[Number(code)] || '';
}

function joinContext(operation, reason) {
  const context = String(operation || '当前操作').replace(/[：:，,。\s]+$/g, '');
  return context + '：' + reason;
}

function translateExistingMessage(message) {
  const raw = cleanDetail(message);
  const match = /^([^:]+):\s*(-?\d+)$/.exec(raw);
  const base = match ? match[1] : raw;
  const translated = ENGLISH_MESSAGES[base];
  if (!translated) return null;
  if (!match) return translated;
  const code = Number(match[2]);
  return translated + '（Vela ' + code + (nativeReason(code) ? '：' + nativeReason(code) : '') + '）';
}

function formatError(error, operation) {
  const value = error || {};
  const message = error === null || error === undefined ? '' : cleanDetail(value.message || value);
  const translated = translateExistingMessage(message);
  if (translated) return joinContext(operation, translated);

  const nativeCode = Number(value.nativeCode !== undefined ? value.nativeCode : value.code);
  if (Number.isFinite(nativeCode)) {
    const detail = cleanDetail(value.detail || value.data);
    const reason = nativeReason(nativeCode) || '未登记的 Vela 错误';
    return joinContext(operation, reason + '（Vela ' + nativeCode + (detail ? '：' + detail : '') + '）');
  }

  if (message && message !== '[object Object]') {
    const isReadableChinese = /[\u3400-\u9fff]/.test(message);
    return joinContext(operation, isReadableChinese ? message : '运行时错误「' + message + '」');
  }

  const source = cleanDetail(value.source) || '本地运行时';
  return joinContext(operation, source + '未返回错误详情');
}

export { cleanDetail, createNativeError, formatError, nativeReason };

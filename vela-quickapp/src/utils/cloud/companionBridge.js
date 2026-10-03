import interconnect from '@system.interconnect';
import brightness from '@system.brightness';
import jsManager from '../files/jsManager.js';
import fontManager from '../editor/fontManager.js';
import { sliceUtf8Chunk, utf8ByteLength } from '../files/fileMetadata.js';

const PROTOCOL_VERSION = 2;
const READ_CHUNK_BYTES = 4096;
const MAX_WRITE_SESSIONS = 2;
const WRITE_SESSION_TTL_MS = 2 * 60 * 1000;
const FONT_CHUNK_BYTES = 3 * 1024;
const FONT_CHECKSUM_ALGORITHM = 'adler32';

let connection = null;
let writeSequence = 0;
let changeUnsubscribe = null;
let changeNotificationTimer = null;
let pendingChange = null;
const writeSessions = {};
const fontWriteSessions = {};
let fontRequestQueue = Promise.resolve();
let cloudProxySequence = 0;
const cloudProxyPending = {};
const CLOUD_PROXY_TIMEOUT_MS = 20 * 1000;

function log(stage, detail) {
  if (typeof detail === 'undefined') console.log('[JSLab Bridge][' + stage + ']');
  else console.log('[JSLab Bridge][' + stage + ']', detail);
}

function logError(stage, data, code) {
  console.error('[JSLab Bridge][' + stage + '] code=' + String(code || ''), data || '');
}

function keepScreenAwake(enabled) {
  if (!brightness || typeof brightness.setKeepScreenOn !== 'function') {
    log('KEEP_SCREEN_UNAVAILABLE');
    return;
  }
  try {
    brightness.setKeepScreenOn({
      keepScreenOn: enabled === true,
      success: () => log('KEEP_SCREEN', String(enabled === true)),
      fail: (data, code) => logError('KEEP_SCREEN_FAILED', data, code)
    });
  } catch (error) {
    logError('KEEP_SCREEN_FAILED', error && error.message, 'CALL');
  }
}

function messageSize(value) {
  try {
    return typeof value === 'string' ? value.length : JSON.stringify(value).length;
  } catch (error) {
    return -1;
  }
}

function parseMessage(event) {
  let value = event && Object.prototype.hasOwnProperty.call(event, 'data') ? event.data : event;
  if (typeof value === 'string') value = JSON.parse(value);
  if (!value || typeof value !== 'object') throw new Error('消息格式无效');
  if (value.v !== PROTOCOL_VERSION || value.type !== 'request' || typeof value.id !== 'string') {
    throw new Error('不支持的桥接消息格式');
  }
  return value;
}

function send(payload) {
  if (!connection) {
    logError('SEND_SKIPPED_NO_CONNECTION', '', 'NO_CONNECTION');
    return;
  }
  log('SEND_BEGIN', 'id=' + String(payload.id || '') + ' ok=' + String(payload.ok) + ' bytes=' + messageSize(payload));
  connection.send({
    data: payload,
    success: () => log('SEND_SUCCESS', 'id=' + String(payload.id || '')),
    fail: (data, code) => logError('SEND_FAILED id=' + String(payload.id || ''), data, code)
  });
}

function respond(id, result) {
  send({ v: PROTOCOL_VERSION, type: 'response', id, ok: true, result: result || {} });
}

function reject(id, error) {
  send({
    v: PROTOCOL_VERSION,
    type: 'response',
    id: id || '',
    ok: false,
    error: error && error.message ? error.message : String(error || '未知错误')
  });
}

function settleCloudProxy(response) {
  if (!response || response.v !== PROTOCOL_VERSION || response.type !== 'response' || typeof response.id !== 'string') return false;
  const pending = cloudProxyPending[response.id];
  if (!pending) return false;
  delete cloudProxyPending[response.id];
  clearTimeout(pending.timer);
  if (response.ok === true) pending.resolve(response.result || {});
  else pending.reject(new Error(String(response.error || 'cloud_proxy_failed')));
  return true;
}

function requestCloud(payload) {
  if (!connection) return Promise.reject(new Error('cloud_proxy_unavailable'));
  const id = 'cloud-' + Date.now() + '-' + (++cloudProxySequence);
  return new Promise((resolve, rejectPromise) => {
    const timer = setTimeout(() => {
      delete cloudProxyPending[id];
      rejectPromise(new Error('cloud_proxy_timeout'));
    }, CLOUD_PROXY_TIMEOUT_MS);
    cloudProxyPending[id] = { resolve, reject: rejectPromise, timer };
    connection.send({
      data: { v: PROTOCOL_VERSION, type: 'request', id, action: 'cloudProxy', payload: payload || {} },
      success: () => {},
      fail: (data, code) => {
        const pending = cloudProxyPending[id];
        if (!pending) return;
        delete cloudProxyPending[id];
        clearTimeout(pending.timer);
        pending.reject(new Error('cloud_proxy_send_' + String(code || 'failed')));
      }
    });
  });
}

function queueFilesChanged(change) {
  pendingChange = change || { action: 'unknown' };
  if (changeNotificationTimer) return;
  changeNotificationTimer = setTimeout(() => {
    changeNotificationTimer = null;
    const payload = pendingChange;
    pendingChange = null;
    log('FILES_CHANGED', 'action=' + String(payload.action || 'unknown') + ' name=' + String(payload.name || ''));
    send({
      v: PROTOCOL_VERSION,
      type: 'event',
      event: 'filesChanged',
      payload
    });
  }, 50);
}

function cleanupWriteSessions() {
  const now = Date.now();
  Object.keys(writeSessions).forEach((id) => {
    if (now - writeSessions[id].updatedAt > WRITE_SESSION_TTL_MS) delete writeSessions[id];
  });
  Object.keys(fontWriteSessions).forEach((id) => {
    if (now - fontWriteSessions[id].updatedAt > WRITE_SESSION_TTL_MS) delete fontWriteSessions[id];
  });
}

function beginWrite(payload) {
  cleanupWriteSessions();
  if (Object.keys(writeSessions).length >= MAX_WRITE_SESSIONS) {
    return Promise.reject(new Error('当前写入任务过多，请稍后重试'));
  }
  if (!payload || typeof payload.name !== 'string') return Promise.reject(new Error('缺少文件名'));
  const expectedBytes = Number(payload.size);
  if (!isFinite(expectedBytes) || expectedBytes < 0 || Math.floor(expectedBytes) !== expectedBytes) {
    return Promise.reject(new Error('脚本长度无效'));
  }
  if (jsManager.isLocked(payload.name)) return Promise.reject(new Error('文件正在编辑中，请先退出手环编辑器'));

  return jsManager.list().then((files) => {
    const exists = files.some(fileInfo => fileInfo.name === payload.name);
    if (exists && payload.overwrite !== true) {
      throw new Error('文件已存在，需要确认覆盖');
    }
    const transferId = 'w' + Date.now() + '-' + (++writeSequence);
    writeSessions[transferId] = {
      name: payload.name,
      chunks: [],
      nextIndex: 0,
      bytes: 0,
      expectedBytes,
      updatedAt: Date.now()
    };
    return { transferId, exists };
  });
}

function appendWriteChunk(payload) {
  const session = payload && writeSessions[payload.transferId];
  if (!session) return Promise.reject(new Error('写入会话不存在或已过期'));
  if (payload.index !== session.nextIndex || typeof payload.content !== 'string') {
    return Promise.reject(new Error('写入分块顺序无效'));
  }
  const chunkBytes = utf8ByteLength(payload.content);
  if (session.bytes + chunkBytes > session.expectedBytes) {
    delete writeSessions[payload.transferId];
    return Promise.reject(new Error('脚本写入数据超过声明长度'));
  }
  session.chunks.push(payload.content);
  session.bytes += chunkBytes;
  session.nextIndex += 1;
  session.updatedAt = Date.now();
  return Promise.resolve({ nextIndex: session.nextIndex, bytes: session.bytes });
}

function finishWrite(payload) {
  const session = payload && writeSessions[payload.transferId];
  if (!session) return Promise.reject(new Error('写入会话不存在或已过期'));
  if (jsManager.isLocked(session.name)) {
    delete writeSessions[payload.transferId];
    return Promise.reject(new Error('文件正在编辑中，请先退出手环编辑器'));
  }
  if (session.bytes !== session.expectedBytes) {
    delete writeSessions[payload.transferId];
    return Promise.reject(new Error('脚本写入不完整，请重新上传'));
  }
  delete writeSessions[payload.transferId];
  return jsManager.write(session.name, session.chunks.join('')).then(() => ({
    name: session.name,
    size: session.bytes
  }));
}

function decodeBase64(value) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  if (typeof value !== 'string' || value.length % 4 !== 0) throw new Error('字体分块编码无效');
  let output = '';
  for (let index = 0; index < value.length; index += 4) {
    const a = chars.indexOf(value.charAt(index));
    const b = chars.indexOf(value.charAt(index + 1));
    const cChar = value.charAt(index + 2);
    const dChar = value.charAt(index + 3);
    const c = cChar === '=' ? 0 : chars.indexOf(cChar);
    const d = dChar === '=' ? 0 : chars.indexOf(dChar);
    if (a < 0 || b < 0 || c < 0 || d < 0 || (cChar === '=' && dChar !== '=')) throw new Error('字体分块编码无效');
    output += String.fromCharCode((a << 2) | (b >> 4));
    if (cChar !== '=') output += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (dChar !== '=') output += String.fromCharCode(((c & 3) << 6) | d);
  }
  return output;
}

function beginFontWrite(payload) {
  cleanupWriteSessions();
  if (!payload || !payload.profile || !Number(payload.size) || Number(payload.size) > fontManager.MAX_FONT_BYTES) {
    return Promise.reject(new Error('字体必须有效且不能超过 2 MiB'));
  }
  let profile;
  try { profile = fontManager.validateFontProfile(payload.profile); }
  catch (error) { return Promise.reject(error); }
  Object.keys(fontWriteSessions).forEach(id => delete fontWriteSessions[id]);
  return fontManager.preparePendingPackage(
    profile,
    Number(payload.size),
    FONT_CHUNK_BYTES,
    payload.fingerprint,
    payload.checksum
  ).then((state) => {
    const transferId = 'f' + Date.now() + '-' + (++writeSequence);
    fontWriteSessions[transferId] = { state, updatedAt: Date.now() };
    return {
      transferId,
      bytes: state.bytes,
      nextIndex: state.nextIndex,
      resumed: state.bytes > 0
    };
  });
}

function appendFontWriteChunk(payload) {
  const session = payload && fontWriteSessions[payload.transferId];
  if (!session || payload.index !== session.state.nextIndex) return Promise.reject(new Error('字体分块顺序无效'));
  let chunk;
  try { chunk = decodeBase64(payload.content); } catch (error) { return Promise.reject(error); }
  return fontManager.writePendingPart(payload.index, chunk, payload.content, session.state).then((state) => {
    session.state = state;
    session.updatedAt = Date.now();
    return { nextIndex: state.nextIndex, bytes: state.bytes };
  });
}

function finishFontWrite(payload) {
  const session = payload && fontWriteSessions[payload.transferId];
  if (!session) return Promise.reject(new Error('字体上传会话不存在或已过期'));
  delete fontWriteSessions[payload.transferId];
  return fontManager.finishPendingPackage(session.state);
}

function handleRequest(request) {
  const payload = request.payload || {};
  log('REQUEST_DISPATCH', 'id=' + request.id + ' action=' + request.action);
  switch (request.action) {
    case 'hello':
      return Promise.resolve({
        protocol: PROTOCOL_VERSION,
        maxScriptBytes: 0,
        fontPackageUploadSupported: true,
        fontUploadResumeSupported: true,
        fontChunkBytes: FONT_CHUNK_BYTES,
        fontChecksumAlgorithm: FONT_CHECKSUM_ALGORITHM
      });
    case 'fontUploadStart':
      return beginFontWrite(payload);
    case 'fontUploadChunk':
      return appendFontWriteChunk(payload);
    case 'fontUploadFinish':
      return finishFontWrite(payload);
    case 'list':
      return jsManager.list().then(files => ({ files }));
    case 'create':
      if (jsManager.isLocked(payload.name)) return Promise.reject(new Error('文件正在编辑中，请先退出手环编辑器'));
      return jsManager.list().then((files) => {
        if (files.some(file => file.name === payload.name)) throw new Error('文件已存在');
        return jsManager.write(payload.name, '');
      }).then(() => ({ name: payload.name, size: 0 }));
    case 'read':
      return jsManager.read(payload.name).then((content) => {
        const offset = Math.max(0, Number(payload.offset) || 0);
        const chunk = sliceUtf8Chunk(content, offset, READ_CHUNK_BYTES);
        return {
          name: payload.name,
          content: chunk.content,
          nextOffset: chunk.nextOffset,
          done: chunk.done,
          size: chunk.size
        };
      });
    case 'writeStart':
      return beginWrite(payload);
    case 'writeChunk':
      return appendWriteChunk(payload);
    case 'writeFinish':
      return finishWrite(payload);
    case 'rename':
      if (jsManager.isLocked(payload.name) || jsManager.isLocked(payload.newName)) {
        return Promise.reject(new Error('文件正在编辑中，请先退出手环编辑器'));
      }
      return jsManager.rename(payload.name, payload.newName).then(() => ({ name: payload.newName }));
    case 'delete':
      if (jsManager.isLocked(payload.name)) return Promise.reject(new Error('文件正在编辑中，请先退出手环编辑器'));
      return jsManager.remove(payload.name).then(() => ({ name: payload.name }));
    default:
      return Promise.reject(new Error('未知桥接操作: ' + request.action));
  }
}

function dispatchRequest(request) {
  const isFontRequest = request.action === 'fontUploadStart' ||
    request.action === 'fontUploadChunk' || request.action === 'fontUploadFinish';
  if (!isFontRequest) return handleRequest(request);

  const operation = fontRequestQueue.then(() => handleRequest(request));
  // Keep the queue available after a rejected request while returning its error to this caller.
  fontRequestQueue = operation.catch(() => null);
  return operation;
}

function onMessage(event) {
  keepScreenAwake(true);
  let request;
  const raw = event && Object.prototype.hasOwnProperty.call(event, 'data') ? event.data : event;
  log('MESSAGE_RECEIVED', 'type=' + typeof raw + ' bytes=' + messageSize(raw));
  try {
    const response = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (settleCloudProxy(response)) return;
  } catch (error) {}
  try {
    request = parseMessage(event);
  } catch (error) {
    logError('MESSAGE_PARSE_FAILED', error && error.message, 'PARSE');
    reject('', error);
    return;
  }
  log('MESSAGE_PARSED', 'id=' + request.id + ' action=' + request.action + ' v=' + request.v);
  // handleRequest contains synchronous validation for external payloads.
  // Start from a resolved promise so every validation error becomes a protocol response.
  Promise.resolve()
    .then(() => dispatchRequest(request))
    .then((result) => {
      log('REQUEST_SUCCESS', 'id=' + request.id + ' action=' + request.action);
      respond(request.id, result);
    })
    .catch((error) => {
      logError('REQUEST_FAILED id=' + request.id + ' action=' + request.action, error && error.message, 'RPC');
      reject(request.id, error);
    });
}

function start() {
  if (connection) {
    log('START_SKIPPED', 'singleton already initialized');
    return;
  }
  log('START', 'protocol=' + PROTOCOL_VERSION + ' maxBytes=' + jsManager.maxScriptBytes);
  try {
    connection = interconnect.instance();
  } catch (error) {
    logError('INSTANCE_FAILED', error && error.message, 'INSTANCE');
    return;
  }
  log('INSTANCE_READY');
  connection.onmessage = onMessage;
  connection.onopen = (event) => {
    log('OPEN', 'reconnected=' + String(event && event.isReconnected));
    keepScreenAwake(true);
  };
  connection.onerror = event => logError('CONNECTION_ERROR', event && event.data, event && event.code);
  connection.onclose = (event) => {
    log('CLOSE', 'code=' + String(event && event.code) + ' reason=' + String(event && event.data));
    keepScreenAwake(false);
    Object.keys(writeSessions).forEach(id => delete writeSessions[id]);
    Object.keys(fontWriteSessions).forEach(id => delete fontWriteSessions[id]);
    fontRequestQueue = Promise.resolve();
    Object.keys(cloudProxyPending).forEach((id) => {
      const pending = cloudProxyPending[id];
      delete cloudProxyPending[id];
      clearTimeout(pending.timer);
      pending.reject(new Error('cloud_proxy_disconnected'));
    });
  };
  changeUnsubscribe = jsManager.subscribe(queueFilesChanged);
  if (typeof connection.getReadyState === 'function') {
    connection.getReadyState({
      success: data => log('READY_STATE', 'status=' + String(data && data.status)),
      fail: (data, code) => logError('READY_STATE_FAILED', data, code)
    });
  } else {
    log('READY_STATE_UNAVAILABLE');
  }
  if (typeof connection.diagnosis === 'function') {
    log('DIAGNOSIS_BEGIN', 'timeout=10000');
    connection.diagnosis({
      timeout: 10000,
      success: data => log('DIAGNOSIS_RESULT', 'status=' + String(data && data.status)),
      fail: (data, code) => logError('DIAGNOSIS_FAILED', data, code)
    });
  } else {
    log('DIAGNOSIS_UNAVAILABLE');
  }
}

function stop() {
  log('STOP');
  keepScreenAwake(false);
  if (connection) {
    connection.onmessage = null;
    connection.onopen = null;
    connection.onclose = null;
    connection.onerror = null;
  }
  connection = null;
  if (changeUnsubscribe) {
    changeUnsubscribe();
    changeUnsubscribe = null;
  }
  if (changeNotificationTimer) {
    clearTimeout(changeNotificationTimer);
    changeNotificationTimer = null;
  }
  pendingChange = null;
  Object.keys(writeSessions).forEach(id => delete writeSessions[id]);
  Object.keys(fontWriteSessions).forEach(id => delete fontWriteSessions[id]);
  fontRequestQueue = Promise.resolve();
  Object.keys(cloudProxyPending).forEach((id) => {
    const pending = cloudProxyPending[id];
    delete cloudProxyPending[id];
    clearTimeout(pending.timer);
    pending.reject(new Error('cloud_proxy_disconnected'));
  });
}

export default { start, stop, requestCloud };

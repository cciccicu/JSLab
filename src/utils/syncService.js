import interconnect from '@system.interconnect';
import jsManager from './jsManager.js';
import fontManager from './fontManager.js';

const PROTOCOL_VERSION = 1;
const READ_CHUNK_CHARS = 4096;
const MAX_WRITE_SESSIONS = 2;
const WRITE_SESSION_TTL_MS = 2 * 60 * 1000;

let connection = null;
let writeSequence = 0;
let changeUnsubscribe = null;
let changeNotificationTimer = null;
let pendingChange = null;
const writeSessions = {};

function log(stage, detail) {
  if (typeof detail === 'undefined') console.log('[JSLab Sync][' + stage + ']');
  else console.log('[JSLab Sync][' + stage + ']', detail);
}

function logError(stage, data, code) {
  console.error('[JSLab Sync][' + stage + '] code=' + String(code || ''), data || '');
}

function messageSize(value) {
  try {
    return typeof value === 'string' ? value.length : JSON.stringify(value).length;
  } catch (error) {
    return -1;
  }
}

function utf8ByteLength(value) {
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

function parseMessage(event) {
  let value = event && Object.prototype.hasOwnProperty.call(event, 'data') ? event.data : event;
  if (typeof value === 'string') value = JSON.parse(value);
  if (!value || typeof value !== 'object') throw new Error('消息格式无效');
  if (value.v !== PROTOCOL_VERSION || value.type !== 'request' || typeof value.id !== 'string') {
    throw new Error('不支持的同步协议');
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
}

function beginWrite(payload) {
  cleanupWriteSessions();
  if (Object.keys(writeSessions).length >= MAX_WRITE_SESSIONS) {
    return Promise.reject(new Error('当前写入任务过多，请稍后重试'));
  }
  if (!payload || typeof payload.name !== 'string') return Promise.reject(new Error('缺少文件名'));
  if (jsManager.isLocked(payload.name)) return Promise.reject(new Error('文件正在编辑中，请先退出手环编辑器'));
  if (Number(payload.size) > jsManager.maxScriptBytes) return Promise.reject(new Error('脚本不能超过 48 KiB'));

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
  if (session.bytes + chunkBytes > jsManager.maxScriptBytes) {
    delete writeSessions[payload.transferId];
    return Promise.reject(new Error('脚本不能超过 48 KiB'));
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
  delete writeSessions[payload.transferId];
  return jsManager.write(session.name, session.chunks.join('')).then(() => ({
    name: session.name,
    size: session.bytes
  }));
}

function handleRequest(request) {
  const payload = request.payload || {};
  log('REQUEST_DISPATCH', 'id=' + request.id + ' action=' + request.action);
  switch (request.action) {
    case 'hello':
      return Promise.resolve({ protocol: PROTOCOL_VERSION, maxScriptBytes: jsManager.maxScriptBytes, fontUploadSupported: false });
    case 'getEditorFontConfig':
      return fontManager.getProfile().then(profile => ({ profile }));
    case 'setEditorFontConfig':
      return fontManager.setProfile(payload.profile).then(profile => ({ profile }));
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
        const chunk = content.slice(offset, offset + READ_CHUNK_CHARS);
        const nextOffset = offset + chunk.length;
        return {
          name: payload.name,
          content: chunk,
          nextOffset,
          done: nextOffset >= content.length,
          size: utf8ByteLength(content)
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
      return Promise.reject(new Error('未知同步操作: ' + request.action));
  }
}

function onMessage(event) {
  let request;
  const raw = event && Object.prototype.hasOwnProperty.call(event, 'data') ? event.data : event;
  log('MESSAGE_RECEIVED', 'type=' + typeof raw + ' bytes=' + messageSize(raw));
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
    .then(() => handleRequest(request))
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
  connection.onopen = event => log('OPEN', 'reconnected=' + String(event && event.isReconnected));
  connection.onerror = event => logError('CONNECTION_ERROR', event && event.data, event && event.code);
  connection.onclose = (event) => {
    log('CLOSE', 'code=' + String(event && event.code) + ' reason=' + String(event && event.data));
    Object.keys(writeSessions).forEach(id => delete writeSessions[id]);
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
}

export default { start, stop };

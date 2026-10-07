import interconnect from '@system.interconnect';
import brightness from '@system.brightness';
import jsManager from '../files/jsManager.js';
import fontManager from '../editor/fontManager.js';
import { clearScriptTransfers, handleScriptTransfer } from '../files/scriptTransfer.js';

const PROTOCOL_VERSION = 2;
const WRITE_SESSION_TTL_MS = 2 * 60 * 1000;
const FONT_CHUNK_BYTES = 3 * 1024;
const FONT_CHECKSUM_ALGORITHM = 'adler32';

let connection = null;
let writeSequence = 0;
let changeUnsubscribe = null;
let changeNotificationTimer = null;
let pendingChange = null;
const fontWriteSessions = Object.create(null);
let fontRequestQueue = Promise.resolve();
let cloudProxySequence = 0;
const cloudProxyPending = Object.create(null);
const CLOUD_PROXY_TIMEOUT_MS = 20 * 1000;
const TRACE_BRIDGE = false;

function log(stage, detail) {
  if (!TRACE_BRIDGE) return;
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
  log('SEND_BEGIN', 'id=' + String(payload.id || '') + ' ok=' + String(payload.ok));
  try {
    connection.send({
      data: payload,
      success: () => log('SEND_SUCCESS', 'id=' + String(payload.id || '')),
      fail: (data, code) => logError('SEND_FAILED id=' + String(payload.id || ''), data, code)
    });
  } catch (error) {
    logError('SEND_FAILED id=' + String(payload.id || ''), error && error.message, 'CALL');
  }
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

function requestCloud(payload, timeoutMs) {
  if (!connection) return Promise.reject(new Error('cloud_proxy_unavailable'));
  const requestedTimeout = Number(timeoutMs);
  const deadline = isFinite(requestedTimeout) && requestedTimeout > 0
    ? Math.min(Math.floor(requestedTimeout), 330 * 1000) : CLOUD_PROXY_TIMEOUT_MS;
  const id = 'cloud-' + Date.now() + '-' + (++cloudProxySequence);
  return new Promise((resolve, rejectPromise) => {
    const timer = setTimeout(() => {
      delete cloudProxyPending[id];
      rejectPromise(new Error('cloud_proxy_timeout'));
    }, deadline);
    cloudProxyPending[id] = { resolve, reject: rejectPromise, timer };
    const fail = (data, code) => {
      const pending = cloudProxyPending[id];
      if (!pending) return;
      delete cloudProxyPending[id];
      clearTimeout(pending.timer);
      const error = new Error('cloud_proxy_send_' + String(code || 'failed'));
      error.detail = data;
      pending.reject(error);
    };
    try {
      connection.send({
        data: { v: PROTOCOL_VERSION, type: 'request', id, action: 'cloudProxy', payload: payload || {} },
        success: () => {},
        fail
      });
    } catch (error) {
      fail(error && error.message, 'failed');
    }
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

function cleanupFontSessions() {
  const now = Date.now();
  Object.keys(fontWriteSessions).forEach((id) => {
    if (now - fontWriteSessions[id].updatedAt > WRITE_SESSION_TTL_MS) delete fontWriteSessions[id];
  });
}

function beginFontWrite(payload) {
  cleanupFontSessions();
  if (!payload || !payload.profile || !Number(payload.size) || Number(payload.size) > fontManager.MAX_FONT_BYTES) {
    return Promise.reject(new Error('字体必须有效且不能超过 2 MiB'));
  }
  Object.keys(fontWriteSessions).forEach(id => delete fontWriteSessions[id]);
  return fontManager.preparePendingPackage(
    payload.profile,
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
  cleanupFontSessions();
  const session = payload && fontWriteSessions[payload.transferId];
  if (!session || payload.index !== session.state.nextIndex) return Promise.reject(new Error('字体分块顺序无效'));
  return fontManager.writePendingPart(payload.index, payload.content, session.state).then((state) => {
    session.state = state;
    session.updatedAt = Date.now();
    return { nextIndex: state.nextIndex, bytes: state.bytes };
  });
}

function finishFontWrite(payload) {
  cleanupFontSessions();
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
    default:
      return handleScriptTransfer(request.action, payload);
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
  let request;
  const raw = event && Object.prototype.hasOwnProperty.call(event, 'data') ? event.data : event;
  log('MESSAGE_RECEIVED', 'type=' + typeof raw);
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
    clearScriptTransfers();
    Object.keys(fontWriteSessions).forEach(id => delete fontWriteSessions[id]);

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
      success: (data) => {
        log('READY_STATE', 'status=' + String(data && data.status));
        if (data && data.status === 1) keepScreenAwake(true);
      },
      fail: (data, code) => logError('READY_STATE_FAILED', data, code)
    });
  } else {
    log('READY_STATE_UNAVAILABLE');
  }
  if (TRACE_BRIDGE && typeof connection.diagnosis === 'function') {
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
  clearScriptTransfers();
  Object.keys(fontWriteSessions).forEach(id => delete fontWriteSessions[id]);

  Object.keys(cloudProxyPending).forEach((id) => {
    const pending = cloudProxyPending[id];
    delete cloudProxyPending[id];
    clearTimeout(pending.timer);
    pending.reject(new Error('cloud_proxy_disconnected'));
  });
}

export default { start, stop, requestCloud };

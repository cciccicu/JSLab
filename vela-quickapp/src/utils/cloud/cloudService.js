import fetch from '@system.fetch';
import app from '@system.app';
import configManager from '../core/configManager.js';
import jsManager from '../files/jsManager.js';
import { adler32 } from '../files/transferIntegrity.js';
import companionBridge from './companionBridge.js';

const DEFAULT_ORIGIN = 'http://192.168.3.17:3000/jslab-cloud';
const PREVIOUS_DEFAULT_ORIGIN = 'https://jslab-api.ccicc.icu';

function resolveOrigin(value) {
  const origin = String(value || '').replace(/\/$/, '');
  return !origin || origin === PREVIOUS_DEFAULT_ORIGIN ? DEFAULT_ORIGIN : origin;
}

function isDirectFetchSupported() {
  try { return typeof app.canIUse !== 'function' || app.canIUse('@system.fetch.fetch'); }
  catch (error) { return true; }
}

function normalizeTransport(value) {
  return value === 'interconnect' ? 'interconnect' : 'fetch';
}

function normalizeNetworkError(error) {
  const message = String(error && error.message ? error.message : error || '');
  if (/^(cloud_network_|cloud_proxy_(?:network_request_failed|response_read_failed|request_timed_out|response_timed_out|timeout|send_))/.test(message) ||
      /cloud proxy (?:network request failed|response read failed|request timed out|response timed out)/i.test(message)) {
    const normalized = new Error('cloud_network_unavailable');
    normalized.cause = error;
    return normalized;
  }
  return error;
}

function isNetworkError(error) {
  return !!error && error.message === 'cloud_network_unavailable';
}

function errorMessage(error, fallback) {
  if (isNetworkError(error)) return '需要联网后重试';
  if (error && error.message === 'cloud_proxy_unavailable') return '请先连接 AstroBox';
  if (error && error.message === 'cloud_fetch_unavailable') return '当前设备不支持网络直连';
  return fallback;
}

function request(path, options) {
  const settings = options || {};
  return Promise.all([
    configManager.get('cloud.origin', DEFAULT_ORIGIN),
    configManager.get('cloud.token', ''),
    configManager.get('cloud.transport', '')
  ]).then((values) => {
    const headers = { 'Content-Type': 'application/json' };
    if (values[1]) headers.Authorization = 'Bearer ' + values[1];
    const url = resolveOrigin(values[0]) + path;
    const handle = (status, rawBody) => {
      let body;
      try { body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody; }
      catch (error) { throw new Error('cloud_invalid_response'); }
      if (status >= 200 && status < 300 && body && body.ok !== false) return body;
      const requestError = new Error(body && body.error ? body.error : 'cloud_http_' + status);
      requestError.status = status;
      requestError.body = body;
      // 403 is also used for account entitlements (for example activation_required).
      // Only a failed device authentication means the locally stored token is stale.
      if (status === 401 && path !== '/api/cloud/device/exchange') {
        configManager.set('cloud.token', '').catch(() => {});
      }
      throw requestError;
    };
    if (normalizeTransport(values[2]) === 'interconnect') {
      return companionBridge.requestCloud({
        url,
        method: settings.method || 'GET',
        headers,
        body: settings.body ? JSON.stringify(settings.body) : ''
      }).then((response) => handle(response.status, response.body)).catch((error) => { throw normalizeNetworkError(error); });
    }
    if (!isDirectFetchSupported()) return Promise.reject(new Error('cloud_fetch_unavailable'));
    return new Promise((resolve, reject) => {
      fetch.fetch({
        url,
        method: settings.method || 'GET',
        header: headers,
        data: settings.body ? JSON.stringify(settings.body) : undefined,
        responseType: 'json',
        success: (response) => {
          try { resolve(handle(response.code, response.data)); }
          catch (error) { reject(error); }
        },
        fail: (data, code) => reject(normalizeNetworkError(new Error('cloud_network_' + code)))
      });
    });
  });
}

function startPairing(deviceName) {
  return request('/api/cloud/device/pairing/start', { method: 'POST', body: { name: deviceName || 'JSLab watch' } });
}

function pollPairing(code) {
  return request('/api/cloud/device/pairing/status?code=' + encodeURIComponent(String(code || '').trim().toUpperCase()));
}

function cancelPairing(code) {
  return request('/api/cloud/device/pairing/cancel', {
    method: 'POST', body: { code: String(code || '').trim().toUpperCase() }
  });
}

function exchangePairing(code, deviceName) {
  return request('/api/cloud/device/exchange', {
    method: 'POST', body: { code: String(code || '').trim(), name: deviceName || 'JSLab watch' }
  }).then((result) => configManager.set('cloud.token', result.token).then(() => result));
}

function revokeCurrentDevice() { return request('/api/cloud/device/revoke', { method: 'POST' }); }
function logout() {
  return revokeCurrentDevice()
    .then(() => configManager.set('cloud.token', '').then(() => ({ revoked: true })))
    .catch((error) => {
      // A 401 means the server no longer recognizes this token; clearing the
      // local copy is safe, but callers must not present it as a confirmed revoke.
      if (error && error.status === 401) {
        return configManager.set('cloud.token', '').then(() => ({ revoked: false, alreadyRevoked: true }));
      }
      throw error;
    });
}

function getState() {
  return Promise.all([configManager.get('cloud.token', ''), configManager.get('cloud.transport', '')])
    .then((values) => ({ paired: !!values[0], transport: normalizeTransport(values[1]) }));
}

function getEntitlements() {
  return request('/api/cloud/device/entitlements').then((result) => {
    const value = result.entitlement || {};
    return {
      cloudEnabled: value.cloudEnabled === true,
      aiEnabled: value.aiEnabled === true,
      aiCreditCents: Math.max(0, Number(value.aiCreditCents) || 0)
    };
  });
}

function generateAi(mode, prompt, source, name, environment) {
  const body = { mode: mode === 'rewrite' ? 'rewrite' : 'create', prompt: String(prompt || ''), source: String(source || ''), name: String(name || '') };
  if (environment && typeof environment === 'object') body.environment = environment;
  return request('/api/cloud/device/ai/generate', { method: 'POST', body }).then((result) => {
    if (typeof result.code !== 'string' || !result.code) throw new Error('ai_invalid_response');
    return { code: result.code, usage: result.usage || {}, remainingCreditCents: Math.max(0, Number(result.remainingCreditCents) || 0) };
  });
}

function market(query) {
  return request('/api/cloud/market' + (query ? '?q=' + encodeURIComponent(query) : '')).then((result) => result.scripts || []);
}

function downloadMarketScript(id, overwrite) {
  return request('/api/cloud/market/' + encodeURIComponent(id) + '/source').then((result) => {
    const script = result.script;
    if (!script || typeof script.source !== 'string') throw new Error('invalid_market_script');
    if (script.checksum && adler32(script.source) !== script.checksum) throw new Error('checksum_mismatch');
    return jsManager.list().then((files) => {
      if (!overwrite && files.some((file) => file.name === script.name)) throw new Error('file_exists');
      return jsManager.write(script.name, script.source).then(() => script);
    });
  });
}

function listLocalScripts() { return jsManager.list(); }
function listCloudScripts() { return request('/api/cloud/scripts').then((result) => result.scripts || []); }

function uploadScript(name) {
  return jsManager.read(name).then((source) => listCloudScripts().then((scripts) => {
    const existing = scripts.find((script) => script.name === name);
    return request(existing ? '/api/cloud/scripts/' + existing.id : '/api/cloud/device/scripts', {
      method: existing ? 'PUT' : 'POST', body: { name, source }
    });
  }));
}

function downloadScript(id, name, overwrite) {
  return request('/api/cloud/scripts/' + encodeURIComponent(id)).then((result) => {
    const script = result.script;
    const source = result.source;
    if (!script || typeof source !== 'string') throw new Error('invalid_cloud_script');
    const target = name || script.name;
    return jsManager.list().then((files) => {
      if (!overwrite && files.some((file) => file.name === target)) throw new Error('file_exists');
      return jsManager.write(target, source).then(() => script);
    });
  });
}

function deleteCloudScript(id) {
  return request('/api/cloud/device/scripts/' + encodeURIComponent(id), { method: 'DELETE', body: {} });
}

export default {
  request, startPairing, pollPairing, cancelPairing, exchangePairing, logout, revokeCurrentDevice,
  getState, getEntitlements, generateAi, market, downloadMarketScript,
  listLocalScripts, listCloudScripts, uploadScript, downloadScript, deleteCloudScript,
  isDirectFetchSupported, isNetworkError, errorMessage
};

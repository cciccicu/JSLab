import { RUNTIME_CONTRACT } from '../runtime/runtimeContract.js';
import configManager from '../core/configManager.js';
import jsManager from '../files/jsManager.js';
import { adler32Utf8 } from '../files/transferIntegrity.js';
import { request, normalizeTransport, isDirectFetchSupported, isNetworkError, errorMessage } from './cloudTransport.js';

// AI generation and market moderation may run for up to 300 seconds.
const LONG_BRIDGE_TIMEOUT_MS = 330 * 1000;

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
  }).then((result) => {
    if (typeof result.token !== 'string' || !result.token.trim()) throw new Error('cloud_invalid_response');
    return configManager.set('cloud.token', result.token).then(() => result);
  });
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
    const value = result.entitlement;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('cloud_invalid_response');
    return {
      runtimeContract: result.runtimeContract || '',
      cloudEnabled: value.cloudEnabled === true,
      aiEnabled: value.aiEnabled === true,
      aiCreditCents: Math.max(0, Number(value.aiCreditCents) || 0)
    };
  });
}

function generateAi(mode, prompt, source, name, environment) {
  const body = { runtimeContract: RUNTIME_CONTRACT, mode: mode === 'rewrite' ? 'rewrite' : 'create', prompt: String(prompt || ''), source: String(source || ''), name: String(name || '') };
  if (environment && typeof environment === 'object') body.environment = environment;
  return getEntitlements().then(capabilities => {
    if (capabilities.runtimeContract !== RUNTIME_CONTRACT) throw new Error('设备与云端运行契约不一致，请同步更新应用和云插件');
    return request('/api/cloud/device/ai/generate', { method: 'POST', body, timeoutMs: LONG_BRIDGE_TIMEOUT_MS });
  }).then((result) => {
    if (result.runtimeContract !== RUNTIME_CONTRACT) throw new Error('AI 结果的运行契约不一致，未写入编辑器');
    if (typeof result.code !== 'string' || !result.code) throw new Error('ai_invalid_response');
    try { new Function(result.code); } catch (_) { throw new Error('AI 结果语法无效，未写入编辑器'); }
    return { code: result.code, usage: result.usage || {}, remainingCreditCents: Math.max(0, Number(result.remainingCreditCents) || 0) };
  });
}

function scriptList(result) {
  if (!Array.isArray(result.scripts) || result.scripts.some(script =>
    !script || typeof script !== 'object' || typeof script.name !== 'string' || script.id == null)) {
    throw new Error('cloud_invalid_response');
  }
  return result.scripts;
}

function verifySourceChecksum(source, checksum) {
  if (checksum != null && (typeof checksum !== 'string' || !/^[0-9a-f]{8}$/.test(checksum) ||
    adler32Utf8(source) !== checksum)) throw new Error('checksum_mismatch');
}

function market(query) {
  return request('/api/cloud/market' + (query ? '?q=' + encodeURIComponent(query) : '')).then(scriptList);
}

function submitMarketScript(localName, metadata) {
  const details = metadata || {};
  return jsManager.read(localName).then(source => request('/api/cloud/device/market/submit', {
    method: 'POST', timeoutMs: LONG_BRIDGE_TIMEOUT_MS, body: {
      marketName: String(details.name || '').trim(),
      marketDescription: String(details.description || '').trim(),
      marketTags: String(details.tags || '').trim(),
      source
    }
  }));
}

function downloadMarketScript(id, overwrite) {
  return request('/api/cloud/market/' + encodeURIComponent(id) + '/source').then((result) => {
    const script = result.script;
    if (!script || typeof script.source !== 'string') throw new Error('invalid_market_script');
    let target = script.filename || script.name;
    if (typeof target !== 'string' || !target) throw new Error('invalid_market_script');
    if (!/\.js$/i.test(target)) target += '.js';
    verifySourceChecksum(script.source, script.checksum);
    return jsManager.list().then((files) => {
      if (!overwrite && files.some((file) => file.name === target)) throw new Error('file_exists');
      return jsManager.write(target, script.source).then(() => Object.assign({}, script, { name: target }));
    });
  });
}

function listLocalScripts() { return jsManager.list(); }
function listCloudScripts() { return request('/api/cloud/scripts').then(scriptList); }

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
    if (typeof target !== 'string' || !target) throw new Error('invalid_cloud_script');
    verifySourceChecksum(source, result.checksum);
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
  startPairing, pollPairing, cancelPairing, exchangePairing, logout, revokeCurrentDevice,
  getState, getEntitlements, generateAi, market, submitMarketScript, downloadMarketScript,
  listLocalScripts, listCloudScripts, uploadScript, downloadScript, deleteCloudScript,
  isDirectFetchSupported, isNetworkError, errorMessage
};

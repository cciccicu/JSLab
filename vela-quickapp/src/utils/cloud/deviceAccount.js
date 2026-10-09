import configManager from '../core/configManager.js';
import { request, normalizeTransport } from './cloudTransport.js';

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

function getEntitlements(timeoutMs) {
  return request('/api/cloud/device/entitlements', timeoutMs ? { timeoutMs } : undefined).then((result) => {
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

export default {
  startPairing, pollPairing, cancelPairing, exchangePairing,
  revokeCurrentDevice, logout, getState, getEntitlements
};

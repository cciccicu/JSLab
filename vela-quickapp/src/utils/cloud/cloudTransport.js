import fetch from '@system.fetch';
import configManager from '../core/configManager.js';
import { cleanDetail, createNativeError } from '../core/userError.js';

// app.ux binds its single Interconnect sender for all cloud clients.
let cloudProxyRequest = null;
export function setCloudProxyRequest(sender) {
  cloudProxyRequest = typeof sender === 'function' ? sender : null;
}

const DEFAULT_ORIGIN = 'http://jslab-api.ccicc.icu';
const LEGACY_DEFAULT_ORIGINS = [
  'http://192.168.3.17:3000/jslab-cloud',
  'https://ccicc.icu/jslab-cloud'
];
const PRODUCTION_ORIGIN_RE = /^https?:\/\/jslab-api\.ccicc\.icu(?:\/jslab-cloud)?$/i;

function resolveOrigin(value) {
  const origin = String(value || '').trim().replace(/\/+$/, '');
  return !origin || PRODUCTION_ORIGIN_RE.test(origin) || LEGACY_DEFAULT_ORIGINS.indexOf(origin) !== -1
    ? DEFAULT_ORIGIN
    : origin;
}

export function isDirectFetchSupported() {
  return !!fetch && typeof fetch.fetch === 'function';
}

export function normalizeTransport(value) {
  return value === 'interconnect' ? 'interconnect' : 'fetch';
}

function normalizeNetworkError(error) {
  const message = String(error && error.message ? error.message : error || '');
  if (message === 'cloud_proxy_unavailable' || message === 'cloud_proxy_disconnected' || message === 'cloud_proxy_timeout') return error;
  if (/^cloud_proxy_send_/.test(message)) {
    const normalized = new Error('cloud_proxy_send_failed');
    normalized.source = 'astrobox_bridge';
    normalized.nativeCode = Number(message.slice('cloud_proxy_send_'.length));
    normalized.detail = cleanDetail(error && error.detail);
    normalized.cause = error;
    return normalized;
  }
  if (/cloud_proxy_(?:network_request_failed|response_read_failed|request_timed_out|response_timed_out)/.test(message) ||
      /cloud proxy (?:network request failed|response read failed|request timed out|response timed out)/i.test(message)) {
    const normalized = new Error(/timed_out|timed out/i.test(message) ? 'cloud_proxy_timeout' : 'cloud_proxy_network_error');
    normalized.source = 'astrobox_bridge';
    normalized.detail = cleanDetail(message);
    normalized.cause = error;
    return normalized;
  }
  return error;
}

export function request(path, options) {
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
      catch (error) {
        const responseError = new Error('cloud_invalid_response');
        responseError.source = 'cloud_response';
        responseError.status = Number(status) || 0;
        responseError.detail = cleanDetail(rawBody);
        throw responseError;
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        const responseError = new Error('cloud_invalid_response');
        responseError.source = 'cloud_response';
        responseError.status = Number(status) || 0;
        throw responseError;
      }
      if (status >= 200 && status < 300 && body.ok !== false) return body;
      const requestError = new Error(body && body.error ? body.error : 'cloud_http_' + status);
      requestError.status = status;
      requestError.body = body;
      requestError.source = 'cloud_response';
      requestError.serverMessage = body && body.message ? body.message : '';
      // 403 is also used for account entitlements (for example activation_required).
      // Only a failed device authentication means the locally stored token is stale.
      if (status === 401 && path !== '/api/cloud/device/exchange') {
        configManager.set('cloud.token', '').catch(() => {});
      }
      throw requestError;
    };
    if (normalizeTransport(values[2]) === 'interconnect') {
      if (!cloudProxyRequest) return Promise.reject(new Error('cloud_proxy_unavailable'));
      return cloudProxyRequest({
        url,
        method: settings.method || 'GET',
        headers,
        body: settings.body ? JSON.stringify(settings.body) : ''
      }, settings.timeoutMs).then((response) => handle(response.status, response.body)).catch((error) => { throw normalizeNetworkError(error); });
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
        fail: (data, code) => {
          const status = Number(code);
          if (status >= 400 && status <= 599) {
            try { resolve(handle(status, data)); }
            catch (error) { reject(error); }
            return;
          }
          const nativeError = createNativeError('vela_fetch', data, status);
          if (status === 200) nativeError.message = 'cloud_fetch_system_error';
          else if (status === 201 || status === 207) nativeError.message = 'cloud_fetch_rejected';
          else if (status === 202) nativeError.message = 'cloud_fetch_invalid_parameters';
          else if (status === 203) nativeError.message = 'cloud_fetch_unavailable';
          else if (status === 204) nativeError.message = 'cloud_fetch_timeout';
          else if (status === 205) nativeError.message = 'cloud_fetch_duplicate';
          else if (status === 300) nativeError.message = 'cloud_fetch_io_error';
          else nativeError.message = 'cloud_network_unavailable';
          reject(nativeError);
        }
      });
    });
  });
}

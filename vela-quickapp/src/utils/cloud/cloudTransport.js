import fetch from '@system.fetch';
import configManager from '../core/configManager.js';
import companionBridge from './companionBridge.js';
import { cleanDetail, createNativeError, formatError } from '../core/userError.js';

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

export function isNetworkError(error) {
  return !!error && /^(cloud_network_unavailable|cloud_fetch_timeout|cloud_fetch_io_error|cloud_proxy_network_error|cloud_proxy_timeout|cloud_proxy_disconnected)$/.test(error.message);
}

const CLOUD_ERROR_MESSAGES = Object.assign(Object.create(null), {
  not_paired: '本机尚未保存云设备令牌，请先完成配对',
  device_auth_required: '设备令牌未被云服务认可，请重新配对',
  auth_required: '网页账户尚未登录',
  activation_required: '云空间尚未激活，请先在网页端兑换激活码',
  rate_limited: '请求频率超过云服务限制，请等待一分钟后再试',
  pairing_not_found: '云服务找不到此配对会话，配对码可能已过期',
  invalid_pairing_code: '配对码格式错误、已使用或已经过期',
  invalid_ai_request: 'AI 请求缺少模式、需求说明或脚本内容',
  ai_not_configured: '云服务尚未配置 AI 模型',
  ai_credit_insufficient: 'AI 余额不足，请在网页端充值',
  ai_provider_unavailable: '上游 AI 服务拒绝请求或暂时不可达',
  ai_invalid_response: 'AI 服务返回的内容缺少可用脚本代码',
  invalid_market_script: '市场脚本响应缺少名称或源代码',
  invalid_cloud_script: '云空间文件响应缺少脚本资料或源代码',
  checksum_mismatch: '下载内容的校验值与服务器记录不一致，文件未写入',
  file_exists: '本地已有同名文件，未覆盖现有内容',
  not_found: '云服务中不存在该文件，或当前设备无权访问',
  invalid_script: '脚本名称、内容或大小不符合云服务要求',
  invalid_javascript: '脚本存在 JavaScript 语法错误，云服务拒绝保存',
  script_name_exists: '云空间已有同名脚本',
  cloud_fetch_unavailable: '当前设备不支持 fetch 直连，请切换 AstroBox 网络桥接（Vela 203）',
  cloud_fetch_timeout: 'fetch 直连请求超时（Vela 204）',
  cloud_fetch_invalid_parameters: 'fetch 直连参数无效（Vela 202）',
  cloud_fetch_io_error: 'fetch 直连发生网络 I/O 错误（Vela 300）',
  cloud_fetch_system_error: 'fetch 直连触发 Vela 系统内部错误（Vela 200）',
  cloud_fetch_rejected: 'fetch 直连请求被用户拒绝',
  cloud_fetch_duplicate: 'fetch 直连请求被系统判定为重复提交（Vela 205）',
  cloud_network_unavailable: 'fetch 直连请求未完成',
  cloud_proxy_unavailable: 'AstroBox 尚未连接，无法使用网络桥接',
  cloud_proxy_disconnected: 'AstroBox 连接已断开，网络桥接请求没有完成',
  cloud_proxy_timeout: 'AstroBox 网络桥接超过本次请求的等待时限',
  cloud_proxy_network_error: 'AstroBox 已收到请求，但访问云服务失败',
  cloud_proxy_send_failed: '手环无法把网络请求发送给 AstroBox',
  cloud_invalid_response: '云服务返回了无法解析的响应'
});

function contextualMessage(operation, reason) {
  return String(operation || '云服务请求').replace(/[：:，,。\s]+$/g, '') + '：' + reason;
}

export function errorMessage(error, operation) {
  const value = error || {};
  const key = String(value.message || '');
  let reason = CLOUD_ERROR_MESSAGES[key];
  if (!reason && value.status === 401) reason = CLOUD_ERROR_MESSAGES.device_auth_required;
  if (reason) {
    const suffix = value.status && key !== 'device_auth_required' ? '（HTTP ' + value.status + '）' : '';
    const nativeSuffix = Number.isFinite(Number(value.nativeCode)) && reason.indexOf('Vela ' + Number(value.nativeCode)) === -1
      ? '（Vela ' + Number(value.nativeCode) + (value.detail ? '：' + cleanDetail(value.detail) : '') + '）'
      : '';
    return contextualMessage(operation, reason + suffix + nativeSuffix);
  }
  if (value.status) {
    const serverMessage = cleanDetail(value.serverMessage);
    const serverCode = key && !/^cloud_http_/.test(key) ? key : '';
    return contextualMessage(operation, '云服务返回 HTTP ' + value.status +
      (serverMessage ? '：' + serverMessage : serverCode ? '（错误标识 ' + serverCode + '）' : '，且未提供错误标识'));
  }
  return formatError(value, operation || '云服务请求');
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
      return companionBridge.requestCloud({
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

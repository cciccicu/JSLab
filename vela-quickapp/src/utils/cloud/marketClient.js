import jsManager from '../files/jsManager.js';
import { normalizeMarketSaveName } from './marketFilename.js';
import { request } from './cloudTransport.js';
import { scriptList, verifySourceChecksum } from './cloudResponse.js';
import { marketDevices, marketDeviceLabel } from './marketDevices.js';

const MODERATION_TIMEOUT_MS = 330 * 1000;

function marketEngagement(script) {
  const count = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;
  return { downloadCount: count(script.downloadCount), likeCount: count(script.likeCount), liked: script.liked === true };
}

function marketStatus(script) {
  const labels = { pending: '待审核', published: '已发布', rejected: '已拒绝', draft: '草稿' };
  const reason = script.status === 'rejected' && script.review && script.review.decision === 'reject' && String(script.review.reason || '').trim();
  return Object.assign({}, script, marketEngagement(script), {
    statusText: script.statusText || labels[script.status] || '状态未知',
    reviewReason: script.status === 'rejected' ? reason || '未记录具体原因，请修改后重新提交或联系管理员。' : ''
  });
}

function withMine(path, mine) {
  return path + (mine ? '?mine=1' : '');
}

function listMarketScripts(query, mine) {
  const params = [];
  if (query) params.push('q=' + encodeURIComponent(query));
  if (mine) params.push('mine=1');
  return request('/api/cloud/device/market' + (params.length ? '?' + params.join('&') : '')).then(scriptList).then(scripts => scripts.map(script => Object.assign(marketStatus(script), {
    supportedDevices: marketDevices(script.supportedDevices), deviceLabel: marketDeviceLabel(script.supportedDevices)
  })));
}

function getMarketScript(id, mine) {
  return request(withMine('/api/cloud/device/market/' + encodeURIComponent(id) + '/source', mine)).then((result) => {
    const script = result && result.script;
    if (!script || typeof script.source !== 'string' || script.id == null) throw new Error('invalid_market_script');
    verifySourceChecksum(script.source, script.checksum);
    return Object.assign(marketStatus(script), { supportedDevices: marketDevices(script.supportedDevices), deviceLabel: marketDeviceLabel(script.supportedDevices) });
  });
}

function reportMarketScript(id, reason) {
  const value = String(reason || '').trim();
  if (!value) return Promise.reject(new Error('reason_required'));
  return request('/api/cloud/device/market/' + encodeURIComponent(id) + '/report', {
    method: 'POST', body: { reason: value }
  });
}

function likeMarketScript(id, liked) {
  return request('/api/cloud/device/market/' + encodeURIComponent(id) + '/like', {
    method: 'POST', body: { liked: !!liked }
  }).then(result => {
    if (!result || typeof result.liked !== 'boolean' || !Number.isSafeInteger(result.likeCount) || result.likeCount < 0) throw new Error('invalid_market_engagement');
    return marketEngagement(result);
  });
}

function deleteMarketScript(id) {
  return request('/api/cloud/device/market/' + encodeURIComponent(id) + '/delete', {
    method: 'POST'
  });
}

function submitMarketScript(localName, metadata) {
  const details = metadata || {};
  const supportedDevices = marketDevices(details.supportedDevices || []);
  if (!supportedDevices.length) return Promise.reject(new Error('请选择适配设备'));
  const body = {
    marketName: String(details.name || '').trim(),
    marketDescription: String(details.description || '').trim(),
    marketTags: String(details.tags || '').trim(),
    supportedDevices
  };
  if (details.marketId != null) {
    const marketId = Number(details.marketId);
    if (!Number.isSafeInteger(marketId) || marketId <= 0) return Promise.reject(new Error('invalid_market_id'));
    body.marketId = marketId;
  }
  return jsManager.read(localName).then(source => request('/api/cloud/device/market/submit', {
    method: 'POST', timeoutMs: MODERATION_TIMEOUT_MS, body: Object.assign({}, body, { source })
  })).then(result => {
    if (!result || !Number.isSafeInteger(Number(result.marketId)) || Number(result.marketId) <= 0 ||
      ['pending', 'published', 'rejected'].indexOf(result.status) < 0) throw new Error('invalid_market_script');
    return marketStatus(result);
  });
}

function downloadMarketScript(id, name, overwrite, mine, confirmDownload) {
  return getMarketScript(id, mine).then(script => {
    if (typeof confirmDownload !== 'function') return script;
    return Promise.resolve(confirmDownload(script)).then(accepted => {
      if (!accepted) throw new Error('market_download_cancelled');
      return script;
    });
  }).then((script) => {
    const target = normalizeMarketSaveName(name == null ? script.filename || script.name : name);
    verifySourceChecksum(script.source, script.checksum);
    return jsManager.list().then((files) => {
      if (!overwrite && files.some((file) => file.name === target)) throw new Error('file_exists');
      return jsManager.write(target, script.source).then(() => {
        const saved = Object.assign({}, script, { name: target });
        if (mine && script.status !== 'published') return saved;
        // Statistics must never turn a successful local save into a failed download.
        return request('/api/cloud/device/market/' + encodeURIComponent(id) + '/download', {
          method: 'POST', timeoutMs: 5000
        }).then(result => result && result.downloaded === true ? Object.assign(saved, marketEngagement(result)) : saved).catch(() => saved);
      });
    });
  });
}

export default { listMarketScripts, getMarketScript, reportMarketScript, likeMarketScript, deleteMarketScript, submitMarketScript, downloadMarketScript };

import jsManager from '../files/jsManager.js';
import { normalizeMarketSaveName } from './marketFilename.js';
import { request } from './cloudTransport.js';
import { scriptList, verifySourceChecksum } from './cloudResponse.js';

const MODERATION_TIMEOUT_MS = 330 * 1000;

function withMine(path, mine) {
  return path + (mine ? '?mine=1' : '');
}

function listMarketScripts(query, mine) {
  const params = [];
  if (query) params.push('q=' + encodeURIComponent(query));
  if (mine) params.push('mine=1');
  return request('/api/cloud/device/market' + (params.length ? '?' + params.join('&') : '')).then(scriptList);
}

function getMarketScript(id, mine) {
  return request(withMine('/api/cloud/device/market/' + encodeURIComponent(id) + '/source', mine)).then((result) => {
    const script = result && result.script;
    if (!script || typeof script.source !== 'string' || script.id == null) throw new Error('invalid_market_script');
    verifySourceChecksum(script.source, script.checksum);
    return script;
  });
}

function reportMarketScript(id, reason) {
  const value = String(reason || '').trim();
  if (!value) return Promise.reject(new Error('reason_required'));
  return request('/api/cloud/device/market/' + encodeURIComponent(id) + '/report', {
    method: 'POST', body: { reason: value }
  });
}

function submitMarketScript(localName, metadata) {
  const details = metadata || {};
  return jsManager.read(localName).then(source => request('/api/cloud/device/market/submit', {
    method: 'POST', timeoutMs: MODERATION_TIMEOUT_MS, body: {
      marketName: String(details.name || '').trim(),
      marketDescription: String(details.description || '').trim(),
      marketTags: String(details.tags || '').trim(),
      source
    }
  }));
}

function downloadMarketScript(id, name, overwrite, mine) {
  return getMarketScript(id, mine).then((script) => {
    const target = normalizeMarketSaveName(name == null ? script.filename || script.name : name);
    verifySourceChecksum(script.source, script.checksum);
    return jsManager.list().then((files) => {
      if (!overwrite && files.some((file) => file.name === target)) throw new Error('file_exists');
      return jsManager.write(target, script.source).then(() => Object.assign({}, script, { name: target }));
    });
  });
}

export default { listMarketScripts, getMarketScript, reportMarketScript, submitMarketScript, downloadMarketScript };

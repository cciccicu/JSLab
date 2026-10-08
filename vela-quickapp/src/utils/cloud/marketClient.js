import jsManager from '../files/jsManager.js';
import { request } from './cloudTransport.js';
import { scriptList, verifySourceChecksum } from './cloudResponse.js';

const MODERATION_TIMEOUT_MS = 330 * 1000;

function listMarketScripts(query) {
  return request('/api/cloud/device/market' + (query ? '?q=' + encodeURIComponent(query) : '')).then(scriptList);
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

function downloadMarketScript(id, overwrite) {
  return request('/api/cloud/device/market/' + encodeURIComponent(id) + '/source').then((result) => {
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

export default { listMarketScripts, submitMarketScript, downloadMarketScript };

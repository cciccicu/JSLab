import jsManager from '../files/jsManager.js';
import { request } from './cloudTransport.js';
import { scriptList, verifySourceChecksum } from './cloudResponse.js';

function listCloudScripts() { return request('/api/cloud/device/scripts').then(scriptList); }

function uploadScript(name) {
  return jsManager.read(name).then((source) => listCloudScripts().then((scripts) => {
    const existing = scripts.find((script) => script.name === name);
    return request(existing ? '/api/cloud/device/scripts/' + existing.id : '/api/cloud/device/scripts', {
      method: existing ? 'PUT' : 'POST', body: { name, source }
    });
  }));
}

function downloadScript(id, name, overwrite) {
  return request('/api/cloud/device/scripts/' + encodeURIComponent(id)).then((result) => {
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

export default { listCloudScripts, uploadScript, downloadScript, deleteCloudScript };

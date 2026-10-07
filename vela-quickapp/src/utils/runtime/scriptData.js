import file from '@system.file';

const DATA_URI = 'internal://files/jslab-script-data.json';
const MAX_VALUE_BYTES = 16 * 1024;
const MAX_NAMESPACE_BYTES = 64 * 1024;
let cache = null;
let loadPromise = null;
let writeQueue = Promise.resolve();

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function sizeOf(value) {
  return unescape(encodeURIComponent(JSON.stringify(value))).length;
}

function readFile() {
  return new Promise((resolve, reject) => {
    file.readText({
      uri: DATA_URI,
      success(data) {
        try {
          const parsed = JSON.parse(data && data.text ? data.text : '{}');
          resolve(parsed && typeof parsed === 'object' ? parsed : {});
        } catch (error) {
          resolve({});
        }
      },
      fail(data, code) {
        if (Number(code) === 301) resolve({});
        else reject(new Error('scriptData read failed: ' + code));
      }
    });
  });
}

function load() {
  if (cache) return Promise.resolve(cache);
  if (!loadPromise) {
    loadPromise = readFile().then((value) => {
      cache = value;
      loadPromise = null;
      return cache;
    }).catch((error) => {
      loadPromise = null;
      throw error;
    });
  }
  return loadPromise;
}

function persist(next) {
  return new Promise((resolve, reject) => {
    file.writeText({
      uri: DATA_URI,
      text: JSON.stringify(next),
      success: () => { cache = next; resolve(true); },
      fail(data, code) { reject(new Error('scriptData write failed: ' + code)); }
    });
  });
}

// Queue the read/modify step as well as the write. Even one script can issue
// several saves before the first file callback completes.
function mutate(update) {
  writeQueue = writeQueue.catch(() => {}).then(() => load()).then((root) => {
    const next = clone(root);
    update(next);
    return persist(next);
  });
  return writeQueue;
}

function namespaceName(name) {
  const value = String(name || 'untitled.js');
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const readable = value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 48);
  return 'n_' + hash.toString(16).padStart(8, '0') + '_' + readable;
}

export function createScriptStorage(scriptName) {
  const namespace = namespaceName(scriptName);
  function getNamespace(root, create) {
    if (!root[namespace] && create) root[namespace] = { data: {}, config: {} };
    if (!root[namespace]) return { data: {}, config: {} };
    root[namespace].data = root[namespace].data && typeof root[namespace].data === 'object' ? root[namespace].data : {};
    root[namespace].config = root[namespace].config && typeof root[namespace].config === 'object' ? root[namespace].config : {};
    return root[namespace];
  }
  function get(area, key, fallback) {
    return load().then((root) => {
      const values = getNamespace(root, false)[area];
      const name = String(key);
      const value = Object.prototype.hasOwnProperty.call(values, name) ? values[name] : undefined;
      return clone(value === undefined ? fallback : value);
    });
  }
  function set(area, key, value) {
    if (sizeOf(value) > MAX_VALUE_BYTES) return Promise.reject(new Error('scriptData value is too large'));
    return mutate((next) => {
      const item = getNamespace(next, true);
      const name = String(key);
      const saved = clone(value);
      if (name === '__proto__') Object.defineProperty(item[area], name, { value: saved, enumerable: true, writable: true, configurable: true });
      else item[area][name] = saved;
      if (sizeOf(item[area]) > MAX_NAMESPACE_BYTES) throw new Error('scriptData namespace is too large');
    });
  }
  function remove(area, key) {
    return mutate((next) => {
      delete getNamespace(next, false)[area][String(key)];
    });
  }
  function clear(area) {
    return mutate((next) => {
      next[namespace] = next[namespace] || { data: {}, config: {} };
      next[namespace][area] = {};
    });
  }
  function all(area) {
    return load().then((root) => clone(getNamespace(root, false)[area]));
  }
  return {
    data: { get: (key, fallback) => get('data', key, fallback), set: (key, value) => set('data', key, value), delete: key => remove('data', key), clear: () => clear('data'), all: () => all('data') },
    config: { get: (key, fallback) => get('config', key, fallback), set: (key, value) => set('config', key, value), delete: key => remove('config', key), clear: () => clear('config'), all: () => all('config') }
  };
}

export default { createScriptStorage };

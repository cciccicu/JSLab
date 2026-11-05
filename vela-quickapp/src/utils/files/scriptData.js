import file from '@system.file';

const DATA_URI = 'internal://files/jslab-script-data.json';
let cache = null;
let loadPromise = null;
let writeQueue = Promise.resolve();

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
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
    if (update(next) === false) return false;
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
    return mutate((next) => {
      const item = getNamespace(next, true);
      const name = String(key);
      const saved = clone(value);
      if (name === '__proto__') Object.defineProperty(item[area], name, { value: saved, enumerable: true, writable: true, configurable: true });
      else item[area][name] = saved;
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

// Removing the whole namespace also removes both areas and avoids retaining an
// empty entry for every deleted script.
export function removeScriptStorage(scriptName) {
  const namespace = namespaceName(scriptName);
  return mutate((next) => {
    if (!Object.prototype.hasOwnProperty.call(next, namespace)) return false;
    delete next[namespace];
  });
}

export function renameScriptStorage(oldName, newName) {
  const from = namespaceName(oldName);
  const to = namespaceName(newName);
  if (from === to) return Promise.resolve(false);
  return mutate((next) => {
    const hasOld = Object.prototype.hasOwnProperty.call(next, from);
    const hasNew = Object.prototype.hasOwnProperty.call(next, to);
    if (!hasOld && !hasNew) return false;
    if (hasOld) next[to] = next[from];
    else delete next[to]; // Discard stale storage from a previously deleted name.
    delete next[from];
  });
}

function storageDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => key !== 'data' && key !== 'config') ||
    !Object.prototype.hasOwnProperty.call(value, 'data') || !Object.prototype.hasOwnProperty.call(value, 'config') ||
    !value.data || typeof value.data !== 'object' || Array.isArray(value.data) ||
    !value.config || typeof value.config !== 'object' || Array.isArray(value.config)) {
    throw new Error('脚本数据必须是包含 data 和 config 两个对象的 JSON');
  }
  return { data: value.data, config: value.config };
}

function storageContent(root, scriptName) {
  const item = root[namespaceName(scriptName)] || {};
  return JSON.stringify({ data: item.data || {}, config: item.config || {} });
}

export function readScriptStorageContent(scriptName) {
  return writeQueue.catch(() => {}).then(() => load()).then(root => storageContent(root, scriptName));
}

export function replaceScriptStorageContent(scriptName, base, content) {
  let expected;
  let replacement;
  try {
    expected = JSON.stringify(storageDocument(JSON.parse(base)));
    replacement = storageDocument(JSON.parse(content));
  } catch (error) { return Promise.reject(new Error(error.message || '脚本数据 JSON 无效')); }
  return mutate(next => {
    if (storageContent(next, scriptName) !== expected) throw new Error('脚本数据已变更，请重新读取后再保存；当前修改尚未覆盖设备数据');
    const namespace = namespaceName(scriptName);
    next[namespace] = next[namespace] || {};
    next[namespace].data = replacement.data;
    next[namespace].config = replacement.config;
  });
}

export default { createScriptStorage, removeScriptStorage, renameScriptStorage };

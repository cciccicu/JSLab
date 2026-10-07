import file from '@system.file';

const CONFIG_URI = 'internal://files/config.json';
const FILE_NOT_FOUND = 301;
let cachedConfig = null;
let loadPromise = null;
let writeQueue = Promise.resolve();

function cloneConfig(source) {
  return JSON.parse(JSON.stringify(source || {}));
}

function cloneValue(value) {
  return value && typeof value === 'object' ? cloneConfig(value) : value;
}

function getPathValue(source, path) {
  const segments = path.split('.');
  let value = source;

  for (let i = 0; i < segments.length; i++) {
    if (!value || value[segments[i]] === undefined) return undefined;
    value = value[segments[i]];
  }

  return value;
}

function setPathValue(source, path, value) {
  const segments = path.split('.');
  let target = source;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!target[segment] || typeof target[segment] !== 'object' || Array.isArray(target[segment])) {
      target[segment] = {};
    }
    target = target[segment];
  }

  target[segments[segments.length - 1]] = value;
  return source;
}

function readConfigFile() {
  return new Promise((resolve, reject) => {
    file.access({
      uri: CONFIG_URI,
      success: () => {
        file.readText({
          uri: CONFIG_URI,
          success: (data) => {
            try {
              const parsed = JSON.parse(data.text);
              resolve(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
            } catch (error) {
              console.error('Invalid configuration JSON:', error);
              resolve({});
            }
          },
          fail: (data, code) => reject(new Error('Failed to read configuration: ' + code))
        });
      },
      fail: (data, code) => {
        if (Number(code) === FILE_NOT_FOUND) {
          resolve({});
          return;
        }
        reject(new Error('Failed to access configuration: ' + code));
      }
    });
  });
}

function writeConfigFile(config) {
  return new Promise((resolve, reject) => {
    file.writeText({
      uri: CONFIG_URI,
      text: JSON.stringify(config),
      success: () => resolve(true),
      fail: (data, code) => reject(new Error('Failed to write configuration: ' + code))
    });
  });
}

function loadConfig(forceReload) {
  if (!forceReload && cachedConfig) return Promise.resolve(cachedConfig);
  if (loadPromise) return loadPromise;

  loadPromise = readConfigFile()
    .then((config) => {
      cachedConfig = config;
      loadPromise = null;
      return cachedConfig;
    })
    .catch((error) => {
      loadPromise = null;
      throw error;
    });
  return loadPromise;
}

function initialize() {
  return loadConfig(false).then(() => true);
}

function reload() {
  return writeQueue.catch(() => {}).then(() => loadConfig(true)).then(cloneConfig);
}

function readValue(key, defaultValue) {
  return loadConfig(false).then((config) => {
    const value = getPathValue(config, key);
    return cloneValue(value === undefined ? defaultValue : value);
  });
}

function writeValue(key, value) {
  const write = () => loadConfig(false).then((config) => {
    const nextConfig = setPathValue(cloneConfig(config), key, cloneValue(value));
    return writeConfigFile(nextConfig).then(() => {
      cachedConfig = nextConfig;
      return true;
    });
  });
  writeQueue = writeQueue.catch(() => {}).then(write);
  return writeQueue;
}

export default {
  init: initialize,
  reload,
  get: readValue,
  set: writeValue
};

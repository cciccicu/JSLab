import file from '@system.file';

const CONFIG_URI = 'internal://files/config.json';
const FILE_NOT_FOUND = 301;

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
    if (!target[segment] || typeof target[segment] !== 'object') {
      target[segment] = {};
    }
    target = target[segment];
  }

  target[segments[segments.length - 1]] = value;
  return source;
}

function readConfig() {
  return new Promise((resolve, reject) => {
    file.access({
      uri: CONFIG_URI,
      success: () => {
        file.readText({
          uri: CONFIG_URI,
          success: (data) => {
            try {
              resolve(JSON.parse(data.text));
            } catch (error) {
              console.error('Invalid configuration JSON:', error);
              resolve({});
            }
          },
          fail: (data, code) => reject(new Error('Failed to read configuration: ' + code))
        });
      },
      fail: (data, code) => {
        if (code === FILE_NOT_FOUND) {
          resolve({});
          return;
        }
        reject(new Error('Failed to access configuration: ' + code));
      }
    });
  });
}

function writeConfig(config) {
  return new Promise((resolve, reject) => {
    file.writeText({
      uri: CONFIG_URI,
      text: JSON.stringify(config),
      success: () => resolve(true),
      fail: (data, code) => reject(new Error('Failed to write configuration: ' + code))
    });
  });
}

function readValue(key, defaultValue) {
  return readConfig()
    .then((config) => {
      const value = getPathValue(config, key);
      return value === undefined ? defaultValue : value;
    });
}

function writeValue(key, value) {
  return readConfig()
    .then((config) => writeConfig(setPathValue(config, key, value)));
}

export default {
  get: readValue,
  set: writeValue
};

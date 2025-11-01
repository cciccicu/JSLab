import file from '@system.file';

const CONFIG_FILE_PATH = 'internal://files/config.json';

/**
 * 根据路径获取对象的值
 * @param {Object} obj - 配置对象
 * @param {String} path - 路径，如 "editor.font"
 * @returns {*} - 对应路径的值
 */
function getValueByPath(obj, path) {
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current[key] === undefined) {
      return undefined;
    }
    current = current[key];
  }
  
  return current;
}

/**
 * 根据路径设置对象的值
 * @param {Object} obj - 配置对象
 * @param {String} path - 路径，如 "editor.font"
 * @param {*} value - 要设置的值
 * @returns {Object} - 更新后的配置对象
 */
function setValueByPath(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key]) {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[keys[keys.length - 1]] = value;
  return obj;
}

/**
 * 读取配置文件
 * @param {Function} callback - 回调函数 (error, config)
 */
function readConfig(callback) {
  file.access({
    uri: CONFIG_FILE_PATH,
    success: () => {
      file.readText({
        uri: CONFIG_FILE_PATH,
        success: (data) => {
          try {
            const config = JSON.parse(data.text);
            callback(null, config);
          } catch (e) {
            console.error('Invalid config format:', e);
            callback(null, {});
          }
        },
        fail: (data, code) => {
          console.error(`Failed to read config: ${data}, code: ${code}`);
          callback(null, {});
        }
      });
    },
    fail: (data, code) => {
      // 文件不存在（错误码301），返回空对象
      if (code === 301) {
        callback(null, {});
      } else {
        console.error(`Failed to check config file: ${data}, code: ${code}`);
        callback(null, {});
      }
    }
  });
}

/**
 * 写入配置文件
 * @param {Object} config - 配置对象
 * @param {Function} callback - 回调函数 (error, success)
 */
function writeConfig(config, callback) {
  const content = JSON.stringify(config);
  
  file.writeText({
    uri: CONFIG_FILE_PATH,
    text: content,
    success: () => {
      callback(null, true);
    },
    fail: (data, code) => {
      console.error(`Failed to write config: ${data}, code: ${code}`);
      callback(new Error(`Failed to write config, code: ${code}`), false);
    }
  });
}

export default {
  /**
   * 获取配置值
   * @param {String} key - 配置键，如 "editor.font"
   * @param {*} defaultValue - 默认值
   * @param {Function} callback - 回调函数 (error, value)
   */
  get(key, defaultValue, callback) {
    if (typeof defaultValue === 'function') {
      callback = defaultValue;
      defaultValue = null;
    }
    
    readConfig((error, config) => {
      if (error) {
        console.error('Error reading config:', error);
        callback(error, defaultValue);
        return;
      }
      
      const value = getValueByPath(config, key);
      callback(null, value !== undefined ? value : defaultValue);
    });
  },
  
  /**
   * 设置配置值
   * @param {String} key - 配置键，如 "editor.font"
   * @param {*} value - 配置值（支持多种数据类型）
   * @param {Function} callback - 回调函数 (error, success)
   */
  set(key, value, callback) {
    readConfig((error, config) => {
      if (error) {
        console.error('Error reading config:', error);
        callback(error, false);
        return;
      }
      
      config = setValueByPath(config, key, value);
      writeConfig(config, (error, success) => {
        if (error) {
          console.error('Error writing config:', error);
        }
        callback(error, success);
      });
    });
  }
};
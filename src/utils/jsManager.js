import file from '@system.file';

const SCRIPT_DIRECTORY_URI = 'internal://files/js/';
const MAX_SCRIPT_BYTES = 48 * 1024;
const changeListeners = [];
const fileLocks = {};

function notifyChange(change) {
  changeListeners.slice().forEach((listener) => {
    try {
      listener(change);
    } catch (error) {
      console.error('[JSLab] file change listener failed:', error);
    }
  });
}

function subscribe(listener) {
  if (typeof listener !== 'function') return () => {};
  changeListeners.push(listener);
  return () => {
    const index = changeListeners.indexOf(listener);
    if (index !== -1) changeListeners.splice(index, 1);
  };
}

function validateScriptName(name) {
  if (typeof name !== 'string' || !name || name.length > 128) {
    throw new Error('脚本文件名无效');
  }
  if (!/\.js$/i.test(name) || name.indexOf('..') !== -1 || /[\x00-\x1f\x7f/\\]/.test(name)) {
    throw new Error('只允许不含路径的 .js 文件名');
  }
  return name;
}

function utf8ByteLength(value) {
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

function validateScriptContent(content) {
  if (typeof content !== 'string') throw new Error('脚本内容必须是文本');
  if (utf8ByteLength(content) > MAX_SCRIPT_BYTES) {
    throw new Error('脚本不能超过 48 KiB');
  }
  return content;
}

function lockScript(name) {
  validateScriptName(name);
  if (fileLocks[name]) return fileLocks[name];
  const token = 'edit-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  fileLocks[name] = token;
  return token;
}

function unlockScript(name, token) {
  validateScriptName(name);
  if (fileLocks[name] && (!token || fileLocks[name] === token)) delete fileLocks[name];
}

function assertWritable(name, token) {
  validateScriptName(name);
  if (fileLocks[name] && fileLocks[name] !== token) {
    throw new Error('文件正在编辑中，请先退出编辑器');
  }
}

function getScriptUri(name) {
  return SCRIPT_DIRECTORY_URI + validateScriptName(name);
}

function ensureScriptDirectory() {
  return new Promise((resolve, reject) => {
    file.access({
      uri: SCRIPT_DIRECTORY_URI,
      success: () => resolve(),
      fail: () => {
        file.mkdir({
          uri: SCRIPT_DIRECTORY_URI,
          recursive: true,
          success: () => resolve(),
          fail: (data, code) => reject(new Error('Failed to create script directory: ' + code))
        });
      }
    });
  });
}

function toScriptMeta(fileInfo) {
  const uri = fileInfo.uri;
  return {
    name: uri.substring(uri.lastIndexOf('/') + 1),
    size: String(fileInfo.length)
  };
}

function listScripts() {
  return ensureScriptDirectory()
    .then(() => new Promise((resolve, reject) => {
      file.list({
        uri: SCRIPT_DIRECTORY_URI,
        success: (data) => resolve(data.fileList
          .filter((fileInfo) => fileInfo.uri.endsWith('.js'))
          .map(toScriptMeta)),
        fail: (data, code) => reject(new Error('Failed to list scripts: ' + code))
      });
    }));
}

function readScript(name) {
  return ensureScriptDirectory()
    .then(() => new Promise((resolve, reject) => {
      file.readText({
        uri: getScriptUri(name),
        success: (data) => resolve(data.text),
        fail: (data, code) => reject(new Error('Failed to read script: ' + code))
      });
    }));
}

function writeScript(name, content, options) {
  let safeContent;
  try {
    assertWritable(name, options && options.token);
    safeContent = validateScriptContent(content);
  } catch (error) {
    return Promise.reject(error);
  }
  return ensureScriptDirectory()
    .then(() => new Promise((resolve, reject) => {
      file.writeText({
        uri: getScriptUri(name),
        text: safeContent,
        success: () => {
          notifyChange({ action: 'write', name });
          resolve();
        },
        fail: (data, code) => reject(new Error('Failed to write script: ' + code))
      });
    }));
}

function renameScript(name, newName, options) {
  let srcUri;
  let dstUri;
  try {
    assertWritable(name, options && options.token);
    assertWritable(newName, options && options.token);
    srcUri = getScriptUri(name);
    dstUri = getScriptUri(newName);
  } catch (error) {
    return Promise.reject(error);
  }
  if (name === newName) return Promise.resolve();

  return ensureScriptDirectory()
    .then(() => new Promise((resolve, reject) => {
      file.access({
        uri: dstUri,
        success: () => reject(new Error('目标文件已存在')),
        fail: () => {
          file.move({
            srcUri,
            dstUri,
            success: () => {
              notifyChange({ action: 'rename', name: newName, previousName: name });
              resolve();
            },
            fail: (data, code) => reject(new Error('Failed to rename script: ' + code))
          });
        }
      });
    }));
}

function removeScript(name, options) {
  try {
    assertWritable(name, options && options.token);
  } catch (error) {
    return Promise.reject(error);
  }
  return ensureScriptDirectory()
    .then(() => new Promise((resolve, reject) => {
      file.delete({
        uri: getScriptUri(name),
        success: () => {
          notifyChange({ action: 'delete', name });
          resolve();
        },
        fail: (data, code) => reject(new Error('Failed to delete script: ' + code))
      });
    }));
}

export default {
  list: listScripts,
  read: readScript,
  write: writeScript,
  remove: removeScript,
  rename: renameScript,
  lock: lockScript,
  unlock: unlockScript,
  isLocked: name => !!fileLocks[name],
  subscribe,
  maxScriptBytes: MAX_SCRIPT_BYTES
};

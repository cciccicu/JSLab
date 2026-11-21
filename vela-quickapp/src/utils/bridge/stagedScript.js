import file from '@system.file';
import { controlledError } from '../core/controlledError.js';

const DIRECTORY = 'internal://files/jslab-transfer/';
const SCRIPT_DIRECTORY = 'internal://files/js/';
const PART_PATTERN = /^part-\d+-\d+\.part$/;
const MARKER_PATTERN = /^\.jslab-backup-(\d+-\d+)\.json$/;
let preparation = null;
const recoveries = Object.create(null);
const activeBackups = Object.create(null);

function nativeCall(method, options, action) {
  return new Promise((resolve, reject) => {
    file[method](Object.assign({}, options, {
      success: resolve,
      fail: (data, code) => reject(controlledError(action + '（Vela ' + code + '）'))
    }));
  });
}

function exists(uri) {
  const slash = uri.lastIndexOf('/');
  return nativeCall('list', { uri: uri.slice(0, slash + 1) }, '检查传输文件失败')
    .then(result => {
      if (!result || !Array.isArray(result.fileList)) throw controlledError('系统返回的传输目录信息无效');
      return result.fileList.some(item => item && item.uri === uri);
    });
}

function remove(uri) {
  return nativeCall('delete', { uri }, '清理传输文件失败');
}

function move(srcUri, dstUri) {
  return nativeCall('move', { srcUri, dstUri }, '移动传输文件失败');
}

// Cleanup before the first upload never scans or removes user scripts.
export function prepareStaging() {
  if (preparation) return preparation;
  preparation = new Promise((resolve, reject) => file.access({
    uri: DIRECTORY,
    success: resolve,
    fail: () => file.mkdir({
      uri: DIRECTORY, recursive: true, success: resolve,
      fail: (data, code) => reject(controlledError('创建传输目录失败（Vela ' + code + '）'))
    })
  }))
    .then(() => nativeCall('list', { uri: DIRECTORY }, '读取传输目录失败'))
    .then(result => {
      if (!result || !Array.isArray(result.fileList)) throw controlledError('系统返回的传输目录信息无效');
      return result.fileList.reduce((chain, item) => {
        const uri = item && item.uri;
        const name = typeof uri === 'string' && uri.indexOf(DIRECTORY) === 0 ? uri.slice(DIRECTORY.length) : '';
        return PART_PATTERN.test(name) ? chain.then(() => remove(uri)) : chain;
      }, Promise.resolve());
    });
  preparation = preparation.catch(error => { preparation = null; throw error; });
  return preparation;
}

export function stagingUri(transferId) {
  return DIRECTORY + 'part-' + transferId + '.part';
}

export function appendStaged(uri, content, append) {
  return nativeCall('writeText', { uri, text: content, append }, '写入传输分块失败');
}

export function verifyStagedSize(uri, expectedBytes) {
  return nativeCall('get', { uri }, '检查传输文件大小失败').then(result => {
    if (!result || Number(result.length) !== expectedBytes) {
      throw controlledError('传输文件大小不符，未覆盖原脚本');
    }
  });
}

export function discardStaged(uri) {
  return exists(uri).then(found => found ? remove(uri) : null);
}

function paths(uri) {
  const match = /^internal:\/\/files\/jslab-transfer\/part-(\d+-\d+)\.part$/.exec(uri);
  if (!match) throw controlledError('传输临时文件路径无效');
  return { marker: SCRIPT_DIRECTORY + '.jslab-backup-' + match[1] + '.json', backup: DIRECTORY + 'backup-' + match[1] + '.bak' };
}

// A short journal name keeps even legacy long script filenames usable.
export function inspectBackup(marker) {
  const name = typeof marker === 'string' && marker.indexOf(SCRIPT_DIRECTORY) === 0 ? marker.slice(SCRIPT_DIRECTORY.length) : '';
  const match = MARKER_PATTERN.exec(name);
  if (!match) return Promise.reject(controlledError('传输恢复记录路径无效'));
  const backup = DIRECTORY + 'backup-' + match[1] + '.bak';
  function invalidRecord() {
    // If writing the journal was interrupted before moving the original, keep
    // the damaged record for diagnosis and let the original remain accessible.
    return exists(backup).then(found => {
      if (found) throw controlledError('传输恢复记录损坏，原文件备份已保留');
      return exists(DIRECTORY + 'part-' + match[1] + '.part');
    }).then(hasPart => {
      if (!hasPart) throw controlledError('传输恢复记录损坏，请检查设备上的文件');
      const quarantine = DIRECTORY + 'invalid-' + match[1] + '.json';
      return exists(quarantine).then(found => {
        if (found) throw controlledError('传输恢复记录损坏，请检查设备上的文件');
        return move(marker, quarantine).then(() => null);
      });
    });
  }
  return nativeCall('readText', { uri: marker }, '读取传输恢复记录失败').then(result => {
    let record;
    try { record = JSON.parse(result.text); } catch (error) { return invalidRecord(); }
    const target = record && record.target;
    const script = typeof target === 'string' && target.indexOf(SCRIPT_DIRECTORY) === 0 ? target.slice(SCRIPT_DIRECTORY.length) : '';
    if (!script || /[\\/\x00-\x1f\x7f]/.test(script) || !/\.js$/i.test(script)) {
      return invalidRecord();
    }
    return { marker, backup, target, name: script };
  });
}

export function activeBackupTarget(marker) {
  return activeBackups[marker] || '';
}

// Recover the previous file if the app stopped between the two moves.
export function recoverBackup(info) {
  if (recoveries[info.marker]) return recoveries[info.marker];
  const operation = exists(info.backup).then(found => exists(info.target).then(targetExists => {
    if (!found && !targetExists) throw controlledError('原脚本和备份均不存在，传输恢复记录已保留');
    if (!found) return;
    return targetExists ? remove(info.backup) : move(info.backup, info.target);
  })).then(() => exists(info.marker)).then(found => found ? remove(info.marker) : null);
  recoveries[info.marker] = operation.then(result => {
    delete recoveries[info.marker];
    return result;
  }, error => {
    delete recoveries[info.marker];
    throw error;
  });
  return recoveries[info.marker];
}

export function commitStaged(uri, target, overwrite) {
  const transaction = paths(uri);
  activeBackups[transaction.marker] = target;
  let backedUp = false;
  let markerWritten = false;
  const operation = exists(target).then(found => {
    if (found && !overwrite) throw controlledError('文件已存在，需要确认覆盖');
    if (!found) return;
    const content = JSON.stringify({ target }).replace(/[^\x20-\x7e]/g, char =>
      '\\u' + ('0000' + char.charCodeAt(0).toString(16)).slice(-4));
    return exists(transaction.marker).then(markerExists => {
      if (markerExists) throw controlledError('传输恢复记录已存在，请重试');
      return exists(transaction.backup);
    }).then(backupExists => {
      if (backupExists) throw controlledError('传输备份已存在，请重试');
      // Mark before writing so a partial marker is cleaned without touching the original.
      markerWritten = true;
      return appendStaged(transaction.marker, content, false);
    }).then(() => verifyStagedSize(transaction.marker, content.length))
      .then(() => move(target, transaction.backup)).then(() => { backedUp = true; });
  }).then(() => move(uri, target)).then(() => {
    if (backedUp) return remove(transaction.backup).then(() => remove(transaction.marker)).catch(error => {
      console.error('[JSLab] 已保存脚本，但未能清理传输备份:', error.message);
    });
  }, error => {
    if (!markerWritten) throw error;
    const info = { marker: transaction.marker, backup: transaction.backup, target };
    // A failed move may still have taken effect. Inspect both paths before cleanup.
    return recoverBackup(info).then(() => { throw error; }, restoreError => {
      throw controlledError('保存失败，传输恢复记录已保留；恢复失败：' + restoreError.message);
    });
  });
  return operation.then(result => {
    delete activeBackups[transaction.marker];
    return result;
  }, error => {
    delete activeBackups[transaction.marker];
    throw error;
  });
}

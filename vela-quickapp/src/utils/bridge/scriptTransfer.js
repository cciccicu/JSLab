import { controlledError } from '../core/controlledError.js';
import jsManager from '../files/jsManager.js';
import { sliceUtf8Chunk, utf8ByteLength } from '../files/textEncoding.js';
import { prepareStaging, stagingUri, appendStaged, verifyStagedSize, discardStaged, commitStaged } from './stagedScript.js';

const READ_CHUNK_BYTES = 4096;
const MAX_WRITE_SESSIONS = 2;
const WRITE_SESSION_TTL_MS = 2 * 60 * 1000;
const writeSessions = Object.create(null);
let writeSequence = 0;

let writeQueue = Promise.resolve();
let generation = 0;

function discardSession(session) {
  clearTimeout(session.timer);
  return discardStaged(session.uri).then(() => {
    jsManager.unlock(session.name, session.lock);
  }, error => {
    jsManager.unlock(session.name, session.lock);
    throw error;
  });
}

function discardAfterError(session, error) {
  return discardSession(session).then(() => { throw error; }, cleanupError => {
    console.error('[JSLab] 传输文件清理失败:', cleanupError && cleanupError.message);
    throw error;
  });
}

function scheduleExpiry(session) {
  clearTimeout(session.timer);
  session.updatedAt = Date.now();
  session.timer = setTimeout(() => {
    writeQueue = writeQueue.catch(() => {}).then(() => cleanupWriteSessions());
  }, WRITE_SESSION_TTL_MS + 1);
}

function releaseSessions(sessions) {
  return sessions.reduce((promise, session) => promise.then(() => discardSession(session).catch(error => {
    console.error('[JSLab] 传输文件清理失败:', error && error.message);
  })), Promise.resolve());
}

function cleanupWriteSessions() {
  const now = Date.now();
  const expired = [];
  Object.keys(writeSessions).forEach(id => {
    if (now - writeSessions[id].updatedAt > WRITE_SESSION_TTL_MS) {
      expired.push(writeSessions[id]);
      delete writeSessions[id];
    }
  });
  return releaseSessions(expired);
}

export function clearScriptTransfers() {
  generation++;
  const sessions = Object.keys(writeSessions).map(id => writeSessions[id]);
  Object.keys(writeSessions).forEach(id => delete writeSessions[id]);
  writeQueue = writeQueue.catch(() => {}).then(() => releaseSessions(sessions));
}

function beginWrite(payload, epoch) {
  if (Object.keys(writeSessions).length >= MAX_WRITE_SESSIONS) {
    return Promise.reject(controlledError('当前写入任务过多，请稍后重试'));
  }
  if (!payload || typeof payload.name !== 'string') return Promise.reject(controlledError('缺少文件名'));
  const expectedBytes = Number(payload.size);
  if (!isFinite(expectedBytes) || expectedBytes < 0 || Math.floor(expectedBytes) !== expectedBytes) {
    return Promise.reject(controlledError('脚本长度无效'));
  }
  const target = jsManager.getScriptUri(payload.name);
  if (jsManager.isLocked(payload.name)) return Promise.reject(controlledError('文件正在编辑中，请先退出手环编辑器'));
  let lock;
  return jsManager.list().then(() => prepareStaging()).then(() => {
    if (epoch !== generation) throw controlledError('同步连接已断开');
    if (jsManager.isLocked(payload.name)) throw controlledError('文件正在编辑中，请先退出手环编辑器');
    lock = jsManager.lock(payload.name);
    return jsManager.list();
  }).then(files => {
    if (epoch !== generation) throw controlledError('同步连接已断开');
    const exists = files.some(fileInfo => fileInfo.name === payload.name);
    if (exists && payload.overwrite !== true) throw controlledError('文件已存在，需要确认覆盖');
    if (!exists) jsManager.validateNewScriptName(payload.name);
    const id = Date.now() + '-' + (++writeSequence);
    const transferId = 'w' + id;
    writeSessions[transferId] = {
      name: payload.name, target, uri: stagingUri(id), lock, overwrite: payload.overwrite === true,
      hasPart: false, nextIndex: 0, bytes: 0, expectedBytes, updatedAt: Date.now()
    };
    scheduleExpiry(writeSessions[transferId]);
    return { transferId, exists };
  }).catch(error => { if (lock) jsManager.unlock(payload.name, lock); throw error; });
}

function appendWriteChunk(payload) {
  const session = payload && writeSessions[payload.transferId];
  if (!session) return Promise.reject(controlledError('写入会话不存在或已过期'));
  if (payload.index !== session.nextIndex || typeof payload.content !== 'string') {
    return Promise.reject(controlledError('写入分块顺序无效'));
  }
  const chunkBytes = utf8ByteLength(payload.content);
  if (session.bytes + chunkBytes > session.expectedBytes) {
    delete writeSessions[payload.transferId];
    return discardSession(session).then(() => { throw controlledError('脚本写入数据超过声明长度'); });
  }
  return appendStaged(session.uri, payload.content, session.hasPart).then(() => {
    session.hasPart = true;
    session.bytes += chunkBytes;
    session.nextIndex++;
    scheduleExpiry(session);
    return { nextIndex: session.nextIndex, bytes: session.bytes };
  }).catch(error => {
    delete writeSessions[payload.transferId];
    return discardAfterError(session, error);
  });
}

function finishWrite(payload) {
  const session = payload && writeSessions[payload.transferId];
  if (!session) return Promise.reject(controlledError('写入会话不存在或已过期'));
  delete writeSessions[payload.transferId];
  clearTimeout(session.timer);
  if (session.bytes !== session.expectedBytes) {
    return discardSession(session).then(() => { throw controlledError('脚本写入不完整，请重新上传'); });
  }
  const ready = session.hasPart ? Promise.resolve() : appendStaged(session.uri, '', false);
  return ready.then(() => verifyStagedSize(session.uri, session.expectedBytes))
    .then(() => commitStaged(session.uri, session.target, session.overwrite)).then(() => {
    jsManager.unlock(session.name, session.lock);
    jsManager.notifyExternalWrite(session.name);
    return { name: session.name, size: session.bytes };
  }, error => discardAfterError(session, error));
}

function handleWrite(action, payload) {
  const epoch = generation;
  const operation = writeQueue.catch(() => {}).then(() => cleanupWriteSessions()).then(() => {
    if (epoch !== generation) throw controlledError('同步连接已断开');
    if (action === 'writeStart') return beginWrite(payload, epoch);
    if (action === 'writeChunk') return appendWriteChunk(payload);
    return finishWrite(payload);
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

export function handleScriptTransfer(action, payload) {
  switch (action) {
    case 'list':
      return jsManager.list().then(files => ({ files }));
    case 'create':
      if (jsManager.isLocked(payload.name)) return Promise.reject(controlledError('文件正在编辑中，请先退出手环编辑器'));
      return jsManager.list().then((files) => {
        if (files.some(file => file.name === payload.name)) throw controlledError('文件已存在');
        return jsManager.write(payload.name, '', { fallbackToSpace: true });
      }).then(content => ({ name: payload.name, size: utf8ByteLength(content) }));
    case 'read':
      return jsManager.read(payload.name).then((content) => {
        const offset = payload.offset == null ? 0 : payload.offset;
        const chunk = sliceUtf8Chunk(content, offset, READ_CHUNK_BYTES);
        return {
          name: payload.name,
          content: chunk.content,
          nextOffset: chunk.nextOffset,
          done: chunk.done,
          size: chunk.size
        };
      });
    case 'writeStart':
      return handleWrite(action, payload);
    case 'writeChunk':
      return handleWrite(action, payload);
    case 'writeFinish':
      return handleWrite(action, payload);
    case 'rename':
      if (jsManager.isLocked(payload.name) || jsManager.isLocked(payload.newName)) {
        return Promise.reject(controlledError('文件正在编辑中，请先退出手环编辑器'));
      }
      return jsManager.rename(payload.name, payload.newName).then(() => ({ name: payload.newName }));
    case 'delete':
      if (jsManager.isLocked(payload.name)) return Promise.reject(controlledError('文件正在编辑中，请先退出手环编辑器'));
      return jsManager.remove(payload.name).then(() => ({ name: payload.name }));
    default:
      return Promise.reject(controlledError('未知桥接操作: ' + action));
  }
}

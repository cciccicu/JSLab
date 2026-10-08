import jsManager from '../files/jsManager.js';
import { sliceUtf8Chunk, utf8ByteLength } from '../files/textEncoding.js';

const READ_CHUNK_BYTES = 4096;
const MAX_WRITE_SESSIONS = 2;
const WRITE_SESSION_TTL_MS = 2 * 60 * 1000;
const writeSessions = Object.create(null);
let writeSequence = 0;

function cleanupWriteSessions() {
  const now = Date.now();
  Object.keys(writeSessions).forEach((id) => {
    if (now - writeSessions[id].updatedAt > WRITE_SESSION_TTL_MS) delete writeSessions[id];
  });
}

export function clearScriptTransfers() {
  Object.keys(writeSessions).forEach(id => delete writeSessions[id]);
}

function beginWrite(payload) {
  cleanupWriteSessions();
  if (Object.keys(writeSessions).length >= MAX_WRITE_SESSIONS) {
    return Promise.reject(new Error('当前写入任务过多，请稍后重试'));
  }
  if (!payload || typeof payload.name !== 'string') return Promise.reject(new Error('缺少文件名'));
  const expectedBytes = Number(payload.size);
  if (!isFinite(expectedBytes) || expectedBytes < 0 || Math.floor(expectedBytes) !== expectedBytes) {
    return Promise.reject(new Error('脚本长度无效'));
  }
  if (jsManager.isLocked(payload.name)) return Promise.reject(new Error('文件正在编辑中，请先退出手环编辑器'));

  return jsManager.list().then((files) => {
    const exists = files.some(fileInfo => fileInfo.name === payload.name);
    if (exists && payload.overwrite !== true) {
      throw new Error('文件已存在，需要确认覆盖');
    }
    const transferId = 'w' + Date.now() + '-' + (++writeSequence);
    writeSessions[transferId] = {
      name: payload.name,
      chunks: [],
      nextIndex: 0,
      bytes: 0,
      expectedBytes,
      updatedAt: Date.now()
    };
    return { transferId, exists };
  });
}

function appendWriteChunk(payload) {
  cleanupWriteSessions();
  const session = payload && writeSessions[payload.transferId];
  if (!session) return Promise.reject(new Error('写入会话不存在或已过期'));
  if (payload.index !== session.nextIndex || typeof payload.content !== 'string') {
    return Promise.reject(new Error('写入分块顺序无效'));
  }
  const chunkBytes = utf8ByteLength(payload.content);
  if (session.bytes + chunkBytes > session.expectedBytes) {
    delete writeSessions[payload.transferId];
    return Promise.reject(new Error('脚本写入数据超过声明长度'));
  }
  session.chunks.push(payload.content);
  session.bytes += chunkBytes;
  session.nextIndex += 1;
  session.updatedAt = Date.now();
  return Promise.resolve({ nextIndex: session.nextIndex, bytes: session.bytes });
}

function finishWrite(payload) {
  cleanupWriteSessions();
  const session = payload && writeSessions[payload.transferId];
  if (!session) return Promise.reject(new Error('写入会话不存在或已过期'));
  if (jsManager.isLocked(session.name)) {
    delete writeSessions[payload.transferId];
    return Promise.reject(new Error('文件正在编辑中，请先退出手环编辑器'));
  }
  if (session.bytes !== session.expectedBytes) {
    delete writeSessions[payload.transferId];
    return Promise.reject(new Error('脚本写入不完整，请重新上传'));
  }
  delete writeSessions[payload.transferId];
  return jsManager.write(session.name, session.chunks.join('')).then(() => ({
    name: session.name,
    size: session.bytes
  }));
}

export function handleScriptTransfer(action, payload) {
  switch (action) {
    case 'list':
      return jsManager.list().then(files => ({ files }));
    case 'create':
      if (jsManager.isLocked(payload.name)) return Promise.reject(new Error('文件正在编辑中，请先退出手环编辑器'));
      return jsManager.list().then((files) => {
        if (files.some(file => file.name === payload.name)) throw new Error('文件已存在');
        return jsManager.write(payload.name, '');
      }).then(() => ({ name: payload.name, size: 0 }));
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
      return beginWrite(payload);
    case 'writeChunk':
      return appendWriteChunk(payload);
    case 'writeFinish':
      return finishWrite(payload);
    case 'rename':
      if (jsManager.isLocked(payload.name) || jsManager.isLocked(payload.newName)) {
        return Promise.reject(new Error('文件正在编辑中，请先退出手环编辑器'));
      }
      return jsManager.rename(payload.name, payload.newName).then(() => ({ name: payload.newName }));
    case 'delete':
      if (jsManager.isLocked(payload.name)) return Promise.reject(new Error('文件正在编辑中，请先退出手环编辑器'));
      return jsManager.remove(payload.name).then(() => ({ name: payload.name }));
    default:
      return Promise.reject(new Error('未知桥接操作: ' + action));
  }
}

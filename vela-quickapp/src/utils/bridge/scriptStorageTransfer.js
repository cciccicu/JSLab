import jsManager from '../files/jsManager.js';
import { readScriptStorageContent, replaceScriptStorageContent } from '../files/scriptData.js';
import { sliceUtf8Chunk, utf8ByteLength } from '../files/textEncoding.js';

// Optional extension to the unchanged v2 envelope and script synchronization API.
export const SCRIPT_STORAGE_PROTOCOL = 1;
const CHUNK_BYTES = 4096;
const SESSION_TTL_MS = 2 * 60 * 1000;
const MAX_SESSIONS = 2;
const reads = Object.create(null);
const writes = Object.create(null);
let sequence = 0;
let generation = 0;
let queue = Promise.resolve();

export function clearScriptStorageTransfers() {
  generation++;
  Object.keys(reads).forEach(id => delete reads[id]);
  Object.keys(writes).forEach(id => delete writes[id]);
}

function cleanup(sessions) {
  Object.keys(sessions).forEach(id => {
    if (Date.now() - sessions[id].updatedAt > SESSION_TTL_MS) delete sessions[id];
  });
}

function existingScript(name) {
  if (typeof name !== 'string') return Promise.reject(new Error('缺少脚本文件名'));
  return jsManager.list().then(files => {
    if (!files.some(item => item.name === name)) throw new Error('脚本不存在，请刷新文件列表');
  });
}

function read(payload) {
  cleanup(reads);
  const offset = payload.offset == null ? 0 : payload.offset;
  const start = payload.transferId == null;
  const epoch = generation;
  let transferId = payload.transferId;
  const prepare = start ? existingScript(payload.name).then(() => {
    if (offset !== 0) throw new Error('读取必须从首个分块开始');
    if (Object.keys(reads).length >= MAX_SESSIONS) throw new Error('当前数据读取任务过多，请稍后重试');
    return readScriptStorageContent(payload.name);
  }).then(content => {
    if (epoch !== generation) throw new Error('同步连接已断开');
    transferId = 'sr' + Date.now() + '-' + (++sequence);
    reads[transferId] = { name: payload.name, content, offset: 0, updatedAt: Date.now() };
  }) : Promise.resolve();
  return prepare.then(() => {
    const session = reads[transferId];
    if (!session || session.name !== payload.name || session.offset !== offset) throw new Error('数据读取会话或偏移无效，请重新读取');
    const chunk = sliceUtf8Chunk(session.content, offset, CHUNK_BYTES);
    session.offset = chunk.nextOffset;
    session.updatedAt = Date.now();
    if (chunk.done) delete reads[transferId];
    return Object.assign({ name: session.name, transferId }, chunk);
  });
}

function writeStart(payload) {
  cleanup(writes);
  if (!Number.isSafeInteger(payload.size) || payload.size < 0) return Promise.reject(new Error('数据长度无效'));
  if (Object.keys(writes).length >= MAX_SESSIONS) return Promise.reject(new Error('当前数据写入任务过多，请稍后重试'));
  const epoch = generation;
  return existingScript(payload.name).then(() => {
    if (epoch !== generation) throw new Error('同步连接已断开');
    if (jsManager.isLocked(payload.name)) throw new Error('文件正在编辑中，请先退出手环编辑器');
    const transferId = 'sw' + Date.now() + '-' + (++sequence);
    writes[transferId] = { name: payload.name, size: payload.size, chunks: [], bytes: 0, nextIndex: 0, updatedAt: Date.now() };
    return { transferId };
  });
}

function writeChunk(payload) {
  cleanup(writes);
  const session = writes[payload.transferId];
  if (!session || session.nextIndex !== payload.index || typeof payload.content !== 'string') throw new Error('数据写入会话或分块顺序无效');
  const bytes = utf8ByteLength(payload.content);
  if (bytes > CHUNK_BYTES || session.bytes + bytes > session.size) {
    delete writes[payload.transferId];
    throw new Error('数据分块超过允许长度');
  }
  session.chunks.push(payload.content);
  session.bytes += bytes;
  session.nextIndex++;
  session.updatedAt = Date.now();
  return { bytes: session.bytes, nextIndex: session.nextIndex };
}

function writeFinish(payload) {
  cleanup(writes);
  const session = writes[payload.transferId];
  if (!session) throw new Error('数据写入会话不存在或已过期');
  delete writes[payload.transferId];
  if (session.bytes !== session.size) throw new Error('数据写入不完整，请重新保存');
  const document = JSON.parse(session.chunks.join(''));
  if (!document || typeof document.base !== 'string' || typeof document.content !== 'string') throw new Error('数据保存请求缺少原始内容或新内容');
  let lock;
  return existingScript(session.name).then(() => {
    if (jsManager.isLocked(session.name)) throw new Error('文件正在编辑中，请先退出手环编辑器');
    lock = jsManager.lock(session.name);
    return replaceScriptStorageContent(session.name, document.base, document.content);
  }).then(() => {
    jsManager.unlock(session.name, lock);
    return { name: session.name, size: session.size };
  }, error => {
    if (lock) jsManager.unlock(session.name, lock);
    throw error;
  });
}

export function handleScriptStorageTransfer(action, payload) {
  const epoch = generation;
  const operation = queue.catch(() => {}).then(() => {
    if (epoch !== generation) throw new Error('同步连接已断开');
    switch (action) {
      case 'storageRead': return read(payload);
      case 'storageWriteStart': return writeStart(payload);
      case 'storageWriteChunk': return writeChunk(payload);
      case 'storageWriteFinish': return writeFinish(payload);
      default: throw new Error('未知数据同步操作');
    }
  });
  queue = operation.catch(() => {});
  return operation;
}

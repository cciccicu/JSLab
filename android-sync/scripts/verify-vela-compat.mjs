// Read-only compatibility check against the actual existing wearable transfer handler.
// No Vela build, emulator, ADB, device connection, or source modification occurs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vela = path.resolve(root, '../vela-quickapp/src/utils');
const vectors = JSON.parse(fs.readFileSync(path.join(root, 'app/build/test-vectors/android-write.json'), 'utf8'));
const errorSource = fs.readFileSync(path.join(vela, 'core/controlledError.js'), 'utf8').replaceAll('export function ', 'function ');
const bridgeErrors = vm.runInNewContext(`(() => { ${errorSource}; return { controlledError, bridgeErrorInfo }; })()`);
const encodingSource = fs.readFileSync(path.join(vela, 'files/textEncoding.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replaceAll('export function ', 'function ');
const encoding = vm.runInNewContext(`(controlledError) => { ${encodingSource}; return { sliceUtf8Chunk, utf8ByteLength }; }`)(bridgeErrors.controlledError);
const storage = new Map();
const transferFiles = new Map();
const transferLocks = new Map();
const scriptPrefix = 'internal://files/js/';
const stagePrefix = 'internal://files/jslab-transfer/';
let stageDirectory = false;
let failMoveDestination = null;
let failMoveTimes = 0;
let failNextTransferWrite = false;
let ignoreAppend = false;
let largestTransferWrite = 0;
const movedPaths = [];
function filesFor(uri) { return uri.startsWith(scriptPrefix) ? storage : transferFiles; }
function fileKey(uri) { return uri.startsWith(scriptPrefix) ? uri.slice(scriptPrefix.length) : uri; }
const transferFile = {
  access: ({ uri, success, fail }) => uri === stagePrefix && stageDirectory ? success() : fail(null, 300),
  mkdir: ({ success }) => { stageDirectory = true; success(); },
  list: ({ uri, success }) => success({ fileList: uri === scriptPrefix
    ? [...storage].map(([name, content]) => ({ uri: scriptPrefix + name, length: Buffer.byteLength(content), lastModifiedTime: 0 }))
    : [...transferFiles.keys()].map(name => ({ uri: name })) }),
  get: ({ uri, success, fail }) => filesFor(uri).has(fileKey(uri))
    ? success({ uri, length: Buffer.byteLength(filesFor(uri).get(fileKey(uri))) }) : fail(null, 300),
  readText: ({ uri, success, fail }) => filesFor(uri).has(fileKey(uri))
    ? success({ text: filesFor(uri).get(fileKey(uri)) }) : fail(null, 300),
  writeText: ({ uri, text, append, success, fail }) => {
    if (failNextTransferWrite) { failNextTransferWrite = false; return fail(null, 300); }
    largestTransferWrite = Math.max(largestTransferWrite, Buffer.byteLength(text));
    const files = filesFor(uri), key = fileKey(uri);
    files.set(key, (append && !ignoreAppend ? files.get(key) || '' : '') + text); success();
  },
  move: ({ srcUri, dstUri, success, fail }) => {
    movedPaths.push([srcUri, dstUri]);
    if (Buffer.byteLength(dstUri.slice(dstUri.lastIndexOf('/') + 1)) > 255) return fail(null, 300);
    if (dstUri === failMoveDestination && failMoveTimes > 0) { failMoveTimes--; return fail(null, 300); }
    const source = filesFor(srcUri), dest = filesFor(dstUri), key = fileKey(srcUri);
    if (!source.has(key)) return fail(null, 300);
    dest.set(fileKey(dstUri), source.get(key)); source.delete(key); success();
  },
  delete: ({ uri, success, fail }) => filesFor(uri).delete(fileKey(uri)) ? success() : fail(null, 300)
};
const stagedSource = fs.readFileSync(path.join(vela, 'bridge/stagedScript.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replaceAll('export function ', 'function ');
const staged = vm.runInNewContext(`(file, controlledError) => { ${stagedSource}; return {
  prepareStaging, stagingUri, appendStaged, verifyStagedSize, discardStaged, inspectBackup, recoverBackup, commitStaged
}; }`)(transferFile, bridgeErrors.controlledError);
const manager = {
  isLocked: name => transferLocks.has(name),
  lock: name => { const token = {}; transferLocks.set(name, token); return token; },
  unlock: (name, token) => { assert.equal(transferLocks.get(name), token); transferLocks.delete(name); },
  getScriptUri: name => scriptPrefix + name,
  validateNewScriptName: () => {}, notifyExternalWrite: () => {},
  list: async () => [...storage].map(([name, content]) => ({ name, size: encoding.utf8ByteLength(content) })),
  read: async name => { assert.ok(storage.has(name)); return storage.get(name); },
  write: async (name, content) => { storage.set(name, content); return content; },
  rename: async (name, next) => { assert.ok(!storage.has(next)); storage.set(next, storage.get(name)); storage.delete(name); },
  remove: async name => storage.delete(name),
};
const source = fs.readFileSync(path.join(vela, 'bridge/scriptTransfer.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replaceAll('export function ', 'function ');
const handler = vm.runInNewContext(`(jsManager, sliceUtf8Chunk, utf8ByteLength, controlledError,
  prepareStaging, stagingUri, appendStaged, verifyStagedSize, discardStaged, commitStaged, setTimeout, clearTimeout) => {
  ${source}; return { handleScriptTransfer, clearScriptTransfers };
}`)(manager, encoding.sliceUtf8Chunk, encoding.utf8ByteLength, bridgeErrors.controlledError,
  staged.prepareStaging, staged.stagingUri, staged.appendStaged, staged.verifyStagedSize, staged.discardStaged,
  staged.commitStaged, setTimeout, clearTimeout);
let session;
let bytes = 0;
let index = 0;
for (const request of vectors.requests) {
  const payload = { ...request.payload };
  if (payload.transferId) payload.transferId = session;
  const result = await handler.handleScriptTransfer(request.action, payload);
  if (request.action === 'writeStart') session = result.transferId;
  if (request.action === 'writeChunk') {
    bytes += Buffer.byteLength(payload.content, 'utf8');
    assert.equal(result.bytes, bytes);
    assert.equal(result.nextIndex, ++index);
  }
  if (request.action === 'writeFinish') {
    assert.equal(result.size, Buffer.byteLength(vectors.content, 'utf8'));
    assert.equal(result.name, vectors.name);
  }
}
assert.equal(storage.get(vectors.name), vectors.content);
let downloaded = '';
let offset = 0;
while (true) {
  const result = await handler.handleScriptTransfer('read', { name: vectors.name, offset });
  assert.equal(result.nextOffset, offset + Buffer.byteLength(result.content, 'utf8'));
  downloaded += result.content;
  offset = result.nextOffset;
  if (result.done) break;
}
assert.equal(downloaded, vectors.content);
await assert.rejects(handler.handleScriptTransfer('writeStart', { name: vectors.name, size: 1, overwrite: false }));
await handler.handleScriptTransfer('rename', { name: vectors.name, newName: 'renamed.ui.js' });
await handler.handleScriptTransfer('delete', { name: 'renamed.ui.js' });
assert.equal(storage.size, 0);
handler.clearScriptTransfers();
console.log(`Android → existing Vela v2: ${bytes} UTF-8 bytes / ${index} chunks; read, overwrite guard, rename, delete passed.`);

// Exercise a real-size upload through the actual Vela staging implementation.
const largeContent = '代码🙂abc\n'.repeat(50000);
const largeSize = Buffer.byteLength(largeContent);
const large = await handler.handleScriptTransfer('writeStart', { name: 'large.js', size: largeSize, overwrite: false });
let largeOffset = 0, largeIndex = 0;
while (largeOffset < largeSize) {
  const chunk = encoding.sliceUtf8Chunk(largeContent, largeOffset, 4096);
  const ack = await handler.handleScriptTransfer('writeChunk', { transferId: large.transferId, index: largeIndex++, content: chunk.content });
  largeOffset = chunk.nextOffset;
  assert.equal(ack.bytes, largeOffset);
}
await handler.handleScriptTransfer('writeFinish', { transferId: large.transferId });
assert.equal(storage.get('large.js'), largeContent);
assert.ok(largestTransferWrite <= 4096, 'No full script may be passed to native writeText');
assert.equal(transferFiles.size, 0);
assert.equal(transferLocks.size, 0);

// A near-filesystem-limit legacy filename is never lengthened for its backup.
const longName = '中'.repeat(83) + '.js';
assert.equal(Buffer.byteLength(longName), 252);
storage.set(longName, '旧脚本');
const longWrite = await handler.handleScriptTransfer('writeStart', { name: longName, size: 3, overwrite: true });
await handler.handleScriptTransfer('writeChunk', { transferId: longWrite.transferId, index: 0, content: 'new' });
await handler.handleScriptTransfer('writeFinish', { transferId: longWrite.transferId });
assert.equal(storage.get(longName), 'new');
assert.ok(movedPaths.some(([from, to]) => from === scriptPrefix + longName && to.startsWith(stagePrefix + 'backup-')));
storage.delete(longName);

// A failed replacement must restore the previous file, even after receiving all chunks.
storage.set('protected.js', '原始脚本');
const replace = await handler.handleScriptTransfer('writeStart', { name: 'protected.js', size: 3, overwrite: true });
await handler.handleScriptTransfer('writeChunk', { transferId: replace.transferId, index: 0, content: 'new' });
failMoveDestination = scriptPrefix + 'protected.js';
failMoveTimes = 1;
await assert.rejects(handler.handleScriptTransfer('writeFinish', { transferId: replace.transferId }));
assert.equal(storage.get('protected.js'), '原始脚本');
assert.equal([...storage.keys()].some(name => name.startsWith('.jslab-backup-')), false);
assert.equal(transferFiles.size, 0);
assert.equal(transferLocks.size, 0);

// If rollback itself fails, the backup is retained and recoverable on the next attempt.
const failedRestore = await handler.handleScriptTransfer('writeStart', { name: 'protected.js', size: 3, overwrite: true });
await handler.handleScriptTransfer('writeChunk', { transferId: failedRestore.transferId, index: 0, content: 'new' });
failMoveDestination = scriptPrefix + 'protected.js';
failMoveTimes = 2;
await assert.rejects(handler.handleScriptTransfer('writeFinish', { transferId: failedRestore.transferId }), /恢复记录已保留/);
const retainedMarker = [...storage.keys()].find(name => name.startsWith('.jslab-backup-'));
const retainedInfo = await staged.inspectBackup(scriptPrefix + retainedMarker);
assert.equal(transferFiles.get(retainedInfo.backup), '原始脚本');
assert.equal(storage.has('protected.js'), false);
await staged.recoverBackup(retainedInfo);
assert.equal(storage.get('protected.js'), '原始脚本');
assert.equal(transferLocks.size, 0);

// An append failure also retains the existing script and releases the lock.
const failedAppend = await handler.handleScriptTransfer('writeStart', { name: 'protected.js', size: 6, overwrite: true });
await handler.handleScriptTransfer('writeChunk', { transferId: failedAppend.transferId, index: 0, content: 'abc' });
failNextTransferWrite = true;
await assert.rejects(handler.handleScriptTransfer('writeChunk', { transferId: failedAppend.transferId, index: 1, content: 'def' }));
assert.equal(storage.get('protected.js'), '原始脚本');
assert.equal(transferFiles.size, 0);
assert.equal(transferLocks.size, 0);

// A platform that silently ignores append must never replace an existing script.
const ignoredAppend = await handler.handleScriptTransfer('writeStart', { name: 'protected.js', size: 6, overwrite: true });
ignoreAppend = true;
await handler.handleScriptTransfer('writeChunk', { transferId: ignoredAppend.transferId, index: 0, content: 'abc' });
await handler.handleScriptTransfer('writeChunk', { transferId: ignoredAppend.transferId, index: 1, content: 'def' });
ignoreAppend = false;
await assert.rejects(handler.handleScriptTransfer('writeFinish', { transferId: ignoredAppend.transferId }), /大小不符/);
assert.equal(storage.get('protected.js'), '原始脚本');
assert.equal(transferFiles.size, 0);
assert.equal(transferLocks.size, 0);

// Disconnect releases the file lock and discards the incomplete staged file.
const interruptedScript = await handler.handleScriptTransfer('writeStart', { name: 'protected.js', size: 6, overwrite: true });
await handler.handleScriptTransfer('writeChunk', { transferId: interruptedScript.transferId, index: 0, content: 'new' });
handler.clearScriptTransfers();
await new Promise(resolve => setImmediate(resolve));
assert.equal(storage.get('protected.js'), '原始脚本');
assert.equal(transferFiles.size, 0);
assert.equal(transferLocks.size, 0);
storage.set('.jslab-backup-123-1.json', JSON.stringify({ target: scriptPrefix + 'recovery.js' }));
transferFiles.set(stagePrefix + 'backup-123-1.bak', '中断前的原文');
await staged.recoverBackup(await staged.inspectBackup(scriptPrefix + '.jslab-backup-123-1.json'));
assert.equal(storage.get('recovery.js'), '中断前的原文');
assert.equal(storage.has('.jslab-backup-123-1.json'), false);
storage.delete('recovery.js');

// A torn journal before the original was moved is quarantined; no backup is deleted.
storage.set('.jslab-backup-123-2.json', '{');
transferFiles.set(stagePrefix + 'part-123-2.part', '未完成的内容');
assert.equal(await staged.inspectBackup(scriptPrefix + '.jslab-backup-123-2.json'), null);
assert.equal(storage.has('.jslab-backup-123-2.json'), false);
assert.equal(transferFiles.get(stagePrefix + 'invalid-123-2.json'), '{');
transferFiles.delete(stagePrefix + 'invalid-123-2.json');
transferFiles.delete(stagePrefix + 'part-123-2.part');
storage.delete('large.js'); storage.delete('protected.js');
console.log(`Staged upload: ${largeSize} bytes in ${largeIndex} bounded writes; failed replacement and disconnect preserved the original.`);

// Replay both clients against the actual wearable persistence queue and extension.
let savedRoot = '{}';
let failWrite = false;
const file = {
  readText: ({ success }) => setImmediate(() => success({ text: savedRoot })),
  writeText: ({ text, success, fail }) => setImmediate(() => {
    if (failWrite) { failWrite = false; fail(null, 300); }
    else { savedRoot = text; success(); }
  }),
};
const dataSource = fs.readFileSync(path.join(vela, 'files/scriptData.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replaceAll('export function ', 'function ')
  .replace(/export default [^;]+;/, '');
const data = vm.runInNewContext(`(file, controlledError) => { ${dataSource}; return {
  createScriptStorage, removeScriptStorage, readScriptStorageContent, replaceScriptStorageContent
}; }`)(file, bridgeErrors.controlledError);
const locks = new Map();
manager.isLocked = name => locks.has(name);
manager.lock = name => { assert.ok(!locks.has(name)); const token = {}; locks.set(name, token); return token; };
manager.unlock = (name, token) => { assert.equal(locks.get(name), token); locks.delete(name); };
const storageSource = fs.readFileSync(path.join(vela, 'bridge/scriptStorageTransfer.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replaceAll('export function ', 'function ').replace('export const ', 'const ');
const storageHandler = vm.runInNewContext(`(jsManager, readScriptStorageContent, replaceScriptStorageContent, sliceUtf8Chunk, utf8ByteLength, controlledError) => {
  ${storageSource}; return { handleScriptStorageTransfer, clearScriptStorageTransfers, SCRIPT_STORAGE_PROTOCOL };
}`)(manager, data.readScriptStorageContent, data.replaceScriptStorageContent, encoding.sliceUtf8Chunk, encoding.utf8ByteLength, bridgeErrors.controlledError);
const storageRpc = storageHandler.handleScriptStorageTransfer;
async function uploadData(name, base, content) {
  const frame = JSON.stringify({ base, content });
  const { transferId } = await storageRpc('storageWriteStart', { name, size: Buffer.byteLength(frame) });
  let offset = 0;
  let index = 0;
  while (offset < Buffer.byteLength(frame)) {
    const chunk = encoding.sliceUtf8Chunk(frame, offset, 4096);
    await storageRpc('storageWriteChunk', { transferId, index: index++, content: chunk.content });
    offset = chunk.nextOffset;
  }
  return storageRpc('storageWriteFinish', { transferId });
}
storage.set('unrelated.js', '// unrelated source');
await data.createScriptStorage('unrelated.js').data.set('retained', { nested: [true, null, '原数据'] });
const unrelatedBefore = await data.readScriptStorageContent('unrelated.js');
for (const [label, vectorPath] of [
  ['Android', path.join(root, 'app/build/test-vectors/android-storage-write.json')],
  ['AstroBox', path.resolve(root, '../astrobox-plugin-sync/target/test-vectors/rust-storage-write.json')],
].filter(([label, vectorPath]) => label === 'Android' || fs.existsSync(vectorPath))) {
  const vector = JSON.parse(fs.readFileSync(vectorPath, 'utf8'));
  storage.set(vector.name, '// original source');
  await data.removeScriptStorage(vector.name);
  const runtime = data.createScriptStorage(vector.name);
  await runtime.data.set('count', 1);
  await runtime.config.set('enabled', true);
  let transferId;
  let received = 0;
  let chunks = 0;
  for (const request of vector.requests) {
    const payload = { ...request.payload };
    if (payload.transferId) payload.transferId = transferId;
    const result = await storageRpc(request.action, payload);
    if (request.action === 'storageWriteStart') transferId = result.transferId;
    if (request.action === 'storageWriteChunk') {
      received += Buffer.byteLength(payload.content);
      assert.equal(result.bytes, received);
      assert.equal(result.nextIndex, ++chunks);
    }
    if (request.action === 'storageWriteFinish') {
      assert.equal(result.name, vector.name);
      assert.equal(result.size, received);
    }
  }
  assert.deepEqual(JSON.parse(await data.readScriptStorageContent(vector.name)), JSON.parse(vector.content));
  assert.equal(await runtime.config.get('enabled'), false);
  assert.equal(await runtime.data.get('text'), JSON.parse(vector.content).data.text);
  assert.equal(storage.get(vector.name), '// original source');
  console.log(`${label} → Vela storage extension v1: ${received} UTF-8 bytes / ${chunks} chunks; persistence and legacy data/config APIs passed.`);
}
const name = '中文.ui.JS';
const runtime = data.createScriptStorage(name);
const before = await data.readScriptStorageContent(name);
let first = await storageRpc('storageRead', { name, offset: 0 });
assert.equal(first.done, false);
await runtime.data.set('count', 99);
let snapshot = first.content;
while (!first.done) {
  const next = await storageRpc('storageRead', { name, transferId: first.transferId, offset: first.nextOffset });
  assert.equal(next.transferId, first.transferId);
  snapshot += next.content;
  first = next;
}
assert.equal(snapshot, before);
await assert.rejects(uploadData(name, before, '{"data":{},"config":{}}'), /已变更/);
assert.equal(await runtime.data.get('count'), 99);
let current = await data.readScriptStorageContent(name);
await assert.rejects(uploadData(name, current, '{"data":[],"config":{}}'), /两个对象/);
assert.equal(await data.readScriptStorageContent(name), current);
const interrupted = await storageRpc('storageWriteStart', { name, size: 100 });
await assert.rejects(storageRpc('storageWriteChunk', { transferId: interrupted.transferId, index: 1, content: '{}' }));
await assert.rejects(storageRpc('storageWriteFinish', interrupted), /不完整/);
assert.equal(await data.readScriptStorageContent(name), current);
const abandoned = await storageRpc('storageWriteStart', { name, size: 100 });
const abandonedRead = await storageRpc('storageRead', { name, offset: 0 });
storageHandler.clearScriptStorageTransfers();
await assert.rejects(storageRpc('storageWriteFinish', abandoned));
await assert.rejects(storageRpc('storageRead', { name, transferId: abandonedRead.transferId, offset: abandonedRead.nextOffset }));
failWrite = true;
await assert.rejects(uploadData(name, current, '{"data":{"restored":true},"config":{}}'), /write failed/);
assert.equal(await data.readScriptStorageContent(name), current);
assert.equal(locks.size, 0);
await uploadData(name, current, '{"data":{"restored":true,"__proto__":{"safe":true}},"config":{}}');
assert.equal(await runtime.data.get('restored'), true);
assert.equal((await runtime.data.get('__proto__')).safe, true);
assert.equal(await data.readScriptStorageContent('unrelated.js'), unrelatedBefore);
await assert.rejects(storageRpc('storageRead', { name: 'missing.js', offset: 0 }), /不存在/);
assert.equal(locks.size, 0);

// Exercise the v2 bridge entry point used by existing synchronizers as well.
const bridgeSource = fs.readFileSync(path.join(vela, 'bridge/companionBridge.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export default { start, stop, requestCloud };', 'return { start, stop };');
const responseWaiters = new Map();
const connection = { send: ({ data: response }) => responseWaiters.get(response.id)?.(response) };
manager.subscribe = () => () => {};
const bridge = vm.runInNewContext(`(interconnect, brightness, jsManager, fontManager, clearScriptTransfers, handleScriptTransfer,
  SCRIPT_STORAGE_PROTOCOL, clearScriptStorageTransfers, handleScriptStorageTransfer, setTimeout, clearTimeout, controlledError, bridgeErrorInfo) => {
  ${bridgeSource}
}`)({ instance: () => connection }, {}, manager, {}, handler.clearScriptTransfers, handler.handleScriptTransfer,
  storageHandler.SCRIPT_STORAGE_PROTOCOL, storageHandler.clearScriptStorageTransfers, storageRpc, setTimeout, clearTimeout,
  bridgeErrors.controlledError, bridgeErrors.bridgeErrorInfo);
bridge.start();
let requestId = 0;
async function bridgeResponse(action, payload = {}) {
  const id = String(++requestId);
  const response = new Promise(resolve => responseWaiters.set(id, resolve));
  connection.onmessage({ data: { v: 2, type: 'request', id, action, payload } });
  const result = await response;
  responseWaiters.delete(id);
  assert.equal(result.v, 2);
  return result;
}
async function bridgeRpc(action, payload = {}) {
  const result = await bridgeResponse(action, payload);
  assert.equal(result.ok, true, result.error);
  return result.result;
}
const hello = await bridgeRpc('hello');
assert.equal(hello.protocol, 2);
assert.equal(hello.scriptStorageProtocol, 1);
assert.ok((await bridgeRpc('list')).files.some(item => item.name === name));
assert.equal((await bridgeRpc('read', { name, offset: 0 })).content, '// original source');
assert.equal((await bridgeRpc('storageRead', { name, offset: 0 })).done, true);
const controlledFailure = await bridgeResponse('writeStart', { name, size: 1, overwrite: false });
assert.equal(controlledFailure.ok, false);
assert.equal(controlledFailure.error, '文件已存在，需要确认覆盖'); // v2 clients read this unchanged.
assert.equal(controlledFailure.errorOrigin, 'jslab');
assert.equal(controlledFailure.errorDisplay, controlledFailure.error);
const originalList = manager.list;
manager.list = async () => { throw bridgeErrors.controlledError('Failed to list scripts: 300'); };
const fileFailure = await bridgeResponse('list');
assert.equal(fileFailure.error, 'Failed to list scripts: 300'); // The legacy field is unchanged.
assert.equal(fileFailure.errorOrigin, 'jslab');
assert.equal(fileFailure.errorDisplay, '读取脚本列表失败，系统错误码：300');
assert.equal(bridgeErrors.bridgeErrorInfo(bridgeErrors.controlledError(
  '脚本已重命名，但迁移数据和配置失败：scriptData write failed: 300')).display,
  '脚本已重命名，但迁移数据和配置失败：写入脚本数据失败，系统错误码：300');
manager.list = async () => { throw new Error('out of memory'); };
const runtimeFailure = await bridgeResponse('list');
assert.equal(runtimeFailure.error, 'out of memory');
assert.equal(runtimeFailure.errorOrigin, undefined);
assert.equal(runtimeFailure.errorDisplay, undefined);
manager.list = originalList;
bridge.stop();
console.log('Storage safety: stable snapshot, stale-save rejection, partial transfer, disconnect, failed persistence, namespace isolation, legacy runtime and v2 bridge passed.');

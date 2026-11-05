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
const encodingSource = fs.readFileSync(path.join(vela, 'files/textEncoding.js'), 'utf8').replaceAll('export function ', 'function ');
const encoding = vm.runInNewContext(`(() => { ${encodingSource}; return { sliceUtf8Chunk, utf8ByteLength }; })()`);
const storage = new Map();
const manager = {
  isLocked: () => false,
  list: async () => [...storage].map(([name, content]) => ({ name, size: encoding.utf8ByteLength(content) })),
  read: async name => { assert.ok(storage.has(name)); return storage.get(name); },
  write: async (name, content) => { storage.set(name, content); return content; },
  rename: async (name, next) => { assert.ok(!storage.has(next)); storage.set(next, storage.get(name)); storage.delete(name); },
  remove: async name => storage.delete(name),
};
const source = fs.readFileSync(path.join(vela, 'bridge/scriptTransfer.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replaceAll('export function ', 'function ');
const handler = vm.runInNewContext(`(jsManager, sliceUtf8Chunk, utf8ByteLength) => {
  ${source}; return { handleScriptTransfer, clearScriptTransfers };
}`)(manager, encoding.sliceUtf8Chunk, encoding.utf8ByteLength);
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
const data = vm.runInNewContext(`file => { ${dataSource}; return {
  createScriptStorage, removeScriptStorage, readScriptStorageContent, replaceScriptStorageContent
}; }`)(file);
const locks = new Map();
manager.isLocked = name => locks.has(name);
manager.lock = name => { assert.ok(!locks.has(name)); const token = {}; locks.set(name, token); return token; };
manager.unlock = (name, token) => { assert.equal(locks.get(name), token); locks.delete(name); };
const storageSource = fs.readFileSync(path.join(vela, 'bridge/scriptStorageTransfer.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replaceAll('export function ', 'function ').replace('export const ', 'const ');
const storageHandler = vm.runInNewContext(`(jsManager, readScriptStorageContent, replaceScriptStorageContent, sliceUtf8Chunk, utf8ByteLength) => {
  ${storageSource}; return { handleScriptStorageTransfer, clearScriptStorageTransfers, SCRIPT_STORAGE_PROTOCOL };
}`)(manager, data.readScriptStorageContent, data.replaceScriptStorageContent, encoding.sliceUtf8Chunk, encoding.utf8ByteLength);
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
  SCRIPT_STORAGE_PROTOCOL, clearScriptStorageTransfers, handleScriptStorageTransfer, setTimeout, clearTimeout) => {
  ${bridgeSource}
}`)({ instance: () => connection }, {}, manager, {}, handler.clearScriptTransfers, handler.handleScriptTransfer,
  storageHandler.SCRIPT_STORAGE_PROTOCOL, storageHandler.clearScriptStorageTransfers, storageRpc, setTimeout, clearTimeout);
bridge.start();
let requestId = 0;
async function bridgeRpc(action, payload = {}) {
  const id = String(++requestId);
  const response = new Promise(resolve => responseWaiters.set(id, resolve));
  connection.onmessage({ data: { v: 2, type: 'request', id, action, payload } });
  const result = await response;
  responseWaiters.delete(id);
  assert.equal(result.v, 2);
  assert.equal(result.ok, true, result.error);
  return result.result;
}
const hello = await bridgeRpc('hello');
assert.equal(hello.protocol, 2);
assert.equal(hello.scriptStorageProtocol, 1);
assert.ok((await bridgeRpc('list')).files.some(item => item.name === name));
assert.equal((await bridgeRpc('read', { name, offset: 0 })).content, '// original source');
assert.equal((await bridgeRpc('storageRead', { name, offset: 0 })).done, true);
bridge.stop();
console.log('Storage safety: stable snapshot, stale-save rejection, partial transfer, disconnect, failed persistence, namespace isolation, legacy runtime and v2 bridge passed.');

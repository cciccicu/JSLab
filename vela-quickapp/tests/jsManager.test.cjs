const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function loadJsManager(fileMock) {
  const sourcePath = path.join(__dirname, '..', 'src', 'utils', 'files', 'jsManager.js');
  const source = fs.readFileSync(sourcePath, 'utf8')
    .replace("import file from '@system.file';", 'const file = globalThis.__jsManagerFileMock;')
    .replace("import { utf8ByteLength } from './textEncoding.js';", "const utf8ByteLength = value => Buffer.byteLength(value, 'utf8');")
    .replace("import { removeScriptStorage, renameScriptStorage } from './scriptData.js';", 'const { removeScriptStorage, renameScriptStorage } = globalThis.__jsManagerStorageMock;')
    .replace("import { sortFilesNewestFirst } from './fileMetadata.js';", `
      const sortFilesNewestFirst = files => files.slice().sort((left, right) =>
        Number(right.lastModifiedTime || 0) - Number(left.lastModifiedTime || 0));
    `);
  globalThis.__jsManagerFileMock = fileMock;
  globalThis.__jsManagerStorageMock = {
    removeScriptStorage: fileMock.removeStorage || (() => Promise.resolve()),
    renameScriptStorage: fileMock.renameStorage || (() => Promise.resolve())
  };
  const uniqueSource = source + '\n// test module ' + Date.now() + Math.random();
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(uniqueSource).toString('base64');
  return (await import(dataUrl)).default;
}

async function testConcurrentInitialization() {
  let accessCount = 0;
  let mkdirCount = 0;
  let listCount = 0;
  const fileMock = {
    access(options) {
      accessCount += 1;
      setTimeout(() => options.fail(null, 301), 0);
    },
    mkdir(options) {
      mkdirCount += 1;
      setTimeout(() => options.success(), 0);
    },
    list(options) {
      listCount += 1;
      setTimeout(() => options.success({
        fileList: [{ uri: 'internal://files/js/old.js', length: 12, lastModifiedTime: 10 }]
      }), 0);
    }
  };

  const manager = await loadJsManager(fileMock);
  const results = await Promise.all([manager.list(), manager.list()]);
  assert.strictEqual(accessCount, 1);
  assert.strictEqual(mkdirCount, 1);
  assert.strictEqual(listCount, 2);
  assert.strictEqual(results[0][0].name, 'old.js');
}

async function testMkdirRaceRecovery() {
  let accessCount = 0;
  const fileMock = {
    access(options) {
      accessCount += 1;
      setTimeout(() => {
        if (accessCount === 1) options.fail(null, 301);
        else options.success();
      }, 0);
    },
    mkdir(options) {
      setTimeout(() => options.fail(null, 300), 0);
    },
    list(options) {
      setTimeout(() => options.success({ fileList: [] }), 0);
    }
  };

  const manager = await loadJsManager(fileMock);
  assert.deepStrictEqual(await manager.list(), []);
  assert.strictEqual(accessCount, 2);
}

async function testInvalidListResponse() {
  const fileMock = {
    access(options) {
      setTimeout(() => options.success(), 0);
    },
    list(options) {
      setTimeout(() => options.success({}), 0);
    }
  };

  const manager = await loadJsManager(fileMock);
  await assert.rejects(manager.list(), /Invalid script directory response/);
}

async function run() {
  await testConcurrentInitialization();
  await testMkdirRaceRecovery();
  await testInvalidListResponse();
  await testChineseFileNames();
  console.log('jsManager tests passed');
}

async function testChineseFileNames() {
  const prefix = 'internal://files/js/';
  const stored = new Map();
  const changes = [];
  const removedStorage = [];
  const renamedStorage = [];
  const fileMock = {
    removeStorage(name) { removedStorage.push(name); return Promise.resolve(); },
    renameStorage(oldName, newName) { renamedStorage.push([oldName, newName]); return Promise.resolve(); },
    access({ uri, success, fail }) {
      if (uri === prefix || stored.has(uri)) success();
      else fail(null, 301);
    },
    writeText({ uri, text, success }) { stored.set(uri, text); success(); },
    readText({ uri, success, fail }) {
      if (stored.has(uri)) success({ text: stored.get(uri) });
      else fail(null, 301);
    },
    list({ success }) {
      success({ fileList: Array.from(stored.keys(), uri => ({ uri, length: 12, lastModifiedTime: 10 })) });
    },
    move({ srcUri, dstUri, success }) {
      stored.set(dstUri, stored.get(srcUri)); stored.delete(srcUri); success();
    },
    delete({ uri, success }) { stored.delete(uri); success(); }
  };
  const manager = await loadJsManager(fileMock);
  manager.subscribe(change => changes.push(change));
  const name = '中文 测试（第一版）.ui.js';
  const renamed = '我的工具（新版）.js';
  const source = 'console.log("你好")';
  await manager.write(name, source);
  assert(stored.has(prefix + name), 'Chinese file URIs must retain the original name');
  assert.strictEqual((await manager.list())[0].name, name);
  assert.strictEqual(await manager.read(name), source);
  const token = manager.lock(name);
  await assert.rejects(manager.write(name, source), /文件正在编辑中/);
  await manager.write(name, source, { token });
  manager.unlock(name, token);
  await manager.rename(name, renamed);
  assert.deepStrictEqual(renamedStorage, [[name, renamed]]);
  assert.strictEqual(await manager.read(renamed), source);
  await manager.remove(renamed);
  assert.deepStrictEqual(removedStorage, [renamed]);
  assert.deepStrictEqual(await manager.list(), []);
  assert(changes.some(change => change.previousName === name && change.name === renamed));

  const limitName = '中'.repeat(41) + 'ab.js'; // 128 UTF-8 bytes including extension.
  await manager.write(limitName, source);
  const longName = '中'.repeat(42) + '.js';
  await assert.rejects(manager.write(longName, source), /128 个 UTF-8 字节/);
  await assert.rejects(manager.rename(limitName, longName), /128 个 UTF-8 字节/);
  stored.set(prefix + longName, source);
  assert.strictEqual(await manager.read(longName), source, 'Existing long names must remain accessible');
  const legacyToken = manager.lock(longName);
  await manager.write(longName, 'updated', { token: legacyToken });
  assert.strictEqual(await manager.read(longName), 'updated', 'Existing long names must remain editable');
  manager.unlock(longName, legacyToken);
  await manager.remove(longName);
  assert.deepStrictEqual(removedStorage, [renamed, longName]);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

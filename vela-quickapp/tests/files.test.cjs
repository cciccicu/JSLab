const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test("jsManager", async () => {

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
    await testBlankCreationFallback();
  }

  async function testBlankCreationFallback() {
    for (const scenario of ['empty-supported', 'empty-rejected', 'all-rejected', 'ordinary-save', 'nonempty']) {
      const writes = [];
      const changes = [];
      const stored = new Map();
      const manager = await loadJsManager({
        access({ success }) { success(); },
        writeText({ uri, text, success, fail }) {
          writes.push({ uri, text });
          setTimeout(() => {
            if (scenario === 'all-rejected' || (text === '' && scenario !== 'empty-supported')) fail(null, 300);
            else { stored.set(uri, text); success(); }
          }, 0);
        }
      });
      manager.subscribe(change => changes.push(change));
      const content = scenario === 'nonempty' ? 'console.log(1)' : '';
      const result = manager.write('blank.js', content, { fallbackToSpace: scenario !== 'ordinary-save' });
      if (scenario === 'all-rejected' || scenario === 'ordinary-save') {
        await assert.rejects(result, /Failed to write script: 300/);
        assert.strictEqual(changes.length, 0);
        assert.strictEqual(stored.size, 0);
      } else {
        const expected = scenario === 'empty-rejected' ? ' ' : content;
        assert.strictEqual(await result, expected);
        assert.strictEqual(stored.get('internal://files/js/blank.js'), expected);
        assert.deepStrictEqual(changes, [{ action: 'write', name: 'blank.js' }]);
      }
      assert.deepStrictEqual(writes.map(write => write.text),
        scenario === 'empty-rejected' || scenario === 'all-rejected' ? ['', ' '] : [content]);
      assert(writes.every(write => write.uri === 'internal://files/js/blank.js'));
    }
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

  await run();
});

test("fileMetadata", async () => {

  async function loadFileMetadata() {
    const sourcePath = path.join(__dirname, '..', 'src', 'utils', 'files', 'fileMetadata.js');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const dataUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
    return import(dataUrl);
  }

  async function run() {
    const encodingSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'files', 'textEncoding.js'), 'utf8');
    const encoding = await import('data:text/javascript;base64,' + Buffer.from(encodingSource).toString('base64'));
    const metadata = { ...await loadFileMetadata(), ...encoding };
    const files = [
      { name: 'older.js', lastModifiedTime: 100 },
      { name: 'newer.js', lastModifiedTime: 300 },
      { name: 'middle.js', lastModifiedTime: 200 }
    ];
    const sorted = metadata.sortFilesNewestFirst(files);
    assert.deepStrictEqual(sorted.map(file => file.name), ['newer.js', 'middle.js', 'older.js']);
    assert.deepStrictEqual(files.map(file => file.name), ['older.js', 'newer.js', 'middle.js']);

    assert.strictEqual(metadata.formatFileSize(0), '0 B');
    assert.strictEqual(metadata.formatFileSize(1234), '1234 B');
    assert.strictEqual(metadata.formatFileSize('invalid'), '0 B');
    assert.strictEqual(metadata.utf8ByteLength('a中😀'), 8);

    const content = 'ab中😀cd';
    const chunks = [];
    let offset = 0;
    while (offset < metadata.utf8ByteLength(content)) {
      const chunk = metadata.sliceUtf8Chunk(content, offset, 4);
      chunks.push(chunk.content);
      assert(chunk.nextOffset > offset);
      assert.strictEqual(chunk.size, 11);
      offset = chunk.nextOffset;
      if (chunk.done) break;
    }
    assert.strictEqual(chunks.join(''), content);
    assert.strictEqual(offset, 11);
    assert.throws(() => metadata.sliceUtf8Chunk(content, 3, 4), /UTF-8/);
    assert.throws(() => metadata.sliceUtf8Chunk('中', 0, 1), /不足/);
    assert.throws(() => metadata.sliceUtf8Chunk('a', 0, 0.5), /至少/);
    assert.throws(() => metadata.sliceUtf8Chunk('a', -1, 4), /非负整数/);
    assert.equal(metadata.utf8ByteLength(0), 1);
    assert.equal(encoding.decodeBase64('AAE='), '\x00\x01');
    for (const invalid of ['AQ==AAAA', 'A===', 'AB==', 'AAB=', '!!!!']) {
      assert.throws(() => encoding.decodeBase64(invalid), /编码无效/);
    }

    const boundaryContent = 'a'.repeat(4095) + '中😀';
    const firstChunk = metadata.sliceUtf8Chunk(boundaryContent, 0, 4096);
    assert.strictEqual(firstChunk.content, 'a'.repeat(4095));
    assert.strictEqual(firstChunk.nextOffset, 4095);
    assert.strictEqual(firstChunk.done, false);
    const secondChunk = metadata.sliceUtf8Chunk(boundaryContent, firstChunk.nextOffset, 4096);
    assert.strictEqual(secondChunk.content, '中😀');
    assert.strictEqual(secondChunk.nextOffset, 4102);
    assert.strictEqual(secondChunk.done, true);

    const timestamp = new Date(2026, 6, 26, 9, 5).getTime();
    assert.strictEqual(metadata.formatModifiedDate(timestamp), '2026-07-26 09:05');
    assert.strictEqual(metadata.formatModifiedDate(0), '未知');
  }

  await run();
});

test("transferIntegrity", async () => {

  async function loadModule() {
    const sourcePath = path.join(__dirname, '..', 'src', 'utils', 'files', 'transferIntegrity.js');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const dataUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
    return import(dataUrl);
  }

  async function run() {
    const integrity = await loadModule();
    assert.strictEqual(integrity.adler32(''), '00000001');
    assert.strictEqual(integrity.adler32('font'), '043901b8');
    assert.strictEqual(integrity.adler32Utf8('中文🙂'), '289406f7');

    const first = integrity.updateAdler32('fo', 1, 0);
    const second = integrity.updateAdler32('nt', first.a, first.b);
    assert.strictEqual(integrity.formatAdler32(second.a, second.b), integrity.adler32('font'));

    const binary = String.fromCharCode(0, 1, 127, 128, 255);
    assert.strictEqual(integrity.adler32(binary), '03850200');
  }

  await run();
});

describe("scriptData", () => {

  const source = fs.readFileSync(path.join(__dirname, '../src/utils/files/scriptData.js'), 'utf8')
    .replace(/^import file[^\n]*\n/, '').replace(/export function /g, 'function ')
    .replace('export default { createScriptStorage, removeScriptStorage, renameScriptStorage };', 'return { createScriptStorage, removeScriptStorage, renameScriptStorage };');

  function database() {
    let contents = '{}'; let inFlight = 0;
    const stats = { writes: 0, maxInFlight: 0, failNext: false };
    const file = {
      readText({ success }) { setImmediate(() => success({ text: contents })); },
      writeText({ text, success, fail }) {
        stats.writes++; inFlight++; stats.maxInFlight = Math.max(stats.maxInFlight, inFlight);
        setImmediate(() => {
          inFlight--;
          if (stats.failNext) { stats.failNext = false; fail(null, 999); }
          else { contents = text; success(); }
        });
      }
    };
    return { stats, contents: () => contents, load: () => {
      const api = new Function('file', source)(file);
      api.createScriptStorage.remove = api.removeScriptStorage;
      api.createScriptStorage.rename = api.renameScriptStorage;
      return api.createScriptStorage;
    } };
  }

  test('one script can save multiple keys and config concurrently without losing earlier writes', async () => {
    const db = database(); const storage = db.load()('one.ui.js');
    await Promise.all([storage.data.set('a', 1), storage.data.set('b', 2), storage.config.set('unit', 'metric')]);
    assert.deepEqual(await storage.data.all(), { a: 1, b: 2 });
    assert.deepEqual(await storage.config.all(), { unit: 'metric' });
    assert.equal(db.stats.writes, 3); assert.equal(db.stats.maxInFlight, 1);
    assert.deepEqual(await db.load()('one.ui.js').data.all(), { a: 1, b: 2 });
  });

  test('set, delete and clear apply in invocation order', async () => {
    const storage = database().load()('one.ui.js');
    await Promise.all([
      storage.data.set('a', 1), storage.data.delete('a'), storage.data.set('b', 2),
      storage.data.clear(), storage.data.set('last', 3)
    ]);
    assert.deepEqual(await storage.data.all(), { last: 3 });
  });

  test('failed writes leave committed data intact and do not block subsequent saves', async () => {
    const db = database(); const create = db.load(); const storage = create('one.ui.js');
    await storage.data.set('keep', 1);
    db.stats.failNext = true;
    const results = await Promise.allSettled([storage.data.set('failed', 2), storage.data.set('next', 3)]);
    assert.equal(results[0].status, 'rejected'); assert.equal(results[1].status, 'fulfilled');
    assert.deepEqual(await storage.data.all(), { keep: 1, next: 3 });
    const other = create('two.ui.js');
    await Promise.all([other.data.set('other', 4), storage.config.set('unit', 'metric')]);
    const reloaded = db.load();
    assert.deepEqual(await reloaded('one.ui.js').data.all(), { keep: 1, next: 3 });
    assert.deepEqual(await reloaded('two.ui.js').data.all(), { other: 4 });
  });

  test('dictionary keys are own data through JSON cloning, file reload and deletion', async () => {
    const db = database(); const storage = db.load()('keys.ui.js');
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      assert.equal(await storage.data.get(name, 'missing'), 'missing');
      await storage.data.set(name, { name });
      await storage.config.set(name, name);
    }
    // A further write clones the entire stored root before writing it again.
    await storage.data.set('normal', true);
    const reloaded = db.load()('keys.ui.js');
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      assert.deepEqual(await reloaded.data.get(name), { name });
      assert.equal(await reloaded.config.get(name), name);
      await reloaded.data.delete(name);
      assert.equal(await reloaded.data.get(name, 'missing'), 'missing');
    }
    assert.deepEqual(await reloaded.data.all(), { normal: true });
  });

  test('queued namespace-size validation rejects only the overflowing mutation', async () => {
    const db = database(); const storage = db.load()('limits.ui.js');
    const value = 'x'.repeat(15 * 1024);
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => storage.data.set('key' + i, value)));
    assert.deepEqual(results.map(result => result.status), ['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled', 'rejected']);
    assert.equal(db.stats.writes, 4);
    await storage.data.delete('key0'); await storage.data.set('small', 1);
    assert.equal(await storage.data.get('small'), 1);
    assert.equal(await storage.data.get('key4', null), null);
  });

  test('deleting a script removes its data and config namespace without affecting another script', async () => {
    const db = database(); const create = db.load();
    await create('one.js').data.set('score', 2048);
    await create('one.js').config.set('theme', 'dark');
    await create('two.js').data.set('keep', true);
    await create.remove('one.js');
    assert.deepEqual(await create('one.js').data.all(), {});
    assert.deepEqual(await create('one.js').config.all(), {});
    assert.deepEqual(await create('two.js').data.all(), { keep: true });
    assert.equal(Object.keys(JSON.parse(db.contents())).length, 1);
  });

  test('renaming a script carries its data and config to the new file name', async () => {
    const db = database(); const create = db.load();
    await create('old.js').data.set('score', 2048);
    await create('old.js').config.set('theme', 'dark');
    await create.rename('old.js', 'new.js');
    assert.deepEqual(await create('old.js').data.all(), {});
    assert.deepEqual(await create('new.js').data.all(), { score: 2048 });
    assert.deepEqual(await create('new.js').config.all(), { theme: 'dark' });
    await create.remove('new.js');
    assert.deepEqual(JSON.parse(db.contents()), {});
  });
});

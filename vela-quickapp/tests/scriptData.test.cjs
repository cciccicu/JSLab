const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

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

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, root } = require('./loadBenchmark.cjs');

test('field publication preserves observed identity and immutable engine snapshots', async () => {
  const { publishNodes } = await load();
  const page = { uiNodes: [] };
  const first = [{ id: 'a', kind: 'text', text: '0', x: 6 }];
  publishNodes(page, first, { fields: true });
  const array = page.uiNodes; const observed = array[0];
  assert.notEqual(observed, first[0]);
  const next = [{ ...first[0], text: '1' }];
  const count = publishNodes(page, next, { fields: true }, first);
  assert.equal(page.uiNodes, array); assert.equal(page.uiNodes[0], observed);
  assert.equal(observed.text, '1'); assert.equal(first[0].text, '0');
  assert.deepEqual(count, { nodes: 1, fields: 1, splices: 0, arrays: 0 });
  assert.deepEqual(publishNodes(page, next, { fields: true }, next), { nodes: 0, fields: 0, splices: 0, arrays: 0 });
  publishNodes(page, [{ id: 'b', kind: 'button', text: '2' }], { fields: true }, next);
  assert.notEqual(page.uiNodes, array);
});

test('controlled cases yield identical 24-node frames, and only prescribed cells change', async () => {
  const { CASES, createCase } = await load();
  let reference;
  for (const id of ['engine-splice', 'engine-fields', 'raw-splice', 'raw-fields', 'raw-replace', 'lean-fields', 'square-fields']) {
    const page = { uiNodes: [] };
    const c = createCase(page, CASES.find(mode => mode.id === id), () => 0);
    const before = page.uiNodes.map(node => ({ ...node }));
    const metric = { syncEnd: 0 }; c.step(metric); await Promise.resolve();
    assert.equal(page.uiNodes.length, 24);
    if (!reference) reference = page.uiNodes.map(node => ({ ...node }));
    else assert.deepEqual(page.uiNodes, reference, id);
    assert.equal(metric.nodes, id === 'raw-replace' ? 24 : 16, id);
    for (let i = 0; i < 24; i++) for (const key of ['x', 'y', 'width', 'height']) assert.equal(page.uiNodes[i][key], before[i][key], id);
    c.dispose();
  }
});

test('real 2048 A/B uses the same deterministic board and score for 40 moves', async () => {
  const { CASES, createCase } = await load();
  const a = { uiNodes: [] }; const b = { uiNodes: [] };
  const ca = createCase(a, CASES.find(mode => mode.id === 'game-splice'), () => 0);
  const cb = createCase(b, CASES.find(mode => mode.id === 'game-fields'), () => 0);
  for (let i = 0; i < 40; i++) {
    ca.step({ syncEnd: 0 }); cb.step({ syncEnd: 0 }); await Promise.resolve();
    assert.deepEqual(a.uiNodes, b.uiNodes, 'move ' + i);
    ca.finishSample(); cb.finishSample();
  }
  ca.dispose(); cb.dispose();
});

test('unchanged refresh does not publish and one-cell case changes only one cell', async () => {
  const { CASES, createCase } = await load();
  for (const id of ['unchanged', 'engine-one']) {
    const page = { uiNodes: [] }; const c = createCase(page, CASES.find(mode => mode.id === id), () => 0);
    const metric = { syncEnd: 0 }; c.step(metric); await Promise.resolve();
    assert.equal(metric.nodes, id === 'unchanged' ? 0 : 1);
    c.dispose();
  }
});

test('summary retains outliers and missing phases are not reported as zero', async () => {
  const { statistics, summarize } = await load();
  assert.deepEqual(statistics([1, 2, 3, 100]), { n: 4, mean: 26.5, p50: 2, p95: 100, max: 100 });
  const summary = summarize([{ syncMs: 0, eventLoopMs: 1 }, { syncMs: 3, eventLoopMs: 1000 }]);
  assert.equal(summary.eventLoopMs.max, 1000); assert.equal(summary.viewMs, null);
});

async function pageHarness() {
  const benchmark = await load();
  const source = fs.readFileSync(path.join(root, 'src/pages/index/index.ux'), 'utf8');
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?\n/gm, '').replace('export default', 'const definition =') + '\nreturn { page: definition, states };';
  let clock = 0; let nextId = 0; let pumpPending = false;
  const timers = new Map(); const logs = []; const screen = [];
  function pump() {
    pumpPending = false;
    if (!timers.size) return;
    const [id, timer] = Array.from(timers.entries()).sort((a, b) => a[1].at - b[1].at)[0];
    timers.delete(id); clock = Math.max(clock, timer.at); timer.callback();
    if (timers.size && !pumpPending) { pumpPending = true; setImmediate(pump); }
  }
  function setTimer(callback, ms) {
    const id = ++nextId; timers.set(id, { callback, at: clock + ms });
    if (!pumpPending) { pumpPending = true; setImmediate(pump); }
    return id;
  }
  const { page, states } = new Function('device', 'brightness', 'CASES', 'createCase', 'statistics', 'summarize', 'buildReportPages', 'Date', 'setTimeout', 'clearTimeout', 'console', script)(
    { getInfo(options) { options.success({ model: 'test-device' }); } },
    { setKeepScreenOn(options) { screen.push(options.keepScreenOn); if (options.success) options.success(); } },
    benchmark.STYLE_CASES, benchmark.createCase, benchmark.statistics, benchmark.summarize, benchmark.buildReportPages,
    { now: () => clock }, setTimer, id => timers.delete(id), { log(value) { logs.push(value); } }
  );
  Object.assign(page, page.private);
  page.onInit();
  return { page, states, timers, logs, screen };
}

test('full run works without nextTick and presents every metric on five photo pages', async () => {
  const { page, states, timers, logs, screen } = await pageHarness();
  assert.equal(page.$nextTick, undefined);
  await page.start();
  assert.equal(page.running, false); assert.equal(page.resultVisible, true);
  const state = states.get(page); const report = state.report;
  assert.equal(state.pages.length, 5);
  assert.deepEqual(report.failures, []); assert.equal(report.cases.length, 16);
  assert.equal(report.device.model, 'test-device');
  for (const entry of report.cases) {
    assert.equal(entry.samples.length, 8);
    for (const sample of entry.samples) {
      assert.ok(Number.isFinite(sample.jsTurnMs));
      assert.ok(Number.isFinite(sample.eventLoopMs));
      assert.equal(sample.waitMs, sample.eventLoopMs - sample.jsTurnMs);
      assert.equal(sample.tickMs, undefined);
    }
  }
  assert.deepEqual(report.cases.slice(8).map(entry => entry.id), report.cases.slice(0, 8).map(entry => entry.id).reverse());
  assert.equal(timers.size, 0); assert.equal(logs.length, 9);
  assert.deepEqual(screen, [true, false]);
  const ids = [];
  assert.match(page.resultHint, /1 \/ 5/);
  for (let i = 1; i < 5; i++) {
    page.nextResult();
    assert.equal(page.resultCards.length, 2);
    page.resultCards.forEach(card => {
      ids.push(card.id); assert.equal(card.text.split('\n').length, 4);
      for (const metric of ['J', 'E', 'V', 'C', 'P', 'Y', 'W']) assert.match(card.text, new RegExp('\\b' + metric + ' '));
    });
  }
  assert.deepEqual(ids, report.cases.slice(0, 8).map(entry => entry.id));
  page.nextResult(); assert.equal(page.resultIndex, 0);
  page.previousResult(); assert.equal(page.resultIndex, 4);
  assert.equal(page.onBackPress(), true); assert.equal(page.resultVisible, false);
  page.showResults(); assert.equal(page.resultIndex, 0);
  page.onDestroy();
});

test('return cancels pending timers, and native nextTick is never required or called', async () => {
  const first = await pageHarness();
  const pending = first.page.start(); assert.equal(first.page.onBackPress(), true); await pending;
  assert.equal(first.page.running, false); assert.equal(first.timers.size, 0); assert.equal(first.page.hasResults, false);
  assert.deepEqual(first.screen, [true, false]);
  first.page.onDestroy();
  const second = await pageHarness(); second.page.$nextTick = () => { assert.fail('must not use nextTick'); };
  await second.page.start();
  assert.deepEqual(second.states.get(second.page).report.failures, []);
  assert.equal(second.page.resultVisible, true);
  assert.equal(second.timers.size, 0); second.page.onDestroy();
});

test('manual A/B works without nextTick, returns to menu and exposes photo results', async () => {
  const { page, states, timers, screen } = await pageHarness();
  page.startManual();
  for (let i = 0; i < 4; i++) { await page.manualTap(); page.nextManual(); }
  page.endManual();
  const report = states.get(page).report;
  assert.equal(report.suite, 'manual'); assert.equal(report.cases.length, 4);
  assert.deepEqual(report.failures, []); assert.equal(page.resultVisible, true);
  assert.equal(timers.size, 0); assert.deepEqual(screen, [true, false]);
  page.onDestroy();
});

test('production optimization preserves painted fields for fixed grids, unchanged views and real games', async () => {
  const { RETEST_CASES, createCase } = await load();
  const painted = nodes => nodes.map(node => { const copy = { ...node }; delete copy.autoLines; return copy; });
  for (const ids of [['fields-unchanged', 'optimized-unchanged'], ['engine-fields', 'optimized-grid'], ['game-fields', 'optimized-game']]) {
    const pages = [{ uiNodes: [] }, { uiNodes: [] }];
    const cases = ids.map((id, i) => createCase(pages[i], RETEST_CASES.find(mode => mode.id === id), () => 0));
    const optimizedArray = pages[1].uiNodes; const optimizedNodes = optimizedArray.slice();
    for (let i = 0; i < 40; i++) {
      cases.forEach(c => c.step({ syncEnd: 0 })); await Promise.resolve();
      cases.forEach(c => c.finishSample());
      assert.deepEqual(painted(pages[0].uiNodes), painted(pages[1].uiNodes), ids[0] + ' frame ' + i);
      assert.equal(pages[1].uiNodes, optimizedArray);
      pages[1].uiNodes.forEach((node, index) => assert.equal(node, optimizedNodes[index]));
    }
    cases.forEach(c => c.dispose());
  }
});

test('asynchronous publication failure is reported instead of producing a successful sample', async () => {
  const { CASES, createCase } = await load();
  const page = { uiNodes: [] }; const c = createCase(page, CASES.find(mode => mode.id === 'engine-splice'), () => 0);
  page.uiNodes.splice = () => { throw new Error('native publication failed'); };
  c.step({ syncEnd: 0 }); await Promise.resolve();
  assert.throws(() => c.finishSample(), /native publication failed/);
  c.dispose();
});

test('fixed bindings match list frames without touching the page array and preserve every slot identity', async () => {
  const { FOCUS_CASES, createCase } = await load();
  for (const ids of [['optimized-grid', 'slots-grid'], ['optimized-game', 'slots-game']]) {
    const list = { uiNodes: [] }; const fixed = {};
    Object.defineProperty(fixed, 'uiNodes', {
      get() { throw new Error('fixed bindings must not read the observed array'); },
      set() { throw new Error('fixed bindings must not write the observed array'); }
    });
    const a = createCase(list, FOCUS_CASES.find(mode => mode.id === ids[0]), () => 0);
    const b = createCase(fixed, FOCUS_CASES.find(mode => mode.id === ids[1]), () => 0);
    const slots = Array.from({ length: 24 }, (_, i) => fixed['slot' + i]);
    assert.equal(fixed.fixedReady, true);
    for (let frame = 0; frame < 40; frame++) {
      a.step({ syncEnd: 0 }); b.step({ syncEnd: 0 }); await Promise.resolve();
      a.finishSample(); b.finishSample();
      assert.deepEqual(slots, list.uiNodes, ids[0] + ' frame ' + frame);
      slots.forEach((node, i) => assert.equal(fixed['slot' + i], node));
    }
    a.dispose(); b.dispose(); assert.equal(fixed.fixedReady, false);
  }
});

test('field isolation varies exactly the requested fields and number of cells', async () => {
  const { FOCUS_CASES, createCase } = await load();
  for (const [id, keys, count] of [
    ['optimized-one', ['background', 'text'], 1],
    ['optimized-text', ['text'], 16],
    ['optimized-background', ['background'], 16]
  ]) {
    const page = { uiNodes: [] };
    const c = createCase(page, FOCUS_CASES.find(mode => mode.id === id), () => 0);
    for (let frame = 0; frame < 4; frame++) {
      const before = page.uiNodes.map(node => ({ ...node }));
      c.step({ syncEnd: 0 }); await Promise.resolve(); c.finishSample();
      let changed = 0;
      page.uiNodes.forEach((node, i) => {
        const fields = Object.keys(node).filter(key => node[key] !== before[i][key]).sort();
        if (!fields.length) return;
        changed++; assert.ok(node.id.startsWith('board/cell/')); assert.deepEqual(fields, keys);
      });
      assert.equal(changed, count, id);
    }
    c.dispose();
  }
});

test('fixed template retains identical native branches and styles for all 24 slots', () => {
  const source = fs.readFileSync(path.join(root, 'src/pages/index/index.ux'), 'utf8').replace(/\r\n/g, '\n');
  const generic = source.match(/<div for="\{\{node in uiNodes\}\}" tid="id" class="node-wrap"[\s\S]*?\n {8}<\/div>/)[0]
    .replace(' for="{{node in uiNodes}}" tid="id"', '');
  const fixed = source.match(/<!-- FIXED_NODES_START -->([\s\S]*?)<!-- FIXED_NODES_END -->/)[1];
  const nodes = [...fixed.matchAll(/<div class="node-wrap"[\s\S]*?\n {8}<\/div>/g)];
  assert.equal(nodes.length, 24);
  nodes.forEach((node, i) => {
    assert.match(node[0], new RegExp('slot' + i + '\\.'));
    assert.equal(node[0].replace(/\bslot\d+\./g, 'node.'), generic);
  });
});

test('style comparison preserves observed frames and game sequence in every pair', async () => {
  const { STYLE_CASES, createCase } = await load();
  for (let i = 0; i < STYLE_CASES.length; i += 2) {
    const pages = [{ uiNodes: [] }, { uiNodes: [] }];
    const cases = pages.map((page, index) => createCase(page, STYLE_CASES[i + index], () => 0));
    const observed = pages.map(page => page.uiNodes.slice());
    for (let frame = 0; frame < 40; frame++) {
      cases.forEach(c => c.step({ syncEnd: 0 })); await Promise.resolve(); cases.forEach(c => c.finishSample());
      assert.deepEqual(pages[0].uiNodes, pages[1].uiNodes, STYLE_CASES[i].id + ' frame ' + frame);
      pages.forEach((page, index) => page.uiNodes.forEach((node, j) => assert.equal(node, observed[index][j])));
    }
    cases.forEach(c => c.dispose());
  }
});

test('object-style template preserves native structure and uses the production style expressions', async () => {
  const source = fs.readFileSync(path.join(root, 'src/pages/index/index.ux'), 'utf8').replace(/\r\n/g, '\n');
  const generic = source.match(/<div for="\{\{node in uiNodes\}\}" tid="id" class="node-wrap"[\s\S]*?\n {8}<\/div>/)[0];
  const object = source.match(/<!-- OBJECT_NODES_START -->([\s\S]*?)<!-- OBJECT_NODES_END -->/)[1].trim();
  const withoutStyle = value => value.replace(/style="[^"]*"/g, 'style="CHECKED_SEPARATELY"');
  assert.equal(withoutStyle(object), withoutStyle(generic));
  const objectStyles = [...object.matchAll(/style="([^"]*)"/g)].map(match => match[1]);
  const originalStyles = [...generic.matchAll(/style="([^"]*)"/g)].map(match => match[1]);
  const { compileStyle, translateStyle } = require('./loadStyles.cjs');
  const node = { x: 6, y: 12, width: 120.5, height: 50, background: '#abcdef', radius: 12,
    color: '#ffffff', size: 24, lineHeight: 32, bold: 'bold', align: 'center', lines: 1,
    copyWidth: 70, detailColor: '#aaaaaa', accent: '#ff8800', trackColor: '#333333', thumbColor: '#ffffff', qrSize: 144 };
  for (let i = 0; i < originalStyles.length; i++) {
    const a = await compileStyle(originalStyles[i]); const b = await compileStyle(objectStyles[i]);
    assert.deepEqual(a({}, node), b({}, node, value => {
      assert.equal(typeof value, 'object'); return translateStyle(value);
    }));
  }
  const production = path.resolve(root, '../../src/pages/workspace/run/run.ux');
  if (fs.existsSync(production)) {
    const native = fs.readFileSync(production, 'utf8').replace(/\r\n/g, '\n')
      .match(/<div for="\{\{node in uiNodes\}\}" tid="id" class="node-wrap"[\s\S]*?\n {8}<\/div>/)[0];
    assert.deepEqual(objectStyles, [...native.matchAll(/style="([^"]*)"/g)].map(match => match[1]));
  }
});

test('optimized sources are byte-identical to production and original baseline hashes stay intact', () => {
  const crypto = require('node:crypto');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'source-snapshot.json'), 'utf8'));
  for (const [name, info] of Object.entries(manifest.files)) {
    const bytes = fs.readFileSync(path.join(root, 'src/utils', name));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), info.sha256);
  }
  for (const name of ['uiLayout.js', 'uiRuntime.js', 'uiPublisher.js']) {
    const snapshot = fs.readFileSync(path.join(root, 'src/utils/optimized', name));
    const source = path.resolve(root, '../../src/utils/runtime', name);
    if (fs.existsSync(source)) assert.ok(snapshot.equals(fs.readFileSync(source)), name);
  }
});

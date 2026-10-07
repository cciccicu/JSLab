const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadUi, root } = require('./helpers/loadUi.cjs');

async function baselineLayout() {
  const source = fs.readFileSync(path.join(root, 'diagnostics/ui-performance-app/src/utils/uiLayout.js'), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}

async function v5Layout() {
  const source = fs.readFileSync(path.join(root, 'tests/fixtures/uiLayout-v5.js'), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}

test('publisher isolates immutable snapshots, skips reactive reads and retains nodes across topology changes', async () => {
  const { createUiPublisher } = await loadUi();
  const publisher = createUiPublisher();
  const first = Object.freeze([
    Object.freeze({ id: 'a', kind: 'text', text: '0', x: 6, autoLines: 1 }),
    Object.freeze({ id: 'qr', kind: 'qrcode', value: 'hello', x: 6 })
  ]);
  let observed = publisher.update(first, []);
  const label = observed[0]; const qr = observed[1]; const initialArray = observed;
  assert.notEqual(label, first[0]); assert.equal(Object.hasOwn(label, 'autoLines'), false);
  const writes = []; const values = { ...label };
  for (const key of Object.keys(label)) Object.defineProperty(label, key, {
    enumerable: true, get() { throw new Error('must compare plain snapshots, not observed ' + key); },
    set(value) { values[key] = value; writes.push(key); }
  });
  const second = [Object.freeze({ id: 'a', kind: 'text', text: '1', x: 6 }), first[1]];
  observed = publisher.update(second, observed);
  assert.equal(observed, initialArray); assert.deepEqual(writes, ['text']); assert.equal(values.text, '1');
  assert.equal(first[0].text, '0');
  const third = [second[1], second[0], { id: 'new', kind: 'text', text: 'more', x: 6 }];
  observed = publisher.update(third, observed);
  assert.equal(observed[0], qr); assert.equal(observed[1], label); assert.notEqual(observed, initialArray);
  assert.deepEqual(writes, ['text']);
  observed = publisher.update([{ id: 'a', kind: 'button', text: 'button', x: 6 }], observed);
  assert.notEqual(observed[0], label);
  assert.deepEqual(publisher.update([], observed), []);
});

test('optimized grid matches the original compiler across geometry, styles, topology and warm-cache changes', async () => {
  const { compileUi } = await loadUi(); const legacy = await baselineLayout();
  let current = null; let previous = null;
  const tones = ['primary', 'success', 'warning', 'danger', 'neutral'];
  const colors = ['#123', '#123456', 'rgb(1, 2, 3)', 'rgba(2,3,4,0.5)', 'invalid', undefined];
  for (let i = 0; i < 120; i++) {
    const count = i % 21;
    const items = Array.from({ length: count }, (_, j) => ({
      id: 'ignored-' + j, text: (i + j) % 4 ? String(i * j) : '长文本abcdefghijk',
      tone: tones[(i + j) % tones.length], background: colors[(i + j) % colors.length],
      color: colors[(i * 2 + j) % colors.length], size: [undefined, 8, 21, 29, 44][(i + j) % 5],
      lineHeight: [undefined, 8, 40, 80][(i + j) % 4],
      // Grid overrides these generic text options.
      kind: 'button', lines: 5, radius: 50, bold: false, align: 'left', height: 2
    }));
    const grid = { kind: 'grid', id: 'g', items, columns: 4, cellHeight: [44, 50, 72][i % 3], gap: i % 9 };
    const view = { kind: 'column', id: 'root', width: [324, 280, 200][i % 3], padding: i % 7, children: [
      { kind: 'text', id: 'title', text: i % 3 ? 'title' : '长标题长标题长标题长标题长标题', size: 27 },
      grid, { kind: 'button', id: 'action', text: 'next', onPress() {} }
    ] };
    const top = i % 2 ? 12 : 102;
    current = compileUi(view, top, current && current.nodes, current && current.cache);
    previous = legacy.compileUi(view, top, previous && previous.nodes, previous && previous.cache);
    assert.deepEqual(current.nodes, previous.nodes, 'frame ' + i);
    assert.equal(current.height, previous.height); assert.equal(current.count, previous.count);
    const repeated = compileUi(view, top, current.nodes, current.cache);
    repeated.nodes.forEach((node, index) => assert.equal(node, current.nodes[index]));
    current = repeated;
  }
});

test('grid cache invalidates individual inputs and mutable coercible values; deleted cells do not remain cached', async () => {
  const { compileUi } = await loadUi(); const legacy = await baselineLayout();
  const cell = { text: '2', size: 25, tone: 'primary' };
  const view = { kind: 'grid', id: 'g', items: [cell, { text: 'unchanged' }] };
  let current = compileUi(view, 12); let previous = legacy.compileUi(view, 12);
  const actions = [
    () => { cell.text = '4'; }, () => { cell.tone = 'warning'; }, () => { cell.color = '#abc'; },
    () => { cell.size = 18; }, () => { cell.lineHeight = 47; }, () => { view.cellHeight = 65; },
    () => { view.columns = 2; }, () => { view.width = 240; }, () => { view.items.reverse(); },
    () => { cell.background = '#333'; }, () => { cell.text = { toString: () => '8' }; }
  ];
  for (const change of actions) {
    change();
    current = compileUi(view, 12, current.nodes, current.cache);
    previous = legacy.compileUi(view, 12, previous.nodes, previous.cache);
    assert.deepEqual(current.nodes, previous.nodes);
  }
  cell.text.toString = () => '16';
  current = compileUi(view, 12, current.nodes, current.cache);
  assert.equal(current.nodes[1].text, '16');
  view.items = [];
  current = compileUi(view, 12, current.nodes, current.cache);
  assert.equal(Object.keys(current.cache).length, 0);
});

test('failed compilation and header geometry changes never mutate previous cache entries', async () => {
  const { compileUi } = await loadUi();
  const view = [{ kind: 'text', id: 'title', text: 'hello' }, { kind: 'grid', id: 'g', items: [{ text: '2' }] }];
  const first = compileUi(view, 12);
  first.nodes.forEach(Object.freeze); Object.freeze(first.nodes);
  Object.values(first.cache).forEach(entry => { Object.freeze(entry.input); Object.freeze(entry); });
  Object.freeze(first.cache);
  assert.throws(() => compileUi(view.concat({ kind: 'text', id: 'title', text: 'duplicate' }), 102, first.nodes, first.cache), /重复/);
  const shifted = compileUi(view, 102, first.nodes, first.cache);
  assert.equal(shifted.nodes[0].y, first.nodes[0].y + 90);
  const original = compileUi(view, 12, first.nodes, first.cache);
  original.nodes.forEach((node, i) => assert.equal(node, first.nodes[i]));
});

test('grid fast path still enforces painted budgets, duplicate generated IDs and node-kind transitions', async () => {
  const { compileUi } = await loadUi();
  assert.throws(() => compileUi(Array.from({ length: 5 }, (_, i) => ({ kind: 'grid', id: 'g' + i, items: Array(36).fill('2') })), 12), /160/);
  assert.throws(() => compileUi([{ kind: 'grid', id: 'g', items: ['2'] }, { kind: 'text', id: 'g/cell/0', text: 'collision' }], 12), /重复/);
  const first = compileUi({ kind: 'grid', id: 'g', items: ['2'] }, 12);
  const second = compileUi({ kind: 'text', id: 'g/cell/0', text: 'generic', size: 18 }, 12, first.nodes, first.cache);
  assert.equal(second.nodes[0].align, 'left'); assert.equal(second.nodes[0].radius, 0);
  const third = compileUi({ kind: 'grid', id: 'g', items: ['4'] }, 12, second.nodes, second.cache);
  assert.equal(third.nodes[0].align, 'center'); assert.equal(third.nodes[0].radius, 12);
});

test('final compiler matches v5 through mixed controls, topology changes and frozen prior snapshots', async () => {
  const final = await loadUi(); const v5 = await v5Layout();
  let current; let previous;
  for (let frame = 0; frame < 90; frame++) {
    const handler = () => frame;
    const controls = [
      { kind: 'heading', id: 'title', text: '标题' + frame, lines: frame % 2 ? 1 : undefined },
      { kind: 'text', id: 'copy', text: '正文'.repeat(1 + frame % 12), width: 200 + frame % 10 },
      { kind: 'button', id: 'button', text: 'OK', onPress: handler, background: frame % 2 ? '#123' : '#456' },
      { kind: 'switch', id: 'switch', text: '开关', checked: !!(frame % 2), detail: frame % 3 ? '' : '说明', onChange: handler },
      { kind: 'slider', id: 'slider', text: '滑块', value: frame, onChange: handler },
      { kind: 'progress', id: 'progress', text: '进度', percent: frame },
      { kind: 'qrcode', id: 'qr', value: 'value-' + frame, size: 120 + frame % 30 },
      { kind: 'divider', id: 'divider', color: frame % 2 ? '#aaa' : '#bbb' },
      { kind: 'grid', id: 'grid', items: Array.from({ length: frame % 17 }, (_, i) => ({ text: String(i + frame), background: '#123' })) }
    ];
    if (frame % 3 === 0) controls.reverse();
    if (frame % 5 === 0) controls.splice(2, 2);
    const view = { kind: frame % 2 ? 'column' : 'stack', id: 'root', background: frame % 3 ? '#222' : 'transparent',
      padding: frame % 7, children: controls };
    const top = frame % 2 ? 12 : 102;
    // Occasionally compile without the optional cache to exercise ID fallback.
    current = final.compileUi(view, top, current && current.nodes, frame % 7 && current ? current.cache : null);
    previous = v5.compileUi(view, top, previous && previous.nodes, frame % 7 && previous ? previous.cache : null);
    assert.deepEqual(current.nodes, previous.nodes, 'frame ' + frame);
    assert.deepEqual(current.handlers, previous.handlers);
    assert.equal(current.height, previous.height); assert.equal(current.end, previous.end);
    current.nodes.forEach(Object.freeze); Object.freeze(current.nodes);
    Object.values(current.cache).forEach(entry => { Object.freeze(entry.input); Object.freeze(entry); });
    Object.freeze(current.cache);
    const repeat = final.compileUi(view, top, current.nodes, current.cache);
    repeat.nodes.forEach((node, index) => assert.equal(node, current.nodes[index]));
  }
});

test('final compiler preserves both original and classic 2048 sequences and observed node identities', async () => {
  const { load } = require('../diagnostics/ui-performance-app/tests/loadBenchmark.cjs');
  const optimizedLayout = fs.readFileSync(path.join(root, 'src/utils/runtime/uiLayout.js'), 'utf8');
  const oldLayout = fs.readFileSync(path.join(root, 'tests/fixtures/uiLayout-v5.js'), 'utf8');
  for (const game of ['diagnostics/ui-performance-app/src/utils/ui2048Example.js', 'src/data/examples/ui2048Example.js']) {
    const gameSource = fs.readFileSync(path.join(root, game), 'utf8');
    const variants = await Promise.all([oldLayout, optimizedLayout].map(source => load({ optimizedLayout: source, gameSource })));
    const pages = [{ uiNodes: [] }, { uiNodes: [] }];
    const cases = variants.map((variant, i) => variant.createCase(pages[i], { game: true, optimized: true }, () => 0));
    const identities = pages.map(page => page.uiNodes.slice());
    for (let frame = 0; frame < 96; frame++) {
      cases.forEach(instance => instance.step({ syncEnd: 0 })); await Promise.resolve();
      cases.forEach(instance => instance.finishSample());
      assert.deepEqual(pages[0].uiNodes, pages[1].uiNodes, game + ' frame ' + frame);
      pages.forEach((page, index) => page.uiNodes.forEach((node, i) => assert.equal(node, identities[index][i])));
    }
    cases.forEach(instance => instance.dispose());
  }
});

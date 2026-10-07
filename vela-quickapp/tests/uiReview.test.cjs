const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadUi, host, root } = require('./helpers/loadUi.cjs');

const { loadRunnerFixture: pageFixture } = require('./helpers/loadUi.cjs');

test('impossible grid and weighted row widths fail before replacing a valid frame', async () => {
  const { createUiSession, compileUi } = await loadUi();
  const { state, callbacks } = host();
  const { ui } = createUiSession(callbacks);
  ui.render(ui.text('valid'));
  const before = state.nodes;
  const invalid = [
    ui.grid(['1', '2', '3', '4'], { width: 40, columns: 4, gap: 48 }),
    ui.grid(['1'], { width: 3, columns: 4, gap: 0 }),
    ui.row([ui.text('small', { flex: 0.1 }), ui.text('large', { flex: 100 })], { width: 100, gap: 0 })
  ];
  invalid.forEach(view => {
    ui.render(view);
    assert.equal(state.nodes, before);
    assert.match(state.errors.at(-1).message, /宽度不足/);
  });
  const valid = compileUi(ui.row([
    ui.text('small', { flex: 1 }), ui.text('large', { flex: 100 })
  ], { width: 101, gap: 0 }), 12);
  assert.deepEqual(valid.nodes.map(node => node.width), [1, 100]);
  assert.deepEqual(compileUi(ui.grid([], { width: 1, gap: 48 }), 12).nodes, []);
});

test('automatic lines agree with fresh compilation through kind and explicit-line changes', async () => {
  const { compileUi } = await loadUi();
  let previous;
  for (const [kind, lines] of [['text'], ['button'], ['heading'], ['button', 1], ['button'], ['text']]) {
    const view = { kind, id: 'same', width: 100, size: 24, text: '一二三四', lines };
    const cold = compileUi(view, 12);
    const warm = compileUi(view, 12, previous && previous.nodes, previous && previous.cache);
    assert.deepEqual(warm.nodes, cold.nodes);
    if (previous) assert.deepEqual(compileUi(view, 12, previous.nodes).nodes, cold.nodes);
    if (kind === 'button' && !lines) {
      assert.equal(warm.nodes[0].lines, 2);
      assert.equal(warm.nodes[0].height, 80);
    }
    previous = warm;
  }
});

test('fractional flex widths use the painted width for both fresh and cached line estimates', async () => {
  const { compileUi } = await loadUi();
  let previous;
  for (const flex of [95.8, 96.2, 95.8]) {
    const view = { kind: 'row', width: 100, gap: 0, children: [
      { kind: 'text', id: 'label', text: '一二三四', size: 24, flex },
      { kind: 'text', id: 'other', text: '', flex: 100 - flex }
    ] };
    const warm = compileUi(view, 12, previous && previous.nodes, previous && previous.cache);
    assert.deepEqual(warm.nodes, compileUi(view, 12).nodes);
    assert.equal(warm.nodes[0].width, 96);
    assert.equal(warm.nodes[0].lines, 1);
    previous = warm;
  }
});

test('explicit refresh re-coerces mutable labels without giving up primitive node reuse', async () => {
  const { createUiSession } = await loadUi();
  const { state, callbacks } = host();
  const { ui } = createUiSession(callbacks);
  let label = 'before';
  const object = { toString: () => label };
  const array = ['first'];
  ui.render(() => [ui.text(object, { id: 'object' }), ui.text(array, { id: 'array' }), ui.text('stable', { id: 'stable' })]);
  const stable = state.nodes[2];
  label = 'after'; array[0] = 'second';
  ui.refresh(); await Promise.resolve();
  assert.deepEqual(state.nodes.map(node => node.text), ['after', 'second', 'stable']);
  assert.equal(state.nodes[2], stable);
  const previous = state.nodes.slice();
  ui.refresh(); await Promise.resolve();
  state.nodes.forEach((node, i) => assert.equal(node, previous[i]));
});

test('failed host publication retains old handlers and retries even when the view returns to the old state', async () => {
  const { createUiSession } = await loadUi();
  const { state, callbacks } = host();
  let fail = false; let selected; const changes = [];
  const publish = callbacks.publish;
  callbacks.publish = (...args) => {
    changes.push(args[3]);
    if (fail) { fail = false; throw new Error('publish'); }
    publish(...args);
  };
  const session = createUiSession(callbacks); const { ui } = session;
  let value = '0';
  ui.render(() => {
    const captured = value;
    return ui.button(captured, () => { selected = captured; }, { id: 'button' });
  });
  fail = true; value = '1'; ui.refresh(); await Promise.resolve();
  assert.equal(state.nodes[0].text, '0');
  session.invoke('button'); assert.equal(selected, '0');
  value = '0'; ui.refresh(); await Promise.resolve();
  assert.deepEqual(changes, [true, true, true]);
  value = '1'; ui.refresh(); await Promise.resolve();
  assert.equal(state.nodes[0].text, '1');
  session.invoke('button'); assert.equal(selected, '1');
});

test('queued and later background refreshes retain errors until the next interaction', async () => {
  const { page, captured: ui } = await pageFixture(`
    system.capture(ui);
    const count = ui.signal(0);
    ui.render(() => [
      ui.text(count.get(), { id: 'count', height: 600 }),
      ui.button('fail', () => { count.set(1); throw new Error('after update'); }, { id: 'fail' }),
      ui.button('recover', () => {}, { id: 'recover' })
    ]);
  `);
  const normalHeight = page.layoutHeight;
  page.onButtonPress('fail');
  await Promise.resolve();
  assert.match(page.error, /after update/);
  assert.equal(page.uiNodes[0].text, '1');
  assert.equal(page.errorTop, page.contentEnd);
  assert.ok(page.layoutHeight > normalHeight);
  ui.refresh(); await Promise.resolve();
  assert.match(page.error, /after update/);
  page.onButtonPress('recover'); await Promise.resolve();
  assert.equal(page.error, '');
  assert.equal(page.layoutHeight, normalHeight);
  page.onDestroy();
});

test('async errors survive refresh and explicit render clears the error card', async () => {
  const { page, captured: ui } = await pageFixture(`
    system.capture(ui);
    ui.render(ui.button('fail', () => Promise.reject(new Error('async failure')), { id: 'fail' }));
  `);
  page.onButtonPress('fail'); await Promise.resolve();
  ui.refresh(); await Promise.resolve();
  assert.match(page.error, /async failure/);
  ui.render(ui.text('recovered'));
  assert.equal(page.error, '');
  assert.equal(page.layoutHeight, 480);
  page.onDestroy();
});

test('page retries after array assignment failure using fresh observed nodes', async () => {
  const { page, captured: ui } = await pageFixture("system.capture(ui); ui.render(ui.text('0', { id: 'label' }));");
  let observed = page.uiNodes; let fail = true;
  Object.defineProperty(page, 'uiNodes', {
    get() { return observed; },
    set(value) { if (fail) { fail = false; throw new Error('array assignment'); } observed = value; }
  });
  ui.render([ui.text('1', { id: 'label' }), ui.text('new', { id: 'extra' })]);
  assert.match(page.error, /array assignment/);
  ui.render([ui.text('1', { id:'label' }),ui.text('new', { id:'extra' })]);
  assert.deepEqual(page.uiNodes.map(node => node.text), ['1', 'new']);
  page.onDestroy();
});

test('page discards a partially written observed node when retrying the previous view', async () => {
  const { page, captured: ui } = await pageFixture("system.capture(ui); ui.render(ui.text('0', { id: 'label' }));");
  const previous = page.uiNodes[0]; let text = previous.text; let fail = true;
  Object.defineProperty(previous, 'text', {
    enumerable: true, get() { return text; },
    set(value) { text = value; if (fail) { fail = false; throw new Error('partial field write'); } }
  });
  ui.render(ui.text('1', { id: 'label' }));
  assert.equal(previous.text, '1');
  assert.match(page.error, /partial field write/);
  ui.render(ui.text('0', { id: 'label' }));
  assert.notEqual(page.uiNodes[0], previous);
  assert.equal(page.uiNodes[0].text, '0');
  assert.equal(page.error, '');
  page.onDestroy();
});

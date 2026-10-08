const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadUi, host, root } = require('./helpers/loadUi.cjs');
const fs = require('fs');
const path = require('path');

test('nested layouts flatten without native container nodes; widths, gaps and backgrounds remain bounded', async () => {
  const { createUiSession } = await loadUi();
  const { state, callbacks } = host(); const { ui } = createUiSession(callbacks);
  ui.render(ui.column([
    ui.heading('状态', { id: 'title', lines: 1 }),
    ui.row([
      ui.column([ui.text('左', { id: 'a', lines: 1 }), ui.button('操作', () => {}, { id: 'b' })], { flex: 2 }),
      ui.text('右', { id: 'c', lines: 1, flex: 1 })
    ], { gap: 12, align: 'center' })
  ], { padding: 12, gap: 8, background: '#123', radius: 16 }));
  assert.deepEqual(state.errors, []);
  assert.equal(state.nodes.length, 5);
  const [background, title, left, button, right] = state.nodes;
  assert.equal(background.background, '#112233');
  assert.equal(title.x, 18); assert.equal(title.width, 300);
  assert.equal(left.width, 192); assert.equal(right.width, 96);
  assert.equal(right.x, left.x + left.width + 12);
  assert.ok(right.y > left.y); assert.ok(button.y > left.y);
  assert.ok(background.height >= button.y + button.height - background.y);
});

test('stack paint order, percentage width and alignment are deterministic', async () => {
  const { createUiSession } = await loadUi(); const { state, callbacks } = host(); const { ui } = createUiSession(callbacks);
  ui.render(ui.stack([
    ui.text('底层', { id: 'back', width: '50%', lines: 1 }),
    ui.button('前层', () => {}, { id: 'front', width: 100, x: 100, y: 40 })
  ], { height: 160, padding: 10 }));
  assert.deepEqual(state.errors, []);
  assert.equal(state.nodes[0].width, 152); assert.equal(state.nodes[1].x, 116); assert.equal(state.nodes[1].y, 134);
  assert.equal(state.nodes[1].id, 'front');
});

test('custom colors work across controls, buttons and grid; qrcode has quiet padding and reuses unchanged nodes', async () => {
  const { createUiSession } = await loadUi(); const { state, callbacks } = host(); const session = createUiSession(callbacks); const { ui } = session;
  const count = ui.signal(0);
  ui.render(() => [
    ui.qrcode('https://ccicc.icu', { id: 'qr', size: 180, color: '#000', background: '#fff' }),
    ui.button(String(count.get()), () => {}, { id: 'button', color: '#abc', background: '#123' }),
    ui.switch('开关', true, () => {}, { id: 'switch', accent: '#456', thumbColor: '#def', background: '#123' }),
    ui.slider('滑块', 5, () => {}, { id: 'slider', color: '#abc', accent: '#456', trackColor: '#123', thumbColor: '#def' }),
    ui.grid([{ text: '格', background: '#123', color: '#abc' }])
  ]);
  assert.deepEqual(state.errors, []);
  const qr = state.nodes[0]; assert.equal(qr.qrSize, 164); assert.equal(qr.width, 180);
  assert.equal(state.nodes[1].background, '#112233'); assert.equal(state.nodes[1].color, '#aabbcc');
  assert.equal(state.nodes[2].accent, '#445566'); assert.equal(state.nodes[3].trackColor, '#112233');
  assert.equal(state.nodes[4].background, '#112233');
  count.set(1); await Promise.resolve(); assert.equal(state.nodes[0], qr);
});

test('same-value writes do no work and synchronous updates batch once', async () => {
  const { createUiSession } = await loadUi(); const { state, callbacks } = host(); const { ui } = createUiSession(callbacks);
  const a = ui.signal(0); const b = ui.signal(0); let renders = 0;
  ui.render(() => { renders++; return ui.text(a.get() + ':' + b.get(), { id: 'counter', lines: 1 }); });
  a.set(0); await Promise.resolve(); assert.equal(renders, 1);
  a.set(1); a.set(2); b.update(x => x + 1); ui.refresh();
  assert.equal(a.get(), 2); assert.equal(renders, 1);
  await Promise.resolve(); assert.equal(renders, 2); assert.equal(state.paints, 2);
  ui.refresh(); await Promise.resolve(); assert.equal(renders, 3); assert.equal(state.paints, 2);
});

test('stable visual nodes still get current handlers and explicit buttonRow IDs survive reorder', async () => {
  const { createUiSession } = await loadUi(); const { state, callbacks } = host(); const session = createUiSession(callbacks); const { ui } = session;
  let result; let captured = 1; let reverse = false;
  ui.render(() => {
    const value = captured;
    const buttons = [ui.button('A', () => { result = value; }, { id: 'a' }), ui.button('B', () => { result = 'b'; }, { id: 'b' })];
    return ui.buttonRow(reverse ? buttons.reverse() : buttons, { id: 'row' });
  });
  const before = state.nodes[0]; captured = 2; ui.refresh(); await Promise.resolve();
  assert.equal(state.nodes[0], before); session.invoke('a'); assert.equal(result, 2);
  reverse = true; ui.refresh(); await Promise.resolve(); session.invoke('a'); assert.equal(result, 2); assert.equal(state.nodes[1].id, 'a');
});

test('sync and async handler errors surface and late disposed errors are ignored', async () => {
  const { createUiSession } = await loadUi(); const { state, callbacks } = host(); const session = createUiSession(callbacks); const { ui } = session;
  let rejectLater;
  ui.render([
    ui.button('同步', () => { throw new Error('sync'); }, { id: 'sync' }),
    ui.button('异步', async () => { throw new Error('async'); }, { id: 'async' }),
    ui.button('延后', () => new Promise((resolve, reject) => { rejectLater = reject; }), { id: 'late' })
  ]);
  session.invoke('sync'); session.invoke('async'); await Promise.resolve();
  assert.deepEqual(state.errors.map(x => x.message), ['sync', 'async']);
  session.invoke('late'); session.dispose(); rejectLater(new Error('late')); await Promise.resolve();
  assert.equal(state.errors.length, 2); assert.equal(session.invoke('sync'), false);
});

test('invalid layouts fail clearly without discarding the previous screen', async () => {
  const { createUiSession } = await loadUi(); const { state, callbacks } = host(); const { ui } = createUiSession(callbacks);
  ui.render(ui.text('ok')); const previous = state.nodes;
  for (const view of [
    [ui.text('x', { id: 'same' }), ui.text('y', { id: 'same' })],
    ui.row([ui.text('x', { width: 300 }), ui.text('y', { width: 300 })]),
    ui.qrcode(''), ui.qrcode('x'.repeat(257)),
    ui.row([ui.slider('x', 1), ui.slider('y', 1)], { gap: 20 })
  ]) {
    const errors = state.errors.length; ui.render(view);
    assert.equal(state.errors.length, errors + 1); assert.equal(state.nodes, previous);
  }
  const cycle = ui.column([]); cycle.children.push(cycle); ui.render(cycle);
  assert.match(state.errors.at(-1).message, /循环引用/);
});

test('render-side effects cannot recursively redraw; disposed queued work does not publish', async () => {
  const { createUiSession } = await loadUi(); const { state, callbacks } = host(); const session = createUiSession(callbacks); const { ui } = session; const a = ui.signal(0);
  ui.render(() => { a.set(a.get() + 1); return ui.text('x'); });
  assert.match(state.errors[0].message, /signal/);
  ui.render(() => ui.text(a.get())); a.set(10); const n = state.publishes; session.dispose(); await Promise.resolve(); assert.equal(state.publishes, n);
});

test('cached geometry updates on text, width, header and topology changes without mutating the old screen', async () => {
  const { createUiSession } = await loadUi(); const { state, callbacks } = host(); const { ui } = createUiSession(callbacks);
  let value = '一行'; let width = 300; let first = true;
  ui.render(() => ui.column([
    first && ui.text(value, { id: 'text', width }),
    ui.button('动作', () => {}, { id: 'action' })
  ]));
  const previous = state.nodes; const originalY = previous[1].y;
  value = '一二三四五六七八九十'; width = 48; ui.refresh(); await Promise.resolve();
  assert.ok(state.nodes[1].y > originalY); assert.equal(previous[1].y, originalY);
  const oldY = state.nodes[1].y; ui.showHeader(false); await Promise.resolve();
  assert.equal(state.nodes[1].y, oldY - 72);
  first = false; ui.refresh(); await Promise.resolve(); assert.equal(state.nodes.length, 1); assert.equal(state.nodes[0].y, 12);
  ui.render(null); assert.equal(state.nodes.length, 0);
});

test('many nodes, deep layouts and multiple QR codes compile without artificial caps', async () => {
  const { createUiSession } = await loadUi(); const { state, callbacks } = host(); const { ui } = createUiSession(callbacks);
  ui.render(Array.from({ length: 9 }, () => ui.buttonRow(Array.from({ length: 4 }, () => ui.button('x', () => {})))));
  assert.equal(state.errors.length, 0);
  assert.equal(state.nodes.length, 36);
  ui.render(Array.from({ length: 5 }, () => ui.grid(Array(36).fill('2'))));
  assert.equal(state.nodes.length, 180);
  ui.render(ui.grid(Array(40).fill('2')));
  assert.equal(state.nodes.length, 40);
  ui.render(ui.buttonRow(Array.from({ length: 5 }, () => ui.button('x', () => {}))));
  assert.equal(state.nodes.length, 5);
  ui.render([ui.qrcode('1'), ui.qrcode('2'), ui.qrcode('3')]);
  assert.equal(state.nodes.length, 3);
  let nested = ui.text('deep');
  for (let i = 0; i < 256; i += 1) nested = ui.column([nested]);
  ui.render(nested);
  assert.equal(state.errors.length, 0);
  assert.equal(state.nodes.length, 1);
});

test('runner publication uses stable fields and no reactive comparisons', async () => {
  const { loadRunnerFixture } = require('./helpers/loadUi.cjs');
  const { page, captured: ui, scrolls } = await loadRunnerFixture("system.capture(ui); ui.render([ui.qrcode('https://ccicc.icu',{id:'qr'}),ui.text('0',{id:'text'})]);");
  const nodes=page.uiNodes, qr=nodes[0], label=nodes[1], values={},writes=[];let reads=0;
  Object.keys(label).forEach(key=>{values[key]=label[key];Object.defineProperty(label,key,{enumerable:true,get(){reads++;return values[key];},set(value){writes.push(key);values[key]=value;}});});
  nodes.splice=()=>{throw new Error('stable topology must not splice');};
  ui.render([ui.qrcode('https://ccicc.icu',{id:'qr'}),ui.text('1',{id:'text'})]);
  assert.equal(page.uiNodes,nodes);assert.equal(page.uiNodes[0],qr);assert.equal(page.uiNodes[1],label);
  assert.deepEqual(writes,['text']);assert.equal(reads,0);
  ui.scrollBottom();await Promise.resolve();assert.equal(scrolls.length,1);
  page.onDestroy();ui.render(ui.text('late'));assert.equal(page.uiNodes,nodes);
});

test('built-in templates including 2048 render with bounded, unique IDs', async () => {
  const { createUiSession } = await loadUi();
  const example = fs.readFileSync(path.join(root, 'src/data/examples/ui2048Example.js'), 'utf8').replace('export default', 'return');
  const game = new Function(example)();
  const templatesSource = fs.readFileSync(path.join(root, 'src/data/scriptTemplates.js'), 'utf8')
    .replace(/import ui2048Example[^\n]+/, '').replace(/export /g, '');
  const templates = new Function('ui2048Example', templatesSource + '\nreturn UI_TEMPLATES;')(game);
  for (const template of templates.filter(x => x.content && !x.label.includes('对话框') && !x.label.includes('切换'))) {
    const { state, callbacks } = host(); const session = createUiSession(callbacks);
    new Function('ui', 'script', template.content)(session.ui, { exit() {}, toast() {} });
    await Promise.resolve();
    assert.deepEqual(state.errors, [], template.label);
    assert.ok(state.nodes.length > 0, template.label);
    assert.equal(new Set(state.nodes.map(x => x.id)).size, state.nodes.length);
    if (template.label.includes('2048')) { session.invoke('up'); await Promise.resolve(); assert.deepEqual(state.errors, []); }
    session.dispose();
  }
});

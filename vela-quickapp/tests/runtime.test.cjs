const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe("uiRuntime", () => {
  const { loadUi, host, root } = require('./helpers/loadUi.cjs');

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
      new Function('ui', 'script', 'console', template.content)(session.ui, { exit() {}, toast() {} }, { log() {} });
      await Promise.resolve();
      assert.deepEqual(state.errors, [], template.label);
      assert.ok(state.nodes.length > 0, template.label);
      assert.equal(new Set(state.nodes.map(x => x.id)).size, state.nodes.length);
      if (template.label.includes('2048')) { session.invoke('up'); await Promise.resolve(); assert.deepEqual(state.errors, []); }
      session.dispose();
    }
  });
});

describe("uiOptimization", () => {
  const { loadUi, root } = require('./helpers/loadUi.cjs');

  function comparableNodes(nodes) {
    return nodes.map(node => {
      const copy = { ...node };
      // Older fixtures omit the current explicit default for enabled buttons.
      if (copy.disabled === false) delete copy.disabled;
      return copy;
    });
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

  test('grid preserves the v5 compiler output across geometry, styles, topology and warm-cache changes', async () => {
    const { compileUi } = await loadUi(); const legacy = await v5Layout();
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
      assert.deepEqual(comparableNodes(current.nodes), comparableNodes(previous.nodes), 'frame ' + i);
      assert.equal(current.height, previous.height); assert.equal(current.count, previous.count);
      const repeated = compileUi(view, top, current.nodes, current.cache);
      repeated.nodes.forEach((node, index) => assert.equal(node, current.nodes[index]));
      current = repeated;
    }
  });

  test('grid cache invalidates individual inputs and mutable coercible values; deleted cells do not remain cached', async () => {
    const { compileUi } = await loadUi(); const legacy = await v5Layout();
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
      assert.deepEqual(comparableNodes(current.nodes), comparableNodes(previous.nodes));
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

  test('grid fast path supports large grids, rejects duplicate IDs and handles node-kind transitions', async () => {
    const { compileUi } = await loadUi();
    assert.equal(compileUi(Array.from({ length: 5 }, (_, i) => ({ kind: 'grid', id: 'g' + i, items: Array(36).fill('2') })), 12).nodes.length, 180);
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
      assert.deepEqual(comparableNodes(current.nodes), comparableNodes(previous.nodes), 'frame ' + frame);
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
    const optimizedLayout = fs.readFileSync(path.join(root, 'src/utils/runtime/uiLayout.js'), 'utf8');
    const oldLayout = fs.readFileSync(path.join(root, 'tests/fixtures/uiLayout-v5.js'), 'utf8');
    for (const game of ['tests/fixtures/ui2048-original.js', 'src/data/examples/ui2048Example.js']) {
      const gameModule = fs.readFileSync(path.join(root, game), 'utf8');
      const { default: gameSource } = await import('data:text/javascript;base64,' + Buffer.from(gameModule).toString('base64'));
      const variants = await Promise.all([oldLayout, optimizedLayout].map(source => loadUi(source)));
      const pages = [{ uiNodes: [] }, { uiNodes: [] }];
      const errors = [];
      const cases = variants.map((variant, i) => {
        const publisher = variant.createUiPublisher();
        const session = variant.createUiSession({
          top: () => 12, title() {}, header: () => false, scroll() {},
          error: error => errors.push(error),
          publish(nodes, height, end, changed) {
            if (changed) pages[i].uiNodes = publisher.update(nodes, pages[i].uiNodes);
          }
        });
        let seed = 42;
        const math = Object.create(Math);
        math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
        new Function('ui', 'script', 'Math', 'console', gameSource)(session.ui, { exit() {} }, math, { log() {} });
        return session;
      });
      assert.deepEqual(errors, []);
      const identities = pages.map(page => page.uiNodes.slice());
      for (let frame = 0; frame < 96; frame++) {
        cases.forEach(instance => instance.invoke((frame + 1) % 32 === 0 ? 'reset' : ['left', 'up', 'right', 'down'][frame % 4]));
        await Promise.resolve();
        assert.deepEqual(errors, []);
        assert.deepEqual(comparableNodes(pages[0].uiNodes), comparableNodes(pages[1].uiNodes), game + ' frame ' + frame);
        pages.forEach((page, index) => page.uiNodes.forEach((node, i) => assert.equal(node, identities[index][i])));
      }
      cases.forEach(instance => instance.dispose());
    }
  });
});

describe("uiReview", () => {
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
});

describe("uiStyleBindings", () => {
  const { root } = require('./helpers/loadUi.cjs');
  const { compileStyle, translateStyle } = require('./helpers/loadStyles.cjs');

  test('production object bindings preserve toolkit style values and dependencies without parsing CSS strings', async () => {
    const before = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/run-ui-style-strings.json'), 'utf8'));
    const pageSource = fs.readFileSync(path.join(root, 'src/pages/workspace/run/run.ux'), 'utf8');
    const after = [...pageSource.match(/<template>[\s\S]*?<\/template>/)[0].matchAll(/style="([^"]*)"/g)].map(match => match[1]);
    assert.equal(before.length, 17); assert.equal(after.length, before.length);
    for (let i = 0; i < before.length; i++) {
      const oldBinding = await compileStyle(before[i]); const newBinding = await compileStyle(after[i]);
      for (let frame = 0; frame < 24; frame++) {
        const page = { layoutHeight: 480 + frame * 50, contentTopPadding: frame % 2 ? 102 : 12,
          errorTop: 300, scrollTrackTop: 106, scrollTrackHeight: 360, scrollThumbTop: 112, scrollThumbHeight: 42 };
        const node = { x: frame * 3, y: frame * 5, width: 201.5, height: 50, radius: frame % 3 ? 12 : 0,
          background: ['#abcdef', 'rgba(1, 2, 3, 0.5)', 'transparent'][frame % 3], color: '#ffffff', size: 18 + frame % 12,
          lineHeight: 32 + frame % 10, bold: frame % 2 ? 'bold' : 'normal', align: ['left', 'center', 'right'][frame % 3],
          lines: 1 + frame % 4, copyWidth: 109.5, detailColor: '#aaaaaa', accent: '#ff8800', trackColor: '#333333',
          thumbColor: '#ffffff', qrSize: 144 };
        const reads = [];
        const track = (target, prefix) => new Proxy(target, { get(value, key) { reads.push(prefix + key); return value[key]; } });
        const vm = track(page, 'page.'); const observed = track(node, 'node.');
        const oldStyle = oldBinding(vm, observed); const oldReads = reads.splice(0);
        let objectCalls = 0;
        const newStyle = newBinding(vm, observed, value => {
          assert.equal(typeof value, 'object'); objectCalls++;
          assert.equal(translateStyle(value), value); return value;
        });
        assert.equal(objectCalls, 1);
        assert.deepEqual(newStyle, oldStyle, 'binding ' + i + ', frame ' + frame);
        assert.deepEqual(reads, oldReads, 'dependency reads for binding ' + i);
      }
    }
  });
});

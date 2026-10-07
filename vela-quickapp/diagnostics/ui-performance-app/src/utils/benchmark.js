import { createUiSession } from './uiRuntime.js';
import { compileUi } from './uiLayout.js';
import gameSource from './ui2048Example.js';
import { createUiSession as createOptimizedSession } from './optimized/uiRuntime.js';
import { createUiPublisher } from './optimized/uiPublisher.js';

export const CASES = [
  { id: 'idle', label: '空更新基线' },
  { id: 'unchanged', label: '引擎刷新/无变化', engine: true, unchanged: true },
  { id: 'engine-one', label: '引擎splice/1格', engine: true, one: true },
  { id: 'engine-splice', label: '引擎splice/16格', engine: true },
  { id: 'engine-fields', label: '引擎字段/16格', engine: true, fields: true },
  { id: 'raw-splice', label: '直接splice/16格' },
  { id: 'raw-fields', label: '直接字段/16格', fields: true },
  { id: 'raw-replace', label: '整数组替换/16格', replace: true },
  { id: 'lean-fields', label: '简化模板/16格', fields: true, lean: true },
  { id: 'square-fields', label: '简化模板无圆角', fields: true, lean: true, square: true },
  { id: 'game-splice', label: '真实2048/splice', engine: true, game: true },
  { id: 'game-fields', label: '真实2048/字段', engine: true, game: true, fields: true }
];

// Five photo pages. Keep the measured v2 cases available as reference fixtures.
export const RETEST_CASES = [
  CASES.find(mode => mode.id === 'idle'),
  CASES.find(mode => mode.id === 'game-splice'),
  { id: 'fields-unchanged', label: '仅字段/不变', engine: true, fields: true, unchanged: true },
  { id: 'optimized-unchanged', label: '新版/不变', engine: true, optimized: true, unchanged: true },
  CASES.find(mode => mode.id === 'engine-fields'),
  { id: 'optimized-grid', label: '新版/16格', engine: true, optimized: true },
  CASES.find(mode => mode.id === 'game-fields'),
  { id: 'optimized-game', label: '新版/2048', engine: true, optimized: true, game: true }
];

// v4 isolates observed lists and individual field types. All cases use the
// current production compiler/publisher; the measured v2 game stays frozen.
export const FOCUS_CASES = [
  CASES.find(mode => mode.id === 'idle'),
  { id: 'optimized-one', label: '列表/1格', engine: true, optimized: true, one: true },
  { id: 'optimized-grid', label: '列表/16格', engine: true, optimized: true },
  { id: 'slots-grid', label: '固定绑定/16格', engine: true, optimized: true, fixed: true },
  { id: 'optimized-text', label: '列表/只改文字', engine: true, optimized: true, only: 'text' },
  { id: 'optimized-background', label: '列表/只改背景', engine: true, optimized: true, only: 'background' },
  { id: 'optimized-game', label: '列表/2048', engine: true, optimized: true, game: true },
  { id: 'slots-game', label: '固定绑定/2048', engine: true, optimized: true, fixed: true, game: true }
];

// v5 changes only dynamic style construction. Both groups use identical
// compiler snapshots, observed fields, native components and geometry.
export const STYLE_CASES = [
  { id: 'string-one', label: '字符串/1格', engine: true, optimized: true, one: true },
  { id: 'object-one', label: '对象样式/1格', engine: true, optimized: true, one: true, objectStyles: true },
  { id: 'string-grid', label: '字符串/16格', engine: true, optimized: true },
  { id: 'object-grid', label: '对象样式/16格', engine: true, optimized: true, objectStyles: true },
  { id: 'string-background', label: '字符串/只背景', engine: true, optimized: true, only: 'background' },
  { id: 'object-background', label: '对象样式/只背景', engine: true, optimized: true, only: 'background', objectStyles: true },
  { id: 'string-game', label: '字符串/2048', engine: true, optimized: true, game: true },
  { id: 'object-game', label: '对象样式/2048', engine: true, optimized: true, game: true, objectStyles: true }
];

export function statistics(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const round = value => Math.round(value * 100) / 100;
  return {
    n: sorted.length,
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p50: round(sorted[Math.ceil(sorted.length * 0.5) - 1]),
    p95: round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
    max: round(sorted[sorted.length - 1])
  };
}

// Use separate objects for immutable compiler snapshots and observed page data.
// The 'splice' baseline deliberately keeps the production engine's sharing.
export function publishNodes(page, nodes, mode, previous) {
  const stable = nodes.length === page.uiNodes.length && nodes.every((node, i) =>
    node.id === page.uiNodes[i].id && node.kind === page.uiNodes[i].kind);
  const counts = { nodes: 0, fields: 0, splices: 0, arrays: 0 };
  if (!stable || mode.replace) {
    page.uiNodes = mode.fields || mode.replace ? nodes.map(node => Object.assign({}, node)) : nodes;
    counts.nodes = nodes.length;
    counts.arrays = 1;
    return counts;
  }
  nodes.forEach((node, i) => {
    const observed = page.uiNodes[i];
    if (previous && node === previous[i]) return;
    if (!mode.fields && node === observed) return;
    const keys = Object.keys(node);
    const changed = keys.filter(key => node[key] !== observed[key]);
    if (mode.fields) {
      if (changed.length) counts.nodes++;
      changed.forEach(key => { observed[key] = node[key]; counts.fields++; });
    } else if (node !== observed) {
      page.uiNodes.splice(i, 1, node);
      counts.nodes++;
      counts.splices++;
      counts.fields += changed.length;
    }
  });
  return counts;
}

function description(ui, value, one, only) {
  const cells = [];
  for (let i = 0; i < 16; i++) {
    const active = one && i !== 0 ? false : value % 2 === 1;
    cells.push({ text: active && only !== 'background' ? '2' : '',
      background: active && only !== 'text' ? '#1769d2' : '#292c31', size: 25 });
  }
  return [
    ui.text('2048　分数 0', { id: 'score', size: 27, color: '#ffffff' }),
    ui.grid(cells, { id: 'board', columns: 4, cellHeight: 50 }),
    ui.text('合并相同数字，得到 2048', { id: 'message', size: 18, color: '#9ca3af', align: 'center' }),
    ui.buttonRow([
      ui.button('新局', () => {}, { id: 'reset', tone: 'danger' }),
      ui.button('↑', () => {}, { id: 'up' }),
      ui.button('退出', () => {}, { id: 'exit', tone: 'neutral' })
    ], { id: 'page-controls' }),
    ui.buttonRow([
      ui.button('←', () => {}, { id: 'left' }),
      ui.button('↓', () => {}, { id: 'down' }),
      ui.button('→', () => {}, { id: 'right' })
    ], { id: 'move-controls' })
  ];
}

function seededMath() {
  let seed = 42;
  const result = Object.create(Math);
  result.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  return result;
}

export function createCase(page, mode, now) {
  let current = null;
  let signal;
  let counter = 0;
  let previous = null;
  let runtimeError = null;
  // This array is private JS state; fixed-slot data never enters a reactive
  // array. Each slot is an ordinary observed node with the same painted fields.
  let fixedObserved = [];
  const publisher = mode.optimized ? createUiPublisher() : null;
  const createSession = mode.optimized ? createOptimizedSession : createUiSession;
  const session = createSession({
    top: () => 12,
    title: () => {}, header: () => false, scroll: () => {},
    error: error => { runtimeError = error; },
    publish: (nodes, height, end, changed) => {
      const started = now();
      let counts = {};
      if (publisher) {
        if (changed) {
          const observed = mode.fixed ? fixedObserved : page.uiNodes;
          const next = publisher.update(nodes, observed);
          if (next !== observed) {
            if (mode.fixed) {
              if (next.length !== 24) throw new Error('固定绑定测试需要 24 个节点');
              for (let i = 0; i < next.length; i++) page['slot' + i] = next[i];
              fixedObserved = next.map((node, i) => page['slot' + i]);
              page.fixedReady = true;
            } else page.uiNodes = next;
          }
        }
      } else {
        counts = changed ? publishNodes(page, nodes, mode, previous) : { nodes: 0, fields: 0, splices: 0, arrays: 0 };
      }
      previous = nodes;
      if (current) Object.assign(current, counts, { publishMs: now() - started, compileMs: started - current.viewEnd });
    }
  });
  const originalRender = session.ui.render;
  session.ui.render = view => originalRender(typeof view === 'function' ? () => {
    const started = now();
    if (current) current.queueMs = started - current.syncEnd;
    const result = view();
    if (current) { current.viewMs = now() - started; current.viewEnd = now(); }
    return result;
  } : view);
  if (mode.game) {
    new Function('ui', 'script', 'Math', gameSource)(session.ui, { exit() {} }, seededMath());
  } else if (mode.engine) {
    signal = session.ui.signal(0);
    session.ui.render(() => description(session.ui, signal.get(), mode.one, mode.only));
  } else {
    const nodes = compileUi(description(session.ui, 0, false), 12).nodes;
    publishNodes(page, nodes, mode);
  }
  if (runtimeError) { session.dispose(); throw runtimeError; }
  return {
    step(sample) {
      current = sample;
      counter++;
      if (mode.id === 'idle') return;
      if (mode.game) {
        session.invoke(counter % 32 === 0 ? 'reset' : ['left', 'up', 'right', 'down'][(counter - 1) % 4]);
      } else if (mode.engine) {
        if (mode.unchanged) session.refresh();
        else signal.set(counter);
      } else {
        const active = counter % 2 === 1;
        const nodes = page.uiNodes.map(node => node.id.indexOf('board/cell/') === 0
          ? Object.assign({}, node, { text: active ? '2' : '', background: active ? '#1769d2' : '#292c31' }) : node);
        const started = now();
        Object.assign(sample, publishNodes(page, nodes, mode), { publishMs: now() - started });
      }
    },
    finishSample() { current = null; if (runtimeError) throw runtimeError; },
    dispose() {
      current = null; session.dispose(); fixedObserved = [];
      if (mode.fixed) page.fixedReady = false;
    }
  };
}

export function summarize(samples) {
  const result = {};
  ['syncMs', 'jsTurnMs', 'eventLoopMs', 'waitMs', 'queueMs', 'viewMs', 'compileMs', 'publishMs', 'timer0Ms', 'pacedOverrunMs', 'nodes', 'fields', 'splices', 'arrays'].forEach(key => {
    result[key] = statistics(samples.filter(sample => typeof sample[key] === 'number').map(sample => sample[key]));
  });
  return result;
}

// Everything needed for the first diagnosis is on the photo pages; a device
// file or an IDE log is not required. Two fixed-height cards fit one screen.
export function buildReportPages(report) {
  const format = metric => metric ? metric.p50 + '/' + metric.max : '-';
  const short = value => String(value == null ? '?' : value).slice(0, 16);
  const device = report.device || {};
  const scheduling = report.scheduling || {};
  const title = report.suite === 'manual' ? '手动结果 v5' : '自动结果 v5';
  const pages = [{ title, overview: [
    '型号: ' + short(device.model),
    '系统: ' + short(device.osVersionName || device.platformVersionName),
    'Promise: ' + format(scheduling.promise),
    'timer0: ' + format(scheduling.timer0),
    'J = 回调+编译等 JS',
    'E = 到下轮事件循环',
    'V/C = 构造/编译比较',
    'P/Y = 提交/后续等待',
    'W = J 之后到 E 的等待',
    '数据: 中位数/最大 ms',
    '不代表屏幕显示完成'
  ].join('\n') }];
  const rows = [];
  const modes = [];
  report.cases.forEach(entry => {
    if (!modes.some(mode => mode.id === entry.id)) modes.push({ id: entry.id, label: entry.label });
  });
  modes.forEach(mode => {
    const samples = [];
    report.cases.filter(value => value.id === mode.id).forEach(value => samples.push(...value.samples));
    if (!samples.length) return;
    const result = summarize(samples);
    rows.push({ id: mode.id, label: mode.label + ' (' + samples.length + ')', summary: result,
      text: [
        'J ' + format(result.jsTurnMs) + '  E ' + format(result.eventLoopMs),
        'V ' + format(result.viewMs) + '  C ' + format(result.compileMs),
        'P ' + format(result.publishMs) + '  Y ' + format(result.timer0Ms),
        'W ' + format(result.waitMs)
      ].join('\n')
    });
  });
  for (let i = 0; i < rows.length; i += 2) {
    pages.push({ title, cards: rows.slice(i, i + 2).map(row => ({ id: row.id, label: row.label, text: row.text })) });
  }
  if (report.failures.length) pages.push({ title: '错误说明 v5', overview: report.failures.join('\n').slice(0, 160) });
  else if (!rows.length) pages.push({ title: '尚未采样 v5', overview: '请返回菜单开始自动测试，\n或在手动模式下点击测试。' });
  return { rows, pages };
}

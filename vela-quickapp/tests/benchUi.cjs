// Desktop JS comparison only; not a device frame-rate/memory benchmark.
// Baseline defaults to the committed v1 runner; override with a git revision.
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { loadUi, host, root } = require('./helpers/loadUi.cjs');
const path = require('node:path');

function legacy() {
  const revision = process.argv[2] || 'HEAD';
  const source = execFileSync('git', ['show', revision + ':vela-quickapp/src/pages/workspace/run-ui/run-ui.ux'], { cwd: root, encoding: 'utf8' });
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?\n/gm, '').replace('export default', 'return');
  const stats = { renders: 0, paints: 0, measures: 0, submitted: 0 };
  const page = new Function('scheduleAfterRender', 'getPageElement', script)(
    (_page, callback) => callback(),
    () => ({ getScrollRect({ success }) { stats.measures++; success({ height: page.layoutHeight }); }, scrollTo() {} })
  );
  Object.assign(page, page.private, { isRunning: true, runId: 1, destroyed: false, eventHandlers: {} });
  let painted = [];
  Object.defineProperty(page, 'uiNodes', { get: () => painted, set: value => { stats.paints++; stats.submitted += value.length; painted = value; } });
  return { ui: page.createUiApi(1), stats };
}

async function run() {
  const { createUiSession } = await loadUi();
  const results = [];
  for (const writes of [0, 1, 4]) {
    for (const version of ['v1', 'v2']) {
      const harness = host(); const stats = { renders: 0, paints: 0, measures: 0, submitted: 0 };
      let lastNodes = [];
      let submitted = 0;
      const publish = harness.callbacks.publish;
      harness.callbacks.publish = (nodes, ...args) => {
        submitted += nodes.filter((node, i) => node !== lastNodes[i]).length;
        lastNodes = nodes;
        publish(nodes, ...args);
      };
      const previous = version === 'v1' ? legacy() : null;
      const ui = previous ? previous.ui : createUiSession(harness.callbacks).ui;
      const signals = Array.from({ length: 4 }, () => ui.signal(0));
      let renders = 0;
      ui.render(() => { renders++; return Array.from({ length: 20 }, (_, i) => ui.text('状态 ' + i + '：' + signals[i % 4].get(), { id: 'n' + i, lines: 1 })); });
      async function iterations(n) {
        for (let i = 0; i < n; i++) {
          if (!writes) signals[0].set(0);
          for (let j = 0; j < writes; j++) signals[j].set(i);
          await Promise.resolve();
        }
      }
      await iterations(300);
      renders = 0;
      if (previous) Object.assign(previous.stats, stats);
      harness.state.paints = 0;
      submitted = 0;
      const start = performance.now();
      await iterations(2000);
      results.push({ version, scenario: writes ? writes + ' changed signals/tick' : 'same value', ms: +(performance.now() - start).toFixed(2), renders,
        paints: previous ? previous.stats.paints : harness.state.paints, submittedNodes: previous ? previous.stats.submitted : submitted,
        nativeMeasurements: previous ? previous.stats.measures : 0 });
    }
  }
  console.table(results);
  console.log('Node', process.version, 'at', path.basename(root), '; compare operation counts first. Host timings do not establish Vela performance.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

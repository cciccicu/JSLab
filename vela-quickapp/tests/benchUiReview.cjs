// Compare complete JS runtime/page paths with a supplied pre-change snapshot.
// Snapshot directory: uiLayout.js, uiRuntime.js, uiPublisher.js, run-ui.ux.
// No device, native observer, screen timing, or diagnostic-source sync.
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { root, loadRunnerFixture } = require('./helpers/loadUi.cjs');
const baseline = process.argv[2];
const WARMUP = 300; const SAMPLES = 3000; const ROUNDS = 7;
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

async function load(directory) {
  if (!directory) return code => loadRunnerFixture(`const Math = Object.create(globalThis.Math);
    let seed = 123456; Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    ` + code);
  const read = name => fs.readFileSync(path.join(directory, name), 'utf8');
  const layout = url(read('uiLayout.js'));
  const { createUiSession } = await import(url(read('uiRuntime.js').replace("'./uiLayout.js'", JSON.stringify(layout))));
  const { createUiPublisher } = await import(url(read('uiPublisher.js')));
  const script = read('run-ui.ux').match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*;\r?\n/gm, '').replace('export default', 'return');
  const makePage = new Function('createUiSession', 'createUiPublisher', 'createScriptRuntimeApi',
    'getPageElement', 'scheduleAfterRender', 'setTimeout', 'vibrate', script);
  return code => {
    let captured; let seed = 123456;
    const math = Object.create(Math);
    math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const page = makePage(createUiSession, createUiPublisher,
      () => ({ system: { math, capture(value) { captured = value; } }, script: { toast() {}, exit() {} }, dialog: {} }),
      () => ({ scrollTo() {} }), (_page, callback) => Promise.resolve().then(callback), callback => callback(), () => {});
    Object.assign(page, page.private, { $app: { $def: { editor: { name: 'benchmark.ui.js' } } } });
    page.runCode('const Math = system.math;\n' + code);
    if (page.error) throw new Error(page.error);
    return { page, captured };
  };
}

async function measure(makePage, scene) {
  const { page, captured } = await makePage(scene.code);
  let elapsed = 0;
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const start = performance.now();
    if (scene.game) page.onButtonPress((i + 1) % 32 === 0 ? 'reset' : ['left', 'up', 'right', 'down'][i % 4]);
    else captured();
    await Promise.resolve();
    if (i >= WARMUP) elapsed += performance.now() - start;
  }
  if (page.error) throw new Error(page.error);
  if (page.cancelRun) page.cancelRun(); else page.onDestroy();
  return elapsed;
}

(async () => {
  if (!baseline) throw new Error('Usage: node --jitless tests/benchUiReview.cjs <snapshot-directory>');
  const variants = await Promise.all([load(baseline), load()]);
  const game = new Function(fs.readFileSync(path.join(root, 'src/data/examples/ui2048Example.js'), 'utf8')
    .replace('export default', 'return'))();
  const scenes = ['unchanged', 'one', 'all16'].map(id => ({ id, code: `
    const n = ui.signal(0);
    ui.render(() => ui.grid(Array.from({ length: 16 }, (_, i) => {
      const value = ${id === 'unchanged' ? '0' : id === 'one' ? '(i === 0 ? n.get() : 0)' : 'n.get()'};
      return { text: String(value % 2 ? 4 : 2), background: value % 2 ? '#ede0c8' : '#eee4da' };
    }), { id: 'grid' }));
    system.capture(() => ${id === 'unchanged' ? 'ui.refresh()' : 'n.update(value => value + 1)'});
  ` }));
  scenes.push({ id: 'text16', code: `
    const n = ui.signal(0);
    ui.render(() => ui.column(Array.from({ length: 16 }, (_, i) =>
      ui.text(String(n.get() % 2), { id: 'text-' + i, lines: 1 }))));
    system.capture(() => n.update(value => value + 1));
  ` }, { id: 'game-classic', game: true, code: game });
  const rows = [];
  for (const scene of scenes) {
    const runs = [[], []];
    for (let round = 0; round < ROUNDS; round++) {
      for (const i of round % 2 ? [1, 0] : [0, 1]) runs[i].push(await measure(variants[i], scene));
    }
    const median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const before = median(runs[0]); const after = median(runs[1]);
    const round = value => +value.toFixed(2);
    rows.push({ scenario: scene.id, beforeMs: round(before), afterMs: round(after),
      changePct: round(100 * (after / before - 1)), roundsMs: runs.map(values => values.map(round)) });
  }
  console.log(JSON.stringify({ node: process.version, flags: process.execArgv, warmup: WARMUP, samples: SAMPLES,
    rounds: ROUNDS, aggregate: 'median of alternating per-round cumulative milliseconds', rows }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });

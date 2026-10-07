// Pure desktop JS; no Vela observer, rendering, device connection or deployment.
const { performance } = require('node:perf_hooks');
const { load } = require('../diagnostics/ui-performance-app/tests/loadBenchmark.cjs');

(async () => {
  const { RETEST_CASES, createCase, statistics } = await load();
  const rows = [];
  for (const id of ['fields-unchanged', 'optimized-unchanged', 'engine-fields', 'optimized-grid', 'game-fields', 'optimized-game']) {
    const mode = RETEST_CASES.find(value => value.id === id);
    const page = { uiNodes: [] };
    const c = createCase(page, mode, () => performance.now());
    const totals = []; const compiles = []; const publishes = [];
    for (let i = 0; i < 2200; i++) {
      const sample = {};
      const start = performance.now(); c.step(sample); sample.syncEnd = performance.now();
      await Promise.resolve();
      const total = performance.now() - start;
      c.finishSample();
      if (i >= 200) { totals.push(total); compiles.push(sample.compileMs); publishes.push(sample.publishMs); }
    }
    rows.push({ id, samples: totals.length, totalMs: +totals.reduce((a, b) => a + b, 0).toFixed(2),
      compileMs: +compiles.reduce((a, b) => a + b, 0).toFixed(2), publishMs: +publishes.reduce((a, b) => a + b, 0).toFixed(2), p95Ms: statistics(totals).p95 });
    c.dispose();
  }
  console.table(rows);
  console.log('Node', process.version, process.execArgv.join(' '), '; JS only, timings do not establish device performance.');
})().catch(error => { console.error(error); process.exitCode = 1; });

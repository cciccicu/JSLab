// Desktop interpreter comparison against the measured v5 compiler. Includes
// construction, compile, publication and the engine microtask, but no Vela VM.
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { load } = require('../diagnostics/ui-performance-app/tests/loadBenchmark.cjs');
const { root } = require('./helpers/loadUi.cjs');
const WARMUP = 200;
const SAMPLES = 1200;
const ROUNDS = 5;

async function measure(benchmark, mode) {
  const instance = benchmark.createCase({ uiNodes: [] }, mode, () => performance.now());
  let totalMs = 0; let compileMs = 0;
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const sample = {};
    const start = performance.now(); instance.step(sample); sample.syncEnd = performance.now();
    await Promise.resolve();
    const total = performance.now() - start;
    instance.finishSample();
    if (i >= WARMUP) { totalMs += total; compileMs += sample.compileMs; }
  }
  instance.dispose();
  return { totalMs, compileMs };
}

(async () => {
  const sources = ['tests/fixtures/uiLayout-v5.js', 'src/utils/runtime/uiLayout.js'].map(file =>
    fs.readFileSync(path.join(root, file), 'utf8'));
  const original = await Promise.all(sources.map(optimizedLayout => load({ optimizedLayout })));
  const gameSource = fs.readFileSync(path.join(root, 'src/data/examples/ui2048Example.js'), 'utf8');
  const classic = await Promise.all(sources.map(optimizedLayout => load({ optimizedLayout, gameSource })));
  const rows = [];
  for (const mode of [
    { id: 'unchanged', unchanged: true }, { id: 'one', one: true },
    { id: 'text16', only: 'text' }, { id: 'background16', only: 'background' },
    { id: 'all16' }, { id: 'game-original', game: true }, { id: 'game-classic', game: true }
  ]) {
    const variants = mode.id === 'game-classic' ? classic : original;
    const runs = [[], []];
    for (let round = 0; round < ROUNDS; round++) {
      for (const index of round % 2 ? [1, 0] : [0, 1]) {
        runs[index].push(await measure(variants[index], { ...mode, engine: true, optimized: true }));
      }
    }
    const median = (index, key) => runs[index].map(run => run[key]).sort((a, b) => a - b)[Math.floor(ROUNDS / 2)];
    const oldCompile = median(0, 'compileMs'); const newCompile = median(1, 'compileMs');
    const oldTotal = median(0, 'totalMs'); const newTotal = median(1, 'totalMs');
    const round = number => +number.toFixed(2);
    rows.push({ scenario: mode.id, v5CompileMs: round(oldCompile), finalCompileMs: round(newCompile),
      compileDropPct: round(100 * (1 - newCompile / oldCompile)), v5TotalMs: round(oldTotal),
      finalTotalMs: round(newTotal), totalDropPct: round(100 * (1 - newTotal / oldTotal)) });
  }
  console.table(rows);
  console.log(JSON.stringify({ node: process.version, flags: process.execArgv, warmup: WARMUP, samples: SAMPLES,
    rounds: ROUNDS, aggregate: 'median of per-round cumulative milliseconds', rows }, null, 2));
  console.log('Desktop JS only. These numbers do not predict device E/W or screen completion.');
})().catch(error => { console.error(error); process.exitCode = 1; });

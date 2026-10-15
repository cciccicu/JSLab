const {execFileSync} = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const {createStage, compileStage, removeStage, targetName} = require('../../vela-quickapp/scripts/device-build.cjs');
const {exportTemplate} = require('./export-template.cjs');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--target')) throw new Error('Usage: build.cjs [--target bandpro|redmi-watch5]');
(async () => {
  execFileSync(process.execPath, [path.join(__dirname, 'sync-runtime.cjs')], {cwd:root, stdio:'inherit'});
  const devices = args.length ? [targetName(args[1])] : ['bandpro', 'redmi-watch5'];
  for (const device of devices) {
    const context = createStage(root, device);
    try { compileStage(context, 'build', false); await exportTemplate(context.stage, device); }
    finally { removeStage(context.stage); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

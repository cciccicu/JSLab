const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = path.resolve(root, '../../src/utils/runtime');
const target = path.join(root, 'src/utils/optimized');
const names = ['uiLayout.js', 'uiRuntime.js', 'uiPublisher.js'];
// A standalone copy can use its packaged snapshots. In the repository always
// copy production sources; never overwrite the original measured baseline.
if (fs.existsSync(source)) {
  fs.mkdirSync(target, { recursive: true });
  const snapshotPath = path.join(root, 'source-snapshot.json');
  const manifest = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  manifest.optimizedFiles = {};
  for (const name of names) {
    const bytes = fs.readFileSync(path.join(source, name));
    fs.writeFileSync(path.join(target, name), bytes);
    manifest.optimizedFiles[name] = { source: '../../src/utils/runtime/' + name, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  }
  const pageSource = path.resolve(source, '../../pages/workspace/run/run.ux');
  manifest.optimizedTemplates = { 'run.ux': {
    source: '../../src/pages/workspace/run/run.ux',
    sha256: crypto.createHash('sha256').update(fs.readFileSync(pageSource)).digest('hex')
  } };
  fs.writeFileSync(snapshotPath, JSON.stringify(manifest, null, 2) + '\n');
} else {
  for (const name of names) if (!fs.existsSync(path.join(target, name))) throw new Error('Missing optimized snapshot: ' + name);
}

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const project = path.resolve(__dirname, '..');
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'jslab-astrobox-'));
const archive = path.join(project, 'release-archive');

try {
  for (const name of ['src', 'sign']) fs.cpSync(path.join(project, name), path.join(stage, name), { recursive: true });
  for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(project, name), path.join(stage, name));
  fs.symlinkSync(path.join(project, 'node_modules'), path.join(stage, 'node_modules'), 'junction');

  const editionFile = path.join(stage, 'src/utils/core/edition.js');
  const source = fs.readFileSync(editionFile, 'utf8');
  const marker = 'export const IS_ASTROBOX_EDITION = false;';
  if (!source.includes(marker)) throw new Error('AstroBox edition marker missing');
  fs.writeFileSync(editionFile, source.replace(marker, 'export const IS_ASTROBOX_EDITION = true;'));

  const executable = path.join(project, 'node_modules/.bin', process.platform === 'win32' ? 'aiot.cmd' : 'aiot');
  const build = spawnSync(executable, ['release', '--enable-jsc'], {
    cwd: stage, stdio: 'inherit', shell: process.platform === 'win32', env: process.env
  });
  if (build.error) throw build.error;
  if (build.status !== 0) throw new Error('AstroBox release failed: ' + build.status);

  const packages = fs.readdirSync(path.join(stage, 'dist')).filter(name => name.endsWith('.rpk'));
  if (packages.length !== 1) throw new Error('Expected exactly one AstroBox RPK, got ' + packages.length);
  const version = JSON.parse(fs.readFileSync(path.join(stage, 'src/manifest.json'), 'utf8')).versionName;
  fs.mkdirSync(archive, { recursive: true });
  const output = path.join(archive, `JSLab-AstroBox-${version}.rpk`);
  fs.copyFileSync(path.join(stage, 'dist', packages[0]), output);
  console.log('AstroBox release: ' + output);
} finally {
  if (path.dirname(stage) !== os.tmpdir() || !path.basename(stage).startsWith('jslab-astrobox-')) {
    throw new Error('Unsafe staging path: ' + stage);
  }
  fs.rmSync(stage, { recursive: true, force: true });
}

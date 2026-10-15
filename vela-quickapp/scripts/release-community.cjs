const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const project = path.resolve(__dirname, '..');
const stagingRoot = path.resolve(os.tmpdir());
const stage = fs.mkdtempSync(path.join(stagingRoot, 'jslab-community-'));
const archive = path.join(project, 'release-archive');

try {
  for (const name of ['src', 'sign']) fs.cpSync(path.join(project, name), path.join(stage, name), { recursive: true });
  for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(project, name), path.join(stage, name));
  fs.symlinkSync(path.join(project, 'node_modules'), path.join(stage, 'node_modules'), 'junction');

  const configFile = path.join(stage, 'src/utils/core/buildConfig.js');
  const source = fs.readFileSync(configFile, 'utf8');
  const marker = 'export const IS_COMMUNITY_EDITION = false;';
  if (!source.includes(marker)) throw new Error('Community build marker missing');
  fs.writeFileSync(configFile, source.replace(marker, 'export const IS_COMMUNITY_EDITION = true;'));

  const manifestFile = path.join(stage, 'src/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.name = 'JSLab社区版';
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');

  const toolkit = path.join(project, 'node_modules/aiot-toolkit/lib/bin.js');
  const build = spawnSync(process.execPath, [toolkit, 'release', '--enable-jsc'], {
    cwd: stage, stdio: 'inherit', env: process.env
  });
  if (build.error) throw build.error;
  if (build.status !== 0) throw new Error('Community release failed: ' + build.status);

  const packages = fs.readdirSync(path.join(stage, 'dist')).filter(name => name.endsWith('.rpk'));
  if (packages.length !== 1) throw new Error('Expected exactly one community RPK, got ' + packages.length);
  fs.mkdirSync(archive, { recursive: true });
  const output = path.join(archive, 'JSLab-Community-' + manifest.versionName + '.rpk');
  fs.copyFileSync(path.join(stage, 'dist', packages[0]), output);
  console.log('Community release: ' + output);
} finally {
  if (path.dirname(stage) !== stagingRoot || !path.basename(stage).startsWith('jslab-community-')) {
    throw new Error('Unsafe staging path: ' + stage);
  }
  fs.rmSync(stage, { recursive: true, force: true });
}

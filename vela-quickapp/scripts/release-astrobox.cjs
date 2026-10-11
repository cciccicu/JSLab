const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function releaseVariant(variant) {
  if (variant !== 'astrobox' && variant !== 'community') throw new Error('Unknown release variant');
  const project = path.resolve(__dirname, '..');
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), `jslab-${variant}-`));
  const archive = path.join(project, 'release-archive');
  try {
  for (const name of ['src', 'sign']) fs.cpSync(path.join(project, name), path.join(stage, name), { recursive: true });
  for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(project, name), path.join(stage, name));
  fs.symlinkSync(path.join(project, 'node_modules'), path.join(stage, 'node_modules'), 'junction');

  const editionFile = path.join(stage, 'src/utils/core/edition.js');
  const source = fs.readFileSync(editionFile, 'utf8');
  const marker = variant === 'astrobox' ? 'export const IS_ASTROBOX_EDITION = false;' : 'export const IS_COMMUNITY_EDITION = false;';
  if (!source.includes(marker)) throw new Error(variant + ' edition marker missing');
  fs.writeFileSync(editionFile, source.replace(marker, marker.replace('false', 'true')));
  if (variant === 'community') {
    const manifestFile = path.join(stage, 'src/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    manifest.name = 'JSLab社区版';
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  }

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
  const output = path.join(archive, `JSLab-${variant === 'community' ? 'Community' : 'AstroBox'}-${version}.rpk`);
  fs.copyFileSync(path.join(stage, 'dist', packages[0]), output);
  console.log(variant + ' release: ' + output);
} finally {
  if (path.dirname(stage) !== os.tmpdir() || !path.basename(stage).startsWith(`jslab-${variant}-`)) {
    throw new Error('Unsafe staging path: ' + stage);
  }
  fs.rmSync(stage, { recursive: true, force: true });
}
}

module.exports = releaseVariant;
if (require.main === module) releaseVariant('astrobox');

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src', 'manifest.json'), 'utf8'));
const packageName = manifest.package;
const version = manifest.versionName;
const distDir = path.join(projectRoot, 'dist');
const sourceName = packageName + '.release.' + version + '.rpk';
const variants = [
  { label: 'jsc', args: ['release', '--enable-jsc'] },
  { label: 'band10-pro', args: ['release'] }
];
const aiotCli = path.join(projectRoot, 'node_modules', 'aiot-toolkit', 'lib', 'bin.js');
const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jslab-release-'));

try {
  variants.forEach((variant, index) => {
    execFileSync(process.execPath, [aiotCli].concat(variant.args), {
      cwd: projectRoot,
      stdio: 'inherit'
    });

    const source = path.join(distDir, sourceName);
    const targetName = packageName + '.release.' + version + '.' + variant.label + '.rpk';
    if (!fs.existsSync(source)) throw new Error('找不到发布包：' + source);

    if (index === 0) {
      fs.copyFileSync(source, path.join(stagingDir, targetName));
    } else {
      const target = path.join(distDir, targetName);
      if (fs.existsSync(target)) fs.unlinkSync(target);
      fs.renameSync(source, target);
    }
    console.log('Generated ' + targetName);
  });

  fs.copyFileSync(
    path.join(stagingDir, packageName + '.release.' + version + '.jsc.rpk'),
    path.join(distDir, packageName + '.release.' + version + '.jsc.rpk')
  );
} finally {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}

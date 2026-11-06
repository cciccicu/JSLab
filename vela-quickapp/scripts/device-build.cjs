const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const appRoot = path.resolve(__dirname, '..');
const targets = { bandpro: { width:336, height:480 }, 'redmi-watch5': { width:432, height:514 } };
function targetName(value = 'bandpro') {
  if (!Object.hasOwn(targets, value)) throw new Error('Unsupported device target: ' + value);
  return value;
}
function files(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : entry.isFile() ? [file] : [];
  });
}
function applyTarget(stage, target, project = appRoot) {
  target = targetName(target);
  if (target !== 'bandpro') {
    const owners=[...new Set([appRoot, project])];
    for (const file of files(path.join(stage,'src')).filter(file=>file.endsWith('.css'))) {
      const relative=path.relative(path.join(stage,'src'),file);
      if (!owners.some(owner=>fs.existsSync(path.join(owner,'targets',target,relative)))) throw new Error('Missing target stylesheet: '+relative);
    }
    for (const owner of owners) {
      const overlay = path.join(owner, 'targets', target);
      if (!fs.existsSync(overlay)) continue;
      for (const file of files(overlay)) {
        const destination = path.join(stage, 'src', path.relative(overlay, file));
        // Template builds include only their own routes and resources.
        if (fs.existsSync(destination)) fs.copyFileSync(file, destination);
      }
    }
  }
  const file = path.join(stage, 'src/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.config.designWidth = targets[target].width;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  const screen = fs.readFileSync(path.join(stage, 'src/utils/core/screen.js'), 'utf8');
  if (!screen.includes("id: '" + target + "'")) throw new Error('Device layout module missing: ' + target);
  return manifest;
}
function createStage(project, target = 'bandpro', community = false) {
  targetName(target);
  const stage = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), 'jslab-device-'));
  try {
    fs.cpSync(path.join(project, 'src'), path.join(stage, 'src'), {recursive:true});
    if (fs.existsSync(path.join(project, 'sign'))) fs.cpSync(path.join(project, 'sign'), path.join(stage, 'sign'), {recursive:true});
    fs.copyFileSync(path.join(project, 'package.json'), path.join(stage, 'package.json'));
    const modules = [project, appRoot].map(dir => path.join(dir, 'node_modules')).find(dir => fs.existsSync(path.join(dir, 'aiot-toolkit/lib/bin.js')));
    if (!modules) throw new Error('Install aiot-toolkit dependencies first');
    fs.symlinkSync(modules, path.join(stage, 'node_modules'), 'junction');
    const manifest = applyTarget(stage, target, project);
    if (community) {
      const file = path.join(stage, 'src/utils/core/buildConfig.js');
      const source = fs.readFileSync(file, 'utf8');
      const marker = 'export const IS_COMMUNITY_EDITION = false;';
      if (!source.includes(marker)) throw new Error('Community build marker missing');
      fs.writeFileSync(file, source.replace(marker, 'export const IS_COMMUNITY_EDITION = true;'));
      manifest.name = 'JSLab社区版';
      fs.writeFileSync(path.join(stage, 'src/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    }
    return {stage, modules, manifest, target};
  } catch (error) { removeStage(stage); throw error; }
}
function removeStage(stage) {
  const resolved = path.resolve(stage);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('jslab-device-')) throw new Error('Unsafe staging path: ' + stage);
  fs.rmSync(resolved, {recursive:true, force:true});
}
function compileStage(context, mode = 'build', jsc = true) {
  if (!['build', 'release'].includes(mode)) throw new Error('Unsupported build mode: ' + mode);
  const toolkit = path.join(context.modules, 'aiot-toolkit/lib/bin.js');
  const result = spawnSync(process.execPath, [toolkit, mode, ...(jsc ? ['--enable-jsc'] : [])], {cwd:context.stage, stdio:'inherit', env:{...process.env, NODE_PATH:context.modules}});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Device build failed: ' + result.status);
}
function buildApp({target = 'bandpro', community = false, mode = 'release', jsc = true} = {}) {
  const context = createStage(appRoot, target, community);
  try {
    compileStage(context, mode, jsc);
    const archive = path.join(appRoot, 'release-archive');
    fs.mkdirSync(archive, {recursive:true});
    const packages = fs.readdirSync(path.join(context.stage, 'dist')).filter(name => name.endsWith('.rpk'));
    if (packages.length !== 1) throw new Error('Expected one device RPK');
    const device = target === 'bandpro' ? '-Pro' : '-RW';
    const name = 'JSLab-' + (community ? 'Community' : 'Full') + device + '-' + context.manifest.versionName + (mode === 'build' ? '-debug' : '') + '.rpk';
    const output = path.join(archive, name);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (fs.existsSync(output)) fs.copyFileSync(output, path.join(archive, name.replace(/\.rpk$/, '-before-' + stamp + '.rpk')));
    fs.copyFileSync(path.join(context.stage, 'dist', packages[0]), output);
    const compiled = path.join(archive, 'device-builds', target + '-' + (community ? 'community' : 'full') + '-' + stamp);
    fs.cpSync(path.join(context.stage, 'build'), compiled, {recursive:true, filter:file => path.basename(file) !== 'node_modules'});
    console.log(JSON.stringify({target, output, compiled}));
    return {output, compiled};
  } finally { removeStage(context.stage); }
}
module.exports = {appRoot, targets, targetName, files, applyTarget, createStage, compileStage, removeStage, buildApp};

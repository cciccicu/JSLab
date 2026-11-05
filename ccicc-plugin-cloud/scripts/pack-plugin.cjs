'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { syncDocumentation } = require('./sync-docs.cjs');
const pluginRoot = path.resolve(__dirname, '../jslab-cloud');
const requirePlugin = createRequire(path.join(pluginRoot, 'package.json'));
const JSZip = requirePlugin('jszip');

async function main() {
  const [sourceArg, outputArg] = process.argv.slice(2);
  if (sourceArg && path.resolve(sourceArg) !== pluginRoot) throw new Error('This packer only packages JSLab Cloud.');
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'manifest.json'), 'utf8'));
  if (manifest.id !== 'jslab-cloud' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    throw new Error('Invalid plugin identity or version.');
  }
  const entry = path.resolve(pluginRoot, manifest.entry || 'index.js');
  if (!entry.startsWith(pluginRoot + path.sep) || !fs.statSync(entry).isFile()) throw new Error('Invalid plugin entry.');
  syncDocumentation();
  const zip = new JSZip();
  const packaged = new Set();
  function add(relative) {
    const absolute = path.join(pluginRoot, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error('Refusing linked package resource: ' + relative);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) add(path.join(relative, name));
    } else if (stat.isFile()) {
      const name = relative.replace(/\\/g, '/');
      packaged.add(name);
      zip.file(name, fs.readFileSync(absolute), { date: new Date('2020-01-01T00:00:00Z'), createFolders: false });
    }
  }
  // Explicit runtime roots keep local tools, dependencies and credentials out.
  for (const name of ['index.js', 'manifest.json', 'package.json', 'package-lock.json', 'assets', 'lib', 'rpk-template', 'generated/docs']) add(name);
  if (!packaged.has(path.relative(pluginRoot, entry).replace(/\\/g, '/'))) throw new Error('Entry is not packaged.');
  zip.file('LICENSE', fs.readFileSync(path.resolve(__dirname, '../../LICENSE')), { date: new Date('2020-01-01T00:00:00Z') });
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  if (buffer.length > 50 * 1024 * 1024) throw new Error('Plugin exceeds the host 50 MiB limit.');
  const output = path.resolve(outputArg || path.resolve(__dirname, '../dist', `${manifest.id}-${manifest.version}.zip`));
  if (output.startsWith(pluginRoot + path.sep)) throw new Error('Write release archives outside the runtime source directory.');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, buffer);
  console.log(`Created ${output} (${packaged.size + 1} files, ${buffer.length} bytes)`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

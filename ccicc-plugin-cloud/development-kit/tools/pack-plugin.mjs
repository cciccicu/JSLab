import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import yazl from 'yazl';

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg) {
  throw new Error('Usage: npm run pack -- <plugin-directory> [output.zip]');
}

const source = path.resolve(sourceArg);
const manifestPath = path.join(source, 'manifest.json');
if (!fs.statSync(manifestPath, { throwIfNoEntry: false })?.isFile()) {
  throw new Error(`manifest.json not found: ${manifestPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!/^[a-z0-9-]{3,32}$/.test(manifest.id || '')) throw new Error('Invalid manifest id');
if (path.basename(source) !== manifest.id) throw new Error('Directory name must match manifest id');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(manifest.version || '')) {
  throw new Error('manifest version must be SemVer');
}

const entry = path.resolve(source, manifest.entry || 'index.js');
if (!entry.startsWith(`${source}${path.sep}`) || !fs.statSync(entry, { throwIfNoEntry: false })?.isFile()) {
  throw new Error('Plugin entry is missing or outside the plugin directory');
}

const output = path.resolve(outputArg || path.join('dist', `${manifest.id}-${manifest.version}.zip`));
fs.mkdirSync(path.dirname(output), { recursive: true });

const excluded = (name) => name === 'node_modules' || name === 'dist' || name === '.git' || name === '.DS_Store' || name.endsWith('.tmp');
const files = [];
const visit = (dir) => {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excluded(item.name)) continue;
    const absolute = path.join(dir, item.name);
    if (item.isDirectory()) visit(absolute);
    else if (item.isFile()) files.push({ absolute, relative: path.relative(source, absolute).replace(/\\/g, '/') });
  }
};
visit(source);
files.sort((a, b) => a.relative.localeCompare(b.relative));

const zip = new yazl.ZipFile();
for (const file of files) zip.addFile(file.absolute, file.relative);

await new Promise((resolve, reject) => {
  zip.outputStream
    .pipe(fs.createWriteStream(output))
    .on('close', resolve)
    .on('error', reject);
  zip.end();
});

const size = fs.statSync(output).size;
if (size > 50 * 1024 * 1024) throw new Error('ZIP exceeds the host 50 MiB limit');
process.stdout.write(`Created ${output} (${files.length} files, ${size} bytes)\n`);

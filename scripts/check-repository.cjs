'use strict';
// Repository checks need only Node.js and Git, not private tools or platform SDKs.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function git(args, input) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', input, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status > 1) throw result.error || new Error(result.stderr);
  return result.stdout.split('\0').filter(Boolean);
}
const tracked = git(['ls-files', '-z']).filter(file => fs.existsSync(path.join(root, file)));
const ignoredTracked = tracked.length ? git(['check-ignore', '--no-index', '--stdin', '-z'], tracked.join('\0') + '\0') : [];
const files = [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']))]
  .filter(file => fs.existsSync(path.join(root, file)) && fs.lstatSync(path.join(root, file)).isFile());
const visible = new Set(files);
const errors = ignoredTracked.map(file => 'Tracked file matches a local-only rule: ' + file);
const markdown = files.filter(file => file.endsWith('.md'));
let links = 0;

function checkLink(file, href) {
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) return;
  let target;
  try { target = decodeURIComponent(href.replace(/^<|>$/g, '').split(/[?#]/)[0]); }
  catch (_) { errors.push(file + ': malformed link ' + href); return; }
  if (!target) return;
  const absolute = path.resolve(root, path.dirname(file), target);
  const relative = path.relative(root, absolute).replace(/\\/g, '/');
  if (relative.startsWith('../') || path.isAbsolute(relative)) {
    errors.push(file + ': link escapes the repository: ' + href); return;
  }
  // Check exact repository spelling too: a case typo can pass on Windows.
  if (!visible.has(relative) && !files.some(name => name.startsWith(relative + '/'))) {
    errors.push(file + ': missing or local-only link ' + href);
  }
  links += 1;
}

for (const file of markdown) {
  const basename = path.posix.basename(file);
  if (!file.startsWith('docs/') && !['README.md', 'AGENTS.md'].includes(basename) &&
      !['CONTRIBUTING.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md'].includes(file)) {
    errors.push('Move development documentation into docs/: ' + file);
  }
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  for (const match of source.matchAll(/!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) checkLink(file, match[1]);
  for (const match of source.matchAll(/\b(?:src|href)="([^"]+)"/g)) checkLink(file, match[1]);
}

for (const file of files) {
  if (/(?:^|\/)(?:\.env(?:\..+)?|keystore\.properties|local\.properties)$/.test(file) && !file.endsWith('.example')) {
    errors.push('Local configuration must not be published: ' + file);
  }
  if (/\.(?:pem|key|p12|pfx|jks|keystore|rpk|abp|apk|aab|face|aar|exe)$/i.test(file)) {
    errors.push('Local credential, binary or release artifact must not be published: ' + file);
  }
  if (/\.(?:js|cjs|mjs|json|kt|kts|rs|ps1|sh|md|txt)$/i.test(file)) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    if (/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/]{40,}/.test(text)) {
      errors.push('Embedded private key must not be published: ' + file);
    }
  }
}
const examples = files.filter(file => file.startsWith('examples/') && file.endsWith('.js'));
for (const file of examples) {
  try { new Function('console', 'ui', 'dialog', 'script', 'system', fs.readFileSync(path.join(root, file), 'utf8')); }
  catch (error) { errors.push(file + ': ' + error.message); }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log(`Repository checks passed: ${files.length} files, ${markdown.length} documents, ${links} local links, ${examples.length} script examples.`);

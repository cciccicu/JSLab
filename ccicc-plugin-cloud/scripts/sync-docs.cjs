const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const workspace = path.resolve(__dirname, '../..');
const source = path.join(workspace, 'docs/guide');
const declarations = path.join(workspace, 'types');
const destination = path.resolve(__dirname, '../jslab-cloud/generated/docs');

// Markdown is authored for repository readers. The installed plugin keeps its
// existing routes and serves only the generated, self-contained resources.
function documentationFiles() {
  const files = new Map();
  for (const name of fs.readdirSync(source).filter(name => name.endsWith('.md')).sort()) {
    const content = fs.readFileSync(path.join(source, name), 'utf8')
      .replace(/\]\(\.\.\/\.\.\/types\/((?:runtime|ui)-api\.d\.ts)\)/g, ']($1)')
      .replace(/\]\(\.\.\/\.\.\/ccicc-plugin-cloud\/jslab-cloud\/assets\/([^\s)]+)\)/g, '](/jslab-cloud/assets/$1)')
      .replace(/\]\(https:\/\/ccicc\.icu(\/jslab-cloud[^\s)]*)\)/g, ']($1)');
    files.set(name, content);
  }
  for (const name of ['runtime-api.d.ts', 'ui-api.d.ts']) {
    files.set(name, fs.readFileSync(path.join(declarations, name), 'utf8'));
  }
  const helpSource = fs.readFileSync(path.join(workspace, 'vela-quickapp/src/data/helpDocs.js'), 'utf8');
  const help = vm.runInNewContext(helpSource.replace(/^export /gm, '') + '\nHELP_ROOT;', {}, { timeout: 1000 });
  files.set('navigation.json', JSON.stringify(help.map(({ id, title, summary }) => ({ id, title, description: summary })), null, 2) + '\n');
  return files;
}

function syncDocumentation(check = false) {
  const files = documentationFiles();
  if (!check) fs.mkdirSync(destination, { recursive: true });
  for (const [name, content] of files) {
    const output = path.join(destination, name);
    if (check) {
      if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== content) {
        throw new Error(name + ' 未同步，请在云插件目录运行 npm run sync:docs。');
      }
    } else fs.writeFileSync(output, content, 'utf8');
  }
  for (const name of fs.readdirSync(destination)) {
    if (files.has(name)) continue;
    if (check) throw new Error('存在过时的文档生成文件：' + name);
    const obsolete = path.join(destination, name);
    if (!fs.lstatSync(obsolete).isFile()) throw new Error('Unexpected generated resource: ' + obsolete);
    fs.unlinkSync(obsolete);
  }
  console.log(check ? '帮助资源与集中维护的文档一致。' : '已从 docs/guide 与 types 生成云端帮助资源。');
  return files;
}

module.exports = { documentationFiles, syncDocumentation };
if (require.main === module) syncDocumentation(process.argv.includes('--check'));

const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '../../vela-quickapp/docs');
const destination = path.resolve(__dirname, '../jslab-cloud/docs');
// Tutorials are authored for readers in the plugin docs directory; only editor types are copied.
const files = ['runtime-api.d.ts', 'ui-api.d.ts'];
const check = process.argv.includes('--check');
if (!check) fs.mkdirSync(destination, { recursive: true });
for (const name of files) {
  const content = fs.readFileSync(path.join(source, name), 'utf8');
  const output = path.join(destination, name);
  if (check) {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== content) {
      throw new Error(`${name} 未同步，请运行 npm run sync:docs。`);
    }
  } else fs.writeFileSync(output, content, 'utf8');
}
console.log(check ? '类型声明已与 API 源文件同步。' : '已同步脚本与 UI 类型声明。');

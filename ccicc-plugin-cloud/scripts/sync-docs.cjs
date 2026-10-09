const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '../../vela-quickapp/docs');
const destination = path.resolve(__dirname, '../jslab-cloud/docs');
const files = ['runtime-api.md', 'ui-api.md', 'runtime-api.d.ts', 'ui-api.d.ts'];
const check = process.argv.includes('--check');
if (!check) fs.mkdirSync(destination, { recursive: true });
for (const name of files) {
  // The device-only diagnostic link has no browser counterpart.
  const content = fs.readFileSync(path.join(source, name), 'utf8')
    .replace('本轮使用 [集中实机验收脚本](../diagnostics/unified-runner-check.js) 验证切换、重载与对话框。', '设备验收脚本位于仓库 vela-quickapp/diagnostics/unified-runner-check.js。');
  const output = path.join(destination, name);
  if (check) {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== content) {
      throw new Error(`${name} 未同步，请运行 npm run sync:docs。`);
    }
  } else fs.writeFileSync(output, content, 'utf8');
}
console.log(check ? '文档已与 API 源文件同步。' : '已同步运行 API、UI API 及类型声明。');

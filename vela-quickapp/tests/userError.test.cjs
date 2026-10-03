const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function loadFormatter() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'core', 'userError.js'), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}

async function run() {
  const { createNativeError, formatError } = await loadFormatter();

  assert.equal(
    formatError(new Error('Failed to write script: 300'), '保存脚本 demo.js'),
    '保存脚本 demo.js：无法写入脚本文件（Vela 300：设备存储 I/O 错误）'
  );
  assert.equal(
    formatError(createNativeError('system.file', 'disk busy', 204), '读取脚本目录'),
    '读取脚本目录：系统接口请求超时（Vela 204：disk busy）'
  );
  assert.equal(
    formatError(new Error('文件正在编辑中，请先退出编辑器'), '删除脚本 demo.js'),
    '删除脚本 demo.js：文件正在编辑中，请先退出编辑器'
  );
  assert.equal(
    formatError(null, '保存编辑器设置'),
    '保存编辑器设置：本地运行时未返回错误详情'
  );
  assert.equal(
    formatError(new Error('internal_code_42'), '读取配置'),
    '读取配置：运行时错误「internal_code_42」'
  );
}

run().then(() => console.log('userError tests passed')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function loadModule() {
  const sourcePath = path.join(__dirname, '..', 'src', 'utils', 'files', 'transferIntegrity.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  return import(dataUrl);
}

async function run() {
  const integrity = await loadModule();
  assert.strictEqual(integrity.adler32(''), '00000001');
  assert.strictEqual(integrity.adler32('font'), '043901b8');
  assert.strictEqual(integrity.adler32Utf8('中文🙂'), '289406f7');

  const first = integrity.updateAdler32('fo', 1, 0);
  const second = integrity.updateAdler32('nt', first.a, first.b);
  assert.strictEqual(integrity.formatAdler32(second.a, second.b), integrity.adler32('font'));

  const binary = String.fromCharCode(0, 1, 127, 128, 255);
  assert.strictEqual(integrity.adler32(binary), '03850200');
  console.log('transferIntegrity tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function loadFormatter() {
  const sourcePath = path.join(__dirname, '..', 'src', 'utils', 'core', 'deviceInfo.js');
  const source = fs.readFileSync(sourcePath, 'utf8')
    .replace("import device from '@system.device';", 'const device = {};')
    .replace(/export default \{[\s\S]*?\};\s*$/, '');
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  return import(dataUrl);
}

async function run() {
  const { formatDeviceName } = await loadFormatter();
  assert.strictEqual(formatDeviceName({ brand: 'Xiaomi', model: 'Smart Band 9 Pro' }), 'Xiaomi Smart Band 9 Pro');
  assert.strictEqual(formatDeviceName({ manufacturer: 'Xiaomi', product: 'm66' }), 'Xiaomi m66');
  assert.strictEqual(formatDeviceName({ model: 'Band Pro' }), 'Band Pro');
  assert.strictEqual(formatDeviceName({ deviceType: 'band' }), 'JSLab 手环');
  assert.strictEqual(formatDeviceName({}), 'JSLab 设备');
  console.log('deviceInfo tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

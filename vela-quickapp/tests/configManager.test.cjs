const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function loadConfigManager(fileMock) {
  const sourcePath = path.join(__dirname, '..', 'src', 'utils', 'core', 'configManager.js');
  const source = fs.readFileSync(sourcePath, 'utf8')
    .replace("import file from '@system.file';", 'const file = globalThis.__configFileMock;');
  globalThis.__configFileMock = fileMock;
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  return (await import(dataUrl)).default;
}

async function run() {
  let storedText = JSON.stringify({
    editor: { font: { size: 18 }, highlight: { enabled: false } }
  });
  let accessCount = 0;
  let readCount = 0;
  let writeCount = 0;
  let failNextWrite = false;
  const fileMock = {
    access(options) {
      accessCount += 1;
      setTimeout(() => options.success(), 0);
    },
    readText(options) {
      readCount += 1;
      setTimeout(() => options.success({ text: storedText }), 0);
    },
    writeText(options) {
      writeCount += 1;
      setTimeout(() => {
        if (failNextWrite) {
          failNextWrite = false;
          options.fail(null, 300);
          return;
        }
        storedText = options.text;
        options.success();
      }, 0);
    }
  };

  const config = await loadConfigManager(fileMock);
  const values = await Promise.all([
    config.init(),
    config.get('editor.font.size', 16),
    config.get('editor.highlight.enabled', true)
  ]);
  assert.deepStrictEqual(values, [true, 18, false]);
  assert.strictEqual(accessCount, 1);
  assert.strictEqual(readCount, 1);

  assert.strictEqual(await config.get('editor.font.size', 16), 18);
  assert.strictEqual(accessCount, 1);
  assert.strictEqual(readCount, 1);

  await Promise.all([
    config.set('editor.font.size', 22),
    config.set('editor.highlight.enabled', true)
  ]);
  assert.strictEqual(writeCount, 2);
  assert.strictEqual(readCount, 1);
  assert.strictEqual(await config.get('editor.font.size', 16), 22);
  assert.strictEqual(await config.get('editor.highlight.enabled', false), true);

  failNextWrite = true;
  await assert.rejects(config.set('editor.font.size', 30), /Failed to write configuration/);
  assert.strictEqual(await config.get('editor.font.size', 16), 22);

  storedText = JSON.stringify({ editor: { font: { size: 26 } } });
  const snapshot = await config.reload();
  assert.strictEqual(snapshot.editor.font.size, 26);
  assert.strictEqual(await config.get('editor.font.size', 16), 26);
  assert.strictEqual(accessCount, 2);
  assert.strictEqual(readCount, 2);

  console.log('configManager tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildAiSystemPrompt, buildAiUserPrompt } = require('../jslab-cloud/lib/ai-prompts');
const { estimateTokenCount } = require('../jslab-cloud/lib/ai-service');
const vela = path.join(__dirname, '../../vela-quickapp');
const prompt = buildAiSystemPrompt();
const examples = [...prompt.matchAll(/```javascript\n([\s\S]*?)\n```/g)].map(match => new Function('console', 'ui', 'dialog', 'script', 'system', match[1]));

test('AI reference covers every exposed native module and documented method', () => {
  const runtime = fs.readFileSync(path.join(vela, 'src/utils/runtime/scriptRuntimeApi.js'), 'utf8');
  const systemBlock = runtime.slice(runtime.indexOf('system: {'));
  const exposed = [...systemBlock.matchAll(/^      (\w+)(?:[,:]|\r?$)/gm)].map(match => match[1]);
  const modules = {
    device: ['basic/device', 'device'], files: ['data/file', 'file'], http: ['network/fetch', 'fetch'],
    download: ['network/request', 'request'], upload: ['network/uploadtask', 'uploadtask'], companion: ['network/interconnect', 'interconnect'],
    network: ['system/network', 'network'], display: ['system/brightness', 'brightness'], battery: ['system/battery', 'battery'],
    location: ['system/geolocation', 'geolocation'], vibration: ['system/vibrator', 'vibrator'], events: ['system/event', 'event'],
    sensors: ['system/sensor', 'sensor'], recorder: ['system/record', 'record'], audio: ['other/audio', 'audio'], crypto: ['security/crypto', 'crypto']
  };
  assert.deepEqual(exposed.sort(), Object.keys(modules).sort());
  const renames = { 'fetch.fetch': 'request', 'request.download': 'start', 'request.onDownloadComplete': 'wait', 'uploadtask.uploadFile': 'file' };
  for (const [alias, [file, native]] of Object.entries(modules)) {
    assert.ok(prompt.includes(`system.${alias}`), alias);
    assert.ok(prompt.includes(`@system.${native}`), native);
    const docs = ['zh', 'en'].map(language => fs.readFileSync(path.join(vela, `VelaDocs/docs/${language}/features/${file}.md`), 'utf8')).join('\n');
    const methodPattern = new RegExp(`^### (?:UploadTask )?${native}\\.(\\w+)\\s*\\(`, 'gm');
    const methods = [...docs.matchAll(methodPattern)].map(match => renames[`${native}.${match[1]}`] || match[1]);
    assert.ok(methods.length, alias);
    for (const method of methods) assert.match(prompt, new RegExp(`\\b${method}\\(`), `${alias}.${method}`);
  }
  assert.match(prompt, /hashDigest[\s\S]*?同步返回摘要字符串/);
  assert.match(prompt, /system\.events[\s\S]*?同步返回订阅 id/);
  for (const method of ['generateKeys', 'getPrivateKey', 'getPublicKey', 'setPrivateKey', 'computeSecret']) assert.match(prompt, new RegExp(`\\b${method}\\(`));
  assert.match(prompt, /buffer 为 Uint8Array/);
  assert.match(prompt, /keyLen 单位 bytes/);
  assert.match(prompt, /progress 均需至少 160px/);
  assert.match(prompt, /y=84px/); assert.match(prompt, /y=12px/);
  assert.doesNotMatch(prompt, /102px|appVersion|manifestPackage|featureCount|云传输|设备环境：/);
});

test('request-specific source and filename appear only in the user message', () => {
  const request = { mode: 'rewrite', name: '统计.ui.js', prompt: '保留记录，支持零值\n增加取消操作', source: 'console.log("旧源码")' };
  const rewritten = buildAiUserPrompt(request);
  assert.ok(rewritten.includes(request.prompt)); assert.ok(rewritten.includes(request.source));
  assert.match(rewritten, /文件名："统计\.ui\.js"/);
  assert.match(rewritten, /改写现有脚本/);
  assert.doesNotMatch(buildAiUserPrompt({ ...request, mode: 'create' }), /旧源码|现有源码/);
  assert.equal(buildAiSystemPrompt(request.name, { appVersion: 'untrusted' }), prompt);
  assert.doesNotMatch(prompt, /统计\.ui\.js|untrusted/);
});

test('token estimates account for mixed code, Chinese, and uncommon Unicode', () => {
  for (const text of ['const value = 0;\n'.repeat(100), '请保留用户数据，并允许输入零。'.repeat(100), '😀é\u{20000}\ud800'.repeat(100), prompt]) {
    const estimated = estimateTokenCount(text);
    assert.ok(Number.isSafeInteger(estimated)); assert.ok(estimated > 0);
  }
  assert.ok(estimateTokenCount('a'.repeat(3000)) < 1500);
  assert.ok(estimateTokenCount('中文'.repeat(500)) < Buffer.byteLength('中文'.repeat(500)));
});

test('storage example saves zero, preserves data on cancel, and returns rejections', async () => {
  assert.equal(examples.length, 3);
  for (const action of ['confirm', 'cancel']) {
    const saved = []; const logged = [];
    await examples[0]({ log: (...args) => logged.push(args) }, {}, { number: async () => ({ action, value: action === 'confirm' ? 0 : null }) }, {
      data: { get: async () => 5, set: async (...args) => saved.push(args) }
    }, {});
    assert.deepEqual(saved, action === 'confirm' ? [['target', 0]] : []);
    assert.equal(logged.length, action === 'confirm' ? 1 : 0);
  }
  await assert.rejects(examples[0]({}, {}, { number: async () => { throw new Error('DIALOG_BUSY'); } }, { data: { get: async () => 5 } }, {}), /DIALOG_BUSY/);
});

test('UI example runs against the real UI compiler and updates without render side effects', async () => {
  const layoutSource = fs.readFileSync(path.join(vela, 'src/utils/runtime/uiLayout.js'), 'utf8');
  const layoutUrl = 'data:text/javascript;base64,' + Buffer.from(layoutSource).toString('base64');
  const runtimeSource = fs.readFileSync(path.join(vela, 'src/utils/runtime/uiRuntime.js'), 'utf8').replace("'./uiLayout.js'", JSON.stringify(layoutUrl));
  const { createUiSession } = await import('data:text/javascript;base64,' + Buffer.from(runtimeSource).toString('base64'));
  let nodes; let hidden = false;
  const session = createUiSession({ top: () => 84, show: () => true, hide: () => { hidden = true; }, publish: next => { nodes = next; }, error: error => { throw error; } });
  examples[1]({}, session.ui, {}, {}, {});
  assert.equal(nodes[0].y, 84);
  assert.equal(nodes[1].text, '当前次数：0');
  assert.equal(session.invoke('add'), true);
  await Promise.resolve();
  assert.equal(nodes[1].text, '当前次数：1');
  session.invoke('logs'); assert.equal(hidden, true);
  session.dispose();
});

test('network example checks capabilities and handles HTTP and native failures', () => {
  const logged = []; const errors = []; const warnings = [];
  const console = { log: (...args) => logged.push(args), error: (...args) => errors.push(args), warn: (...args) => warnings.push(args) };
  let calls = 0; let request;
  const system = { http: { request: options => { calls += 1; request = options; } } };
  const run = supported => examples[2](console, {}, {}, { canUse: capability => { assert.equal(capability, '@system.fetch.fetch'); return supported; } }, system);
  run(false); assert.equal(calls, 0); assert.equal(warnings.length, 1);
  run(true); assert.equal(calls, 1);
  request.success({ code: 200, data: 'ok' }); assert.deepEqual(logged, [['ok']]);
  request.success({ code: 500 }); request.fail('offline', 300);
  assert.equal(errors.length, 2); assert.equal(errors[1][1], 300);
});

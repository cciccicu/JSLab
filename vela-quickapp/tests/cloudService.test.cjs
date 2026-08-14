const assert = require('assert');
const fs = require('fs');
const path = require('path');
let loadSequence = 0;

function adler32(value) {
  let a = 1; let b = 0;
  for (const byte of Buffer.from(value, 'utf8')) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  return ((b * 65536 + a) >>> 0).toString(16).padStart(8, '0');
}

async function loadService(harness) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'cloud', 'cloudService.js'), 'utf8')
    .replace("import fetch from '@system.fetch';", 'const fetch = globalThis.__cloudFetch;')
    .replace("import app from '@system.app';", 'const app = globalThis.__cloudApp;')
    .replace("import configManager from '../core/configManager.js';", 'const configManager = globalThis.__cloudConfig;')
    .replace("import jsManager from '../files/jsManager.js';", 'const jsManager = globalThis.__cloudJsManager;')
    .replace("import { adler32 } from '../files/transferIntegrity.js';", 'const adler32 = globalThis.__cloudAdler32;')
    .replace("import companionBridge from './companionBridge.js';", 'const companionBridge = globalThis.__cloudCompanionBridge;');
  globalThis.__cloudFetch = harness.fetch;
  globalThis.__cloudApp = harness.app;
  globalThis.__cloudConfig = harness.config;
  globalThis.__cloudJsManager = harness.jsManager;
  globalThis.__cloudAdler32 = adler32;
  globalThis.__cloudCompanionBridge = harness.companionBridge;
  return (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64') + '#' + (++loadSequence))).default;
}

function createHarness(options = {}) {
  const files = Object.assign({}, options.files || {});
  const configValues = Object.assign({ 'cloud.origin': 'https://cloud.test', 'cloud.token': 'token', 'cloud.transport': 'fetch' }, options.configValues || {});
  const calls = []; const configGets = [];
  const cloudScripts = options.cloudScripts || [{ id: 7, name: 'cloud.js' }];
  const fetch = { fetch(request) {
    calls.push(request);
    if (options.fetchFailure) return request.fail(null, options.fetchFailure);
    const pathname = new URL(request.url).pathname;
    if (pathname.endsWith('/api/cloud/device/pairing/start')) return request.success({ code: 200, data: { ok: true, code: 'ABCDEF12', qrValue: 'https://ccicc.icu/jslab-cloud/pair?code=ABCDEF12', expiresIn: 600 } });
    if (pathname.endsWith('/api/cloud/device/pairing/status')) return request.success({ code: 200, data: { ok: true, status: 'claimed' } });
    if (pathname.endsWith('/api/cloud/device/pairing/cancel')) return request.success({ code: 200, data: { ok: true, cancelled: true } });
    if (pathname.endsWith('/api/cloud/device/exchange')) return request.success({ code: 200, data: { ok: true, token: 'new-token' } });
    if (pathname.endsWith('/api/cloud/device/entitlements')) return request.success({ code: 200, data: { ok: true, entitlement: { cloudEnabled: true, aiEnabled: true, aiCreditCents: 200 } } });
    if (pathname.endsWith('/api/cloud/device/revoke')) return request.success({ code: 200, data: { ok: true, revoked: true } });
    if (pathname.endsWith('/api/cloud/market')) return request.success({ code: 200, data: { ok: true, scripts: [{ id: 3, name: 'market.js' }] } });
    if (pathname.endsWith('/api/cloud/market/3/source')) return request.success({ code: 200, data: { ok: true, script: { id: 3, name: 'market.js', source: 'console.log(3)', checksum: adler32('console.log(3)') } } });
    if (pathname.endsWith('/api/cloud/scripts') && request.method === 'GET') return request.success({ code: 200, data: { ok: true, scripts: cloudScripts } });
    if (pathname.endsWith('/api/cloud/scripts/7') && request.method === 'GET') return request.success({ code: 200, data: { ok: true, script: { id: 7, name: 'cloud.js' }, source: 'console.log(7)' } });
    if ((request.method === 'POST' || request.method === 'PUT') && pathname.includes('/api/cloud/')) return request.success({ code: 200, data: { ok: true, id: 7 } });
    if (request.method === 'DELETE' && pathname.endsWith('/api/cloud/device/scripts/7')) return request.success({ code: 200, data: { ok: true, id: 7, deleted: true } });
    request.fail(null, 999);
  } };
  return {
    files, calls, configValues, configGets,
    app: { canIUse() { return options.fetchSupported !== false; } }, fetch,
    config: {
      get(key, fallback) { configGets.push(key); return Promise.resolve(Object.prototype.hasOwnProperty.call(configValues, key) ? configValues[key] : fallback); },
      set(key, value) { configValues[key] = value; return Promise.resolve(true); }
    },
    jsManager: {
      list() { return Promise.resolve(Object.keys(files).map((name) => ({ name }))); },
      read(name) { return Promise.resolve(files[name]); },
      write(name, source) { files[name] = source; return Promise.resolve(true); }
    },
    companionBridge: { requestCloud(request) {
      return options.proxyFailure ? Promise.reject(new Error(options.proxyFailure)) : Promise.resolve({ status: 200, body: JSON.stringify({ ok: true, request }) });
    } }
  };
}

async function run() {
  const pairing = createHarness(); const pairingService = await loadService(pairing);
  const started = await pairingService.startPairing('Band Pro');
  assert.equal(started.code, 'ABCDEF12');
  assert.equal((await pairingService.pollPairing(started.code)).status, 'claimed');
  await pairingService.exchangePairing(started.code, 'Band Pro');
  assert.equal(pairing.configValues['cloud.token'], 'new-token');
  await pairingService.cancelPairing(started.code);

  const offline = createHarness({ fetchFailure: 1001 });
  const offlineService = await loadService(offline);
  await assert.rejects(offlineService.listCloudScripts(), /cloud_network_unavailable/);
  assert.equal(offlineService.errorMessage(await offlineService.listCloudScripts().catch(error => error), '读取失败'), '需要联网后重试');

  const proxyOffline = createHarness({
    configValues: { 'cloud.origin': 'https://cloud.test', 'cloud.token': 'token', 'cloud.transport': 'interconnect' },
    proxyFailure: 'cloud proxy network request failed'
  });
  const proxyOfflineService = await loadService(proxyOffline);
  await assert.rejects(proxyOfflineService.listCloudScripts(), /cloud_network_unavailable/);

  const proxyMissing = createHarness({
    configValues: { 'cloud.origin': 'https://cloud.test', 'cloud.token': 'token', 'cloud.transport': 'interconnect' },
    proxyFailure: 'cloud_proxy_unavailable'
  });
  const proxyMissingService = await loadService(proxyMissing);
  assert.equal(proxyMissingService.errorMessage(await proxyMissingService.listCloudScripts().catch(error => error), '读取失败'), '请先连接 AstroBox');

  const proxySendFailure = createHarness({
    configValues: { 'cloud.origin': 'https://cloud.test', 'cloud.token': 'token', 'cloud.transport': 'interconnect' },
    proxyFailure: 'cloud_proxy_send_1001'
  });
  const proxySendFailureService = await loadService(proxySendFailure);
  assert.equal(proxySendFailureService.errorMessage(await proxySendFailureService.listCloudScripts().catch(error => error), '读取失败'), '需要联网后重试');

  const legacy = createHarness({ configValues: { 'cloud.origin': 'https://jslab-api.ccicc.icu' } });
  const legacyService = await loadService(legacy);
  await legacyService.listCloudScripts();
  assert.match(legacy.calls[0].url, /^http:\/\/192\.168\.3\.17:3000\/jslab-cloud\/api\/cloud\/scripts$/);

  const upload = createHarness({ files: { 'cloud.js': 'console.log("local")' } });
  const uploadService = await loadService(upload);
  await uploadService.uploadScript('cloud.js');
  const uploadCall = upload.calls.find((call) => call.method === 'PUT');
  assert.ok(uploadCall);
  assert.deepEqual(JSON.parse(uploadCall.data), { name: 'cloud.js', source: 'console.log("local")' });

  const download = createHarness({ files: {} }); const downloadService = await loadService(download);
  await downloadService.downloadScript(7, 'cloud.js', false);
  assert.equal(download.files['cloud.js'], 'console.log(7)');
  await assert.rejects(downloadService.downloadScript(7, 'cloud.js', false), /file_exists/);
  await downloadService.downloadScript(7, 'renamed.js', false);
  assert.equal(download.files['renamed.js'], 'console.log(7)');
  await downloadService.deleteCloudScript(7);
  assert.ok(download.calls.some((call) => call.method === 'DELETE' && call.url.includes('/api/cloud/device/scripts/7')));

  const market = createHarness({ files: {} }); const marketService = await loadService(market);
  await marketService.downloadMarketScript(3, false);
  assert.equal(market.files['market.js'], 'console.log(3)');
  await assert.rejects(marketService.downloadMarketScript(3, false), /file_exists/);
  await marketService.downloadMarketScript(3, true);

  assert.equal(typeof marketService.sync, 'undefined');
  assert.equal(typeof marketService.previewSync, 'undefined');
  assert.ok(!market.configGets.some((key) => /^cloud\.(scripts|lastSync|lastError)$/.test(key)));

  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'cloud', 'cloudService.js'), 'utf8');
  assert.doesNotMatch(source, /performSync|previewSync|cloud\.scripts|cloud\.lastSync|cloud\.lastError|\/api\/cloud\/sync/);
  assert.doesNotMatch(source, /result\.version/);
  const pairingPage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'settings', 'cloud', 'cloud.ux'), 'utf8');
  assert.match(pairingPage, /<qrcode value="\{\{pairingQr\}\}"/);
  assert.match(pairingPage, /剩余/);
  assert.match(pairingPage, /clearInterval\(this\.pairingTimer\)/);
  assert.match(pairingPage, /pairingPollBusy/);
  assert.doesNotMatch(pairingPage, /disabled=/);
  const cloudPage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'settings', 'cloud', 'files', 'files.ux'), 'utf8');
  assert.match(cloudPage, /for="\{\{\(index, script\) in cloudScripts\}\}"/);
  assert.match(cloudPage, /selectedFileIndex === index/);
  assert.doesNotMatch(cloudPage, /localScripts|listLocalScripts|点击上传/);
  assert.doesNotMatch(cloudPage, /disabled=/);
  const homePage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'index', 'index.ux'), 'utf8');
  assert.match(homePage, /common\/images\/cloud\.png/);
  assert.match(homePage, /@click="uploadSelected"/);
  assert.doesNotMatch(homePage, /disabled=/);
}

run().then(() => console.log('cloudService tests passed')).catch((error) => { console.error(error); process.exitCode = 1; });

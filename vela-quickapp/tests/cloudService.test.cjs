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
  const userErrorSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'core', 'userError.js'), 'utf8');
  globalThis.__cloudUserError = await import('data:text/javascript;base64,' + Buffer.from(userErrorSource).toString('base64') + '#user-error-' + (++loadSequence));
  const transportSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'cloud', 'cloudTransport.js'), 'utf8')
    .replace("import fetch from '@system.fetch';", 'const fetch = globalThis.__cloudFetch;')
    .replace("import configManager from '../core/configManager.js';", 'const configManager = globalThis.__cloudConfig;')
    .replace("import companionBridge from './companionBridge.js';", 'const companionBridge = globalThis.__cloudCompanionBridge;')
    .replace("import { cleanDetail, createNativeError, formatError } from '../core/userError.js';", 'const { cleanDetail, createNativeError, formatError } = globalThis.__cloudUserError;');
  globalThis.__cloudFetch = harness.fetch;
  globalThis.__cloudConfig = harness.config;
  globalThis.__cloudJsManager = harness.jsManager;
  globalThis.__cloudAdler32 = adler32;
  globalThis.__cloudCompanionBridge = harness.companionBridge;
  globalThis.__cloudTransport = await import('data:text/javascript;base64,' + Buffer.from(transportSource).toString('base64') + '#' + (++loadSequence));
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'cloud', 'cloudService.js'), 'utf8')
    .replace("import { RUNTIME_CONTRACT } from '../runtime/runtimeContract.js';", "const RUNTIME_CONTRACT = 'jslab-unified-open-ui';")
    .replace("import configManager from '../core/configManager.js';", 'const configManager = globalThis.__cloudConfig;')
    .replace("import jsManager from '../files/jsManager.js';", 'const jsManager = globalThis.__cloudJsManager;')
    .replace("import { adler32Utf8 } from '../files/transferIntegrity.js';", 'const adler32Utf8 = globalThis.__cloudAdler32;')
    .replace("import { request, normalizeTransport, isDirectFetchSupported, isNetworkError, errorMessage } from './cloudTransport.js';", 'const { request, normalizeTransport, isDirectFetchSupported, isNetworkError, errorMessage } = globalThis.__cloudTransport;');
  return (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64') + '#' + (++loadSequence))).default;
}

function createHarness(options = {}) {
  const files = Object.assign({}, options.files || {});
  const configValues = Object.assign({ 'cloud.origin': 'https://cloud.test', 'cloud.token': 'token', 'cloud.transport': 'fetch' }, options.configValues || {});
  const calls = []; const configGets = []; const proxyCalls = [];
  let canIUseCalls = 0;
  const cloudScripts = options.cloudScripts || [{ id: 7, name: 'cloud.js' }];
  const fetch = { fetch(request) {
    calls.push(request);
    if (options.httpFailure) {
      const body = options.httpFailure.body === undefined
        ? JSON.stringify({ ok: false, error: options.httpFailure.error })
        : options.httpFailure.body;
      return request.fail(body, options.httpFailure.status);
    }
    if (options.fetchFailure) return request.fail(null, options.fetchFailure);
    const pathname = new URL(request.url).pathname;
    if (options.responses && Object.prototype.hasOwnProperty.call(options.responses, pathname)) {
      return request.success({ code: 200, data: options.responses[pathname] });
    }
    if (pathname.endsWith('/api/cloud/device/pairing/start')) return request.success({ code: 200, data: { ok: true, code: 'ABCDEF12', qrValue: 'https://ccicc.icu/jslab-cloud/pair?code=ABCDEF12', expiresIn: 600 } });
    if (pathname.endsWith('/api/cloud/device/pairing/status')) return request.success({ code: 200, data: { ok: true, status: 'claimed' } });
    if (pathname.endsWith('/api/cloud/device/pairing/cancel')) return request.success({ code: 200, data: { ok: true, cancelled: true } });
    if (pathname.endsWith('/api/cloud/device/exchange')) return request.success({ code: 200, data: { ok: true, token: 'new-token' } });
    if (pathname.endsWith('/api/cloud/device/entitlements')) return request.success({ code: 200, data: { ok: true, runtimeContract: 'jslab-unified-open-ui', entitlement: { cloudEnabled: true, aiEnabled: true, aiCreditCents: 200 } } });
    if (pathname.endsWith('/api/cloud/device/revoke')) return request.success({ code: 200, data: { ok: true, revoked: true } });
    if (pathname.endsWith('/api/cloud/market')) return request.success({ code: 200, data: { ok: true, scripts: [{ id: 3, name: 'market.js' }] } });
    if (pathname.endsWith('/api/cloud/market/3/source')) {
      const source = 'console.log("中文🙂")';
      return request.success({ code: 200, data: { ok: true, script: { id: 3, name: 'market.js', source, checksum: adler32(source) } } });
    }
    if (pathname.endsWith('/api/cloud/scripts') && request.method === 'GET') return request.success({ code: 200, data: { ok: true, scripts: cloudScripts } });
    if (pathname.endsWith('/api/cloud/scripts/7') && request.method === 'GET') return request.success({ code: 200, data: { ok: true, script: { id: 7, name: 'cloud.js' }, source: 'console.log(7)' } });
    if ((request.method === 'POST' || request.method === 'PUT') && pathname.includes('/api/cloud/')) return request.success({ code: 200, data: { ok: true, id: 7 } });
    if (request.method === 'DELETE' && pathname.endsWith('/api/cloud/device/scripts/7')) return request.success({ code: 200, data: { ok: true, id: 7, deleted: true } });
    request.fail(null, 999);
  } };
  return {
    files, calls, configValues, configGets, fetch, proxyCalls,
    app: { canIUse() { canIUseCalls += 1; return options.fetchSupported !== false; } },
    getCanIUseCalls() { return canIUseCalls; },
    config: {
      get(key, fallback) { configGets.push(key); return Promise.resolve(Object.prototype.hasOwnProperty.call(configValues, key) ? configValues[key] : fallback); },
      set(key, value) { configValues[key] = value; return Promise.resolve(true); }
    },
    jsManager: {
      list() { return Promise.resolve(Object.keys(files).map((name) => ({ name }))); },
      read(name) { return Promise.resolve(files[name]); },
      write(name, source) { files[name] = source; return Promise.resolve(true); }
    },
    companionBridge: { requestCloud(request, timeoutMs) {
      proxyCalls.push({ request, timeoutMs });
      const body = options.responses && options.responses[new URL(request.url).pathname];
      return options.proxyFailure ? Promise.reject(new Error(options.proxyFailure)) : Promise.resolve({ status: 200, body: JSON.stringify(body || { ok: true, request }) });
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

  const malformedPairing = createHarness({ responses: { '/api/cloud/device/exchange': { ok: true } } });
  await assert.rejects((await loadService(malformedPairing)).exchangePairing('code'), /cloud_invalid_response/);
  assert.equal(malformedPairing.configValues['cloud.token'], 'token', 'Invalid exchange must preserve the existing token');
  for (const response of [[], '"text"', null, { ok: true }, { scripts: [null] }]) {
    const malformed = createHarness({ responses: { '/api/cloud/scripts': response } });
    await assert.rejects((await loadService(malformed)).listCloudScripts(), /cloud_invalid_response/);
  }
  const checksumSource = 'console.log("中文😀")';
  for (const checksum of ['00000000', '', 123, adler32(checksumSource)]) {
    const checked = createHarness({ responses: {
      '/api/cloud/scripts/7': { script: { name: 'checked.js' }, source: checksumSource, checksum }
    } });
    const checkedService = await loadService(checked);
    if (checksum === adler32(checksumSource)) {
      await checkedService.downloadScript(7);
      assert.equal(checked.files['checked.js'], checksumSource);
    } else {
      await assert.rejects(checkedService.downloadScript(7), /checksum_mismatch/);
      assert.deepEqual(checked.files, {}, 'Checksum failures must not write local files');
    }
  }
  const slowAi = createHarness({ configValues: { 'cloud.transport': 'interconnect' }, responses: {
    '/api/cloud/device/entitlements': { runtimeContract: 'jslab-unified-open-ui', entitlement: { aiEnabled: true } },
    '/api/cloud/device/ai/generate': { runtimeContract: 'jslab-unified-open-ui', code: 'console.log(1)' }
  } });
  await (await loadService(slowAi)).generateAi('create', 'test');
  assert.equal(slowAi.proxyCalls[0].timeoutMs, undefined);
  assert.equal(slowAi.proxyCalls[1].timeoutMs, 330000);

  const offline = createHarness({ fetchFailure: 1001 });
  const offlineService = await loadService(offline);
  await assert.rejects(offlineService.listCloudScripts(), /cloud_network_unavailable/);
  assert.equal(offlineService.errorMessage(await offlineService.listCloudScripts().catch(error => error), '读取云空间'), '读取云空间：fetch 直连请求未完成（Vela 1001）');

  for (const [code, key, text] of [
    [202, 'cloud_fetch_invalid_parameters', 'fetch 直连参数无效（Vela 202）'],
    [203, 'cloud_fetch_unavailable', '当前设备不支持 fetch 直连，请切换 AstroBox 网络桥接（Vela 203）'],
    [204, 'cloud_fetch_timeout', 'fetch 直连请求超时（Vela 204）'],
    [300, 'cloud_fetch_io_error', 'fetch 直连发生网络 I/O 错误（Vela 300）']
  ]) {
    const nativeHarness = createHarness({ fetchFailure: code });
    const nativeService = await loadService(nativeHarness);
    const nativeError = await nativeService.startPairing('Band Pro').catch(error => error);
    assert.equal(nativeError.message, key);
    assert.equal(nativeService.errorMessage(nativeError, '生成配对二维码'), '生成配对二维码：' + text);
  }

  const unknownNativeHarness = createHarness({ fetchFailure: 999 });
  const unknownNativeService = await loadService(unknownNativeHarness);
  const unknownNativeError = await unknownNativeService.market('').catch(error => error);
  assert.equal(unknownNativeService.errorMessage(unknownNativeError, '读取市场'), '读取市场：fetch 直连请求未完成（Vela 999）');

  const staleToken = createHarness({ httpFailure: { status: 401, error: 'device_auth_required' } });
  const staleTokenService = await loadService(staleToken);
  const staleTokenError = await staleTokenService.getEntitlements().catch(error => error);
  assert.equal(staleTokenError.status, 401);
  assert.equal(staleTokenError.message, 'device_auth_required');
  assert.equal(staleTokenService.isNetworkError(staleTokenError), false);
  assert.equal(staleTokenService.errorMessage(staleTokenError, '验证云账户'), '验证云账户：设备令牌未被云服务认可，请重新配对');
  assert.equal(staleToken.configValues['cloud.token'], '');

  const staleLogout = createHarness({ httpFailure: { status: 401, error: 'device_auth_required' } });
  const staleLogoutService = await loadService(staleLogout);
  assert.deepEqual(await staleLogoutService.logout(), { revoked: false, alreadyRevoked: true });
  assert.equal(staleLogout.configValues['cloud.token'], '');

  const directFetch = createHarness();
  const directFetchService = await loadService(directFetch);
  assert.equal(directFetchService.isDirectFetchSupported(), true);
  assert.equal(directFetch.getCanIUseCalls(), 0);

  const proxyOffline = createHarness({
    configValues: { 'cloud.origin': 'https://cloud.test', 'cloud.token': 'token', 'cloud.transport': 'interconnect' },
    proxyFailure: 'cloud proxy network request failed'
  });
  const proxyOfflineService = await loadService(proxyOffline);
  await assert.rejects(proxyOfflineService.listCloudScripts(), /cloud_proxy_network_error/);
  assert.equal(
    proxyOfflineService.errorMessage(await proxyOfflineService.listCloudScripts().catch(error => error), '读取云空间'),
    '读取云空间：AstroBox 已收到请求，但访问云服务失败'
  );

  const proxyMissing = createHarness({
    configValues: { 'cloud.origin': 'https://cloud.test', 'cloud.token': 'token', 'cloud.transport': 'interconnect' },
    proxyFailure: 'cloud_proxy_unavailable'
  });
  const proxyMissingService = await loadService(proxyMissing);
  assert.equal(proxyMissingService.errorMessage(await proxyMissingService.listCloudScripts().catch(error => error), '读取云空间'), '读取云空间：AstroBox 尚未连接，无法使用网络桥接');

  const proxySendFailure = createHarness({
    configValues: { 'cloud.origin': 'https://cloud.test', 'cloud.token': 'token', 'cloud.transport': 'interconnect' },
    proxyFailure: 'cloud_proxy_send_1001'
  });
  const proxySendFailureService = await loadService(proxySendFailure);
  assert.equal(proxySendFailureService.errorMessage(await proxySendFailureService.listCloudScripts().catch(error => error), '读取云空间'), '读取云空间：手环无法把网络请求发送给 AstroBox（Vela 1001）');

  const unknownHttp = createHarness({ httpFailure: { status: 418, error: 'teapot_mode', body: JSON.stringify({ ok: false, error: 'teapot_mode', message: '茶壶拒绝煮咖啡' }) } });
  const unknownHttpService = await loadService(unknownHttp);
  const unknownHttpError = await unknownHttpService.market('').catch(error => error);
  assert.equal(unknownHttpService.errorMessage(unknownHttpError, '读取市场'), '读取市场：云服务返回 HTTP 418：茶壶拒绝煮咖啡');

  const invalidResponse = createHarness({ httpFailure: { status: 502, body: '<html>gateway</html>' } });
  const invalidResponseService = await loadService(invalidResponse);
  const invalidResponseError = await invalidResponseService.market('').catch(error => error);
  assert.equal(invalidResponseService.errorMessage(invalidResponseError, '读取市场'), '读取市场：云服务返回了无法解析的响应（HTTP 502）');

  assert.notEqual(unknownHttpService.errorMessage(new Error('unmapped_cloud_error'), '读取市场'), '通用提示');

  for (const origin of [
    '',
    'http://192.168.3.17:3000/jslab-cloud',
    'http://jslab-api.ccicc.icu',
    'http://jslab-api.ccicc.icu/jslab-cloud',
    'https://jslab-api.ccicc.icu',
    'https://jslab-api.ccicc.icu/jslab-cloud/',
    ' HTTPS://JSLAB-API.CCICC.ICU/ ',
    'https://ccicc.icu/jslab-cloud'
  ]) {
    const production = createHarness({ configValues: { 'cloud.origin': origin } });
    const productionService = await loadService(production);
    await productionService.listCloudScripts();
    assert.equal(production.calls[0].url, 'http://jslab-api.ccicc.icu/api/cloud/scripts');
  }

  const customOrigin = createHarness({ configValues: { 'cloud.origin': 'https://private-cloud.example/base/' } });
  const customOriginService = await loadService(customOrigin);
  await customOriginService.listCloudScripts();
  assert.equal(customOrigin.calls[0].url, 'https://private-cloud.example/base/api/cloud/scripts');

  const upload = createHarness({ files: { 'cloud.js': 'console.log("local")' } });
  const uploadService = await loadService(upload);
  await uploadService.uploadScript('cloud.js');
  const uploadCall = upload.calls.find((call) => call.method === 'PUT');
  assert.ok(uploadCall);
  assert.deepEqual(JSON.parse(uploadCall.data), { name: 'cloud.js', source: 'console.log("local")' });

  const marketUpload = createHarness({ files: { 'local.js': 'console.log("watch")' }, responses: {
    '/api/cloud/device/market/submit': { status: 'pending', marketId: 17 }
  } });
  const marketUploadService = await loadService(marketUpload);
  const marketResult = await marketUploadService.submitMarketScript('local.js', {
    name: '公开名称', description: '用途说明', tags: '工具, 示例'
  });
  assert.equal(marketResult.marketId, 17);
  const marketCall = marketUpload.calls.find((call) => call.url.endsWith('/api/cloud/device/market/submit'));
  assert.equal(marketCall.method, 'POST');
  assert.deepEqual(JSON.parse(marketCall.data), {
    marketName: '公开名称', marketDescription: '用途说明', marketTags: '工具, 示例', source: 'console.log("watch")'
  });
  const bridgedMarket = createHarness({ files: { 'local.js': 'console.log(1)' },
    configValues: { 'cloud.transport': 'interconnect' } });
  await (await loadService(bridgedMarket)).submitMarketScript('local.js', { name: '工具', description: '说明' });
  assert.equal(bridgedMarket.proxyCalls[0].timeoutMs, 330000);

  const chineseName = '中文工具（测试）.ui.js';
  const chineseUpload = createHarness({ files: { [chineseName]: 'console.log("你好")' }, cloudScripts: [{ id: 7, name: chineseName }] });
  const chineseService = await loadService(chineseUpload);
  await chineseService.uploadScript(chineseName);
  const chineseUploadCall = chineseUpload.calls.find(call => call.method === 'PUT');
  assert.deepEqual(JSON.parse(chineseUploadCall.data), { name: chineseName, source: 'console.log("你好")' });
  assert(chineseUploadCall.url.endsWith('/api/cloud/scripts/7'), 'Chinese overwrite matching must use the original filename');

  const download = createHarness({ files: {} }); const downloadService = await loadService(download);
  await downloadService.downloadScript(7, 'cloud.js', false);
  assert.equal(download.files['cloud.js'], 'console.log(7)');
  await assert.rejects(downloadService.downloadScript(7, 'cloud.js', false), /file_exists/);
  await downloadService.downloadScript(7, 'renamed.js', false);
  assert.equal(download.files['renamed.js'], 'console.log(7)');
  await downloadService.downloadScript(7, chineseName, false);
  assert.equal(download.files[chineseName], 'console.log(7)');
  await downloadService.deleteCloudScript(7);
  assert.ok(download.calls.some((call) => call.method === 'DELETE' && call.url.includes('/api/cloud/device/scripts/7')));

  const market = createHarness({ files: {} }); const marketService = await loadService(market);
  await marketService.downloadMarketScript(3, false);
  assert.equal(market.files['market.js'], 'console.log("中文🙂")');
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

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
    .replace("import { cleanDetail, createNativeError } from '../core/userError.js';", 'const { cleanDetail, createNativeError } = globalThis.__cloudUserError;')
    .replace("import { IS_COMMUNITY_EDITION } from '../core/edition.js';", 'const IS_COMMUNITY_EDITION = globalThis.__cloudCommunityEdition;');
  globalThis.__cloudFetch = harness.fetch;
  globalThis.__cloudConfig = harness.config;
  globalThis.__cloudJsManager = harness.jsManager;
  globalThis.__cloudCommunityEdition = harness.communityEdition === true;
  globalThis.__cloudAdler32 = adler32;
  globalThis.__cloudTransport = await import('data:text/javascript;base64,' + Buffer.from(transportSource).toString('base64') + '#' + (++loadSequence));
  globalThis.__cloudTransport.setCloudProxyRequest(harness.companionBridge.requestCloud.bind(harness.companionBridge));
  globalThis.__cloudError = await import('data:text/javascript;base64,' + Buffer.from(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'cloud', 'cloudError.js'), 'utf8')
      .replace("import { cleanDetail, formatError } from '../core/userError.js';", 'const { cleanDetail, formatError } = globalThis.__cloudUserError;')
  ).toString('base64') + '#' + (++loadSequence));
  const loadCloudModule = (name, replacements) => {
    let source = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'cloud', name), 'utf8');
    for (const [original, replacement] of replacements) {
      assert.ok(source.includes(original), `${name} import changed: ${original}`);
      source = source.replace(original, replacement);
    }
    return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64') + '#' + (++loadSequence));
  };
  globalThis.__cloudResponse = await loadCloudModule('cloudResponse.js', [
    ["import { adler32Utf8 } from '../files/transferIntegrity.js';", 'const adler32Utf8 = globalThis.__cloudAdler32;']
  ]);
  globalThis.__cloudTextEncoding = await import('data:text/javascript;base64,' + Buffer.from(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'files', 'textEncoding.js'), 'utf8')
  ).toString('base64') + '#' + (++loadSequence));
  globalThis.__cloudMarketFilename = await loadCloudModule('marketFilename.js', [
    ["import { utf8ByteLength } from '../files/textEncoding.js';", 'const { utf8ByteLength } = globalThis.__cloudTextEncoding;']
  ]);
  globalThis.__cloudAccount = (await loadCloudModule('deviceAccount.js', [
    ["import configManager from '../core/configManager.js';", 'const configManager = globalThis.__cloudConfig;'],
    ["import { request, normalizeTransport } from './cloudTransport.js';", 'const { request, normalizeTransport } = globalThis.__cloudTransport;']
  ])).default;
  const ai = (await loadCloudModule('deviceAi.js', [
    ["import { RUNTIME_CONTRACT } from '../runtime/runtimeContract.js';", "const RUNTIME_CONTRACT = 'jslab-unified-open-ui';"],
    ["import deviceAccount from './deviceAccount.js';", 'const deviceAccount = globalThis.__cloudAccount;'],
    ["import { request } from './cloudTransport.js';", 'const { request } = globalThis.__cloudTransport;']
  ])).default;
  const domainImports = [
    ["import jsManager from '../files/jsManager.js';", 'const jsManager = globalThis.__cloudJsManager;'],
    ["import { request } from './cloudTransport.js';", 'const { request } = globalThis.__cloudTransport;'],
    ["import { scriptList, verifySourceChecksum } from './cloudResponse.js';", 'const { scriptList, verifySourceChecksum } = globalThis.__cloudResponse;']
  ];
  const market = (await loadCloudModule('marketClient.js', domainImports.concat([
    ["import { normalizeMarketSaveName } from './marketFilename.js';", 'const { normalizeMarketSaveName } = globalThis.__cloudMarketFilename;']
  ]))).default;
  const files = (await loadCloudModule('cloudFilesClient.js', domainImports)).default;
  return Object.assign({}, globalThis.__cloudTransport, globalThis.__cloudError, globalThis.__cloudAccount, ai, market, files, {
    suggestMarketFilename: globalThis.__cloudMarketFilename.suggestMarketFilename,
    normalizeMarketSaveName: globalThis.__cloudMarketFilename.normalizeMarketSaveName
  });
}

function createHarness(options = {}) {
  const files = Object.assign({}, options.files || {});
  const configValues = Object.assign({ 'cloud.origin': 'https://cloud.test', 'cloud.token': 'token', 'cloud.transport': 'fetch' }, options.configValues || {});
  const calls = []; const configGets = []; const proxyCalls = [];
  let canIUseCalls = 0;
  const cloudScripts = options.cloudScripts || [{ id: 7, name: 'cloud.js' }];
  const fetch = { fetch(request) {
    calls.push(request);
    if (options.pendingFetch) return;
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
    if (pathname.endsWith('/api/cloud/device/market')) return request.success({ code: 200, data: { ok: true, scripts: [{ id: 3, name: 'market.js', authorName: '测试作者' }] } });
    if (pathname.endsWith('/api/cloud/device/market/3/source')) {
      const source = 'console.log("中文🙂")';
      return request.success({ code: 200, data: { ok: true, script: { id: 3, name: 'market.js', source, checksum: adler32(source) } } });
    }
    if (pathname.endsWith('/api/cloud/device/scripts') && request.method === 'GET') return request.success({ code: 200, data: { ok: true, scripts: cloudScripts } });
    if (pathname.endsWith('/api/cloud/device/scripts/7') && request.method === 'GET') return request.success({ code: 200, data: { ok: true, script: { id: 7, name: 'cloud.js' }, source: 'console.log(7)' } });
    if ((request.method === 'POST' || request.method === 'PUT') && pathname.includes('/api/cloud/')) return request.success({ code: 200, data: { ok: true, id: 7 } });
    if (request.method === 'DELETE' && pathname.endsWith('/api/cloud/device/scripts/7')) return request.success({ code: 200, data: { ok: true, id: 7, deleted: true } });
    request.fail(null, 999);
  } };
  return {
    files, calls, configValues, configGets, fetch, proxyCalls, communityEdition: options.communityEdition === true,
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
  const community = createHarness({ communityEdition: true, configValues: { 'cloud.origin': '', 'cloud.token': 'old-official-token', 'cloud.communityServerChosen': false } });
  const communityService = await loadService(community);
  await assert.rejects(communityService.listMarketScripts(''), /server_not_selected/);
  assert.equal(community.calls.length, 0);
  const upgraded = createHarness({ communityEdition: true, configValues: { 'cloud.origin': 'https://previous.test', 'cloud.communityServerChosen': false } });
  const upgradedService = await loadService(upgraded);
  await assert.rejects(upgradedService.listMarketScripts(''), /server_not_selected/);
  assert.equal(upgraded.calls.length, 0);
  const pageConfigValues = {};
  globalThis.__cloudConfig = {
    get(key, fallback) { return Promise.resolve(Object.prototype.hasOwnProperty.call(pageConfigValues, key) ? pageConfigValues[key] : fallback); },
    set(key, value) { pageConfigValues[key] = value; return Promise.resolve(true); }
  };
  const selectionSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'cloud', 'serverSelection.js'), 'utf8')
    .replace("import { IS_COMMUNITY_EDITION } from '../core/edition.js';", 'const IS_COMMUNITY_EDITION = true;')
    .replace("import { back } from '../core/routeManager.js';", 'const back = () => {};')
    .replace("import { showToast } from '../core/uiFeedback.js';", 'const showToast = () => {};');
  const selection = await import('data:text/javascript;base64,' + Buffer.from(selectionSource).toString('base64'));
  assert.equal(selection.normalizeServerUrl('https://example.com/jslab-cloud/'), 'https://example.com/jslab-cloud');
  assert.equal(selection.normalizeServerUrl('http://example.com'), '');
  const choices = [{ action: 'confirm', value: 'custom' }, { action: 'confirm', value: 'https://community.test/jslab-cloud' }];
  const owner = { $app: { $def: {
    getConfigManager: () => community.config,
    openDialog: () => Promise.resolve(choices.shift())
  } } };
  assert.equal(await selection.chooseServer(owner), true);
  assert.equal(community.configValues['cloud.origin'], 'https://community.test/jslab-cloud');
  assert.equal(community.configValues['cloud.communityServerChosen'], true);
  assert.equal(community.configValues['cloud.token'], '');
  assert.deepEqual(pageConfigValues, {}, 'Server selection must use the app config instance, not the page cache');
  await communityService.listMarketScripts('');
  assert.equal(community.calls[0].url, 'https://community.test/jslab-cloud/api/cloud/device/market');
  assert.equal(await selection.selectedServer(owner), 'https://community.test/jslab-cloud');
  assert.equal(await selection.chooseServer(owner), true, 'An already selected server must not prompt again');
  choices.push({ action: 'confirm', value: 'official' });
  assert.equal(await selection.chooseServer(owner, true), true);
  assert.equal(community.configValues['cloud.origin'], 'http://jslab-api.ccicc.icu');
  await communityService.listMarketScripts('');
  assert.equal(community.calls.at(-1).url, 'http://jslab-api.ccicc.icu/api/cloud/device/market');
  const previousOfficial = createHarness({ communityEdition: true, configValues: { 'cloud.origin': 'https://jslab-api.ccicc.icu', 'cloud.communityServerChosen': true } });
  const previousOfficialService = await loadService(previousOfficial);
  await previousOfficialService.listMarketScripts('');
  assert.equal(previousOfficial.calls[0].url, 'http://jslab-api.ccicc.icu/api/cloud/device/market');
  const previousOwner = { $app: { $def: { getConfigManager: () => previousOfficial.config } } };
  assert.equal(await selection.selectedServer(previousOwner), 'http://jslab-api.ccicc.icu');

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
    const malformed = createHarness({ responses: { '/api/cloud/device/scripts': response } });
    await assert.rejects((await loadService(malformed)).listCloudScripts(), /cloud_invalid_response/);
  }
  const checksumSource = 'console.log("中文😀")';
  for (const checksum of ['00000000', '', 123, adler32(checksumSource)]) {
    const checked = createHarness({ responses: {
      '/api/cloud/device/scripts/7': { script: { name: 'checked.js' }, source: checksumSource, checksum }
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
  const aiService = await loadService(slowAi);
  await aiService.generateAi('create', 'test', 'unneeded old source', 'test.js', { appVersion: 'unused' });
  assert.equal(slowAi.proxyCalls[0].timeoutMs, undefined);
  assert.equal(slowAi.proxyCalls[1].timeoutMs, 330000);
  assert.deepEqual(JSON.parse(slowAi.proxyCalls[1].request.body), { runtimeContract: 'jslab-unified-open-ui', mode: 'create', prompt: 'test', name: 'test.js' });
  await aiService.generateAi('rewrite', '保留计数', 'console.log(0)', 'test.js');
  assert.deepEqual(JSON.parse(slowAi.proxyCalls[3].request.body), { runtimeContract: 'jslab-unified-open-ui', mode: 'rewrite', prompt: '保留计数', name: 'test.js', source: 'console.log(0)' });

  const unboundProxy = createHarness({ configValues: { 'cloud.transport': 'interconnect' } });
  const unboundService = await loadService(unboundProxy);
  unboundService.setCloudProxyRequest(null);
  await assert.rejects(unboundService.listMarketScripts(''), /cloud_proxy_unavailable/);

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
  const unknownNativeError = await unknownNativeService.listMarketScripts('').catch(error => error);
  assert.equal(unknownNativeService.errorMessage(unknownNativeError, '读取市场'), '读取市场：fetch 直连请求未完成（Vela 999）');

  const stalled = createHarness({ pendingFetch: true });
  const stalledService = await loadService(stalled);
  await assert.rejects(stalledService.request('/api/cloud/device/entitlements', { timeoutMs: 10 }), /cloud_fetch_deadline/);
  stalled.calls[0].fail('{"ok":false,"error":"device_auth_required"}', 401);
  assert.equal(stalled.configValues['cloud.token'], 'token', 'Late fetch responses must not invalidate the token');

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
  const unknownHttpError = await unknownHttpService.listMarketScripts('').catch(error => error);
  assert.equal(unknownHttpService.errorMessage(unknownHttpError, '读取市场'), '读取市场：云服务返回 HTTP 418：茶壶拒绝煮咖啡');

  const invalidResponse = createHarness({ httpFailure: { status: 502, body: '<html>gateway</html>' } });
  const invalidResponseService = await loadService(invalidResponse);
  const invalidResponseError = await invalidResponseService.listMarketScripts('').catch(error => error);
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
    assert.equal(production.calls[0].url, 'http://jslab-api.ccicc.icu/api/cloud/device/scripts');
  }

  const customOrigin = createHarness({ configValues: { 'cloud.origin': 'https://private-cloud.example/base/' } });
  const customOriginService = await loadService(customOrigin);
  await customOriginService.listCloudScripts();
  assert.equal(customOrigin.calls[0].url, 'https://private-cloud.example/base/api/cloud/device/scripts');

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
  assert(chineseUploadCall.url.endsWith('/api/cloud/device/scripts/7'), 'Chinese overwrite matching must use the original filename');

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
  assert.equal((await marketService.listMarketScripts(''))[0].authorName, '测试作者');
  assert.equal(marketService.suggestMarketFilename('工具/演示'), '工具_演示.js');
  assert.equal(marketService.normalizeMarketSaveName(' 演示 '), '演示.js');
  assert.throws(() => marketService.normalizeMarketSaveName('../演示'), /路径或连续句点/);
  assert.throws(() => marketService.normalizeMarketSaveName('中'.repeat(43)), /128 个 UTF-8 字节/);
  await marketService.downloadMarketScript(3, '自选名称.js', false);
  assert.equal(market.files['自选名称.js'], 'console.log("中文🙂")');
  await assert.rejects(marketService.downloadMarketScript(3, '自选名称.js', false), /file_exists/);
  await marketService.downloadMarketScript(3, '自选名称.js', true);
  await marketService.downloadMarketScript(3, '第二份.js', false);
  assert.equal(market.files['第二份.js'], 'console.log("中文🙂")');

  assert.equal(typeof marketService.sync, 'undefined');
  assert.equal(typeof marketService.previewSync, 'undefined');
  assert.ok(!market.configGets.some((key) => /^cloud\.(scripts|lastSync|lastError)$/.test(key)));

  const source = ['deviceAccount.js', 'deviceAi.js', 'marketClient.js', 'cloudFilesClient.js', 'cloudResponse.js']
    .map(name => fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'cloud', name), 'utf8')).join('\n');
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

run().then(() => console.log('cloud client tests passed')).catch((error) => { console.error(error); process.exitCode = 1; });

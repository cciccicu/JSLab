const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const manifest = require('../src/manifest.json');
const versionQuery = '?jslabVersion=' + encodeURIComponent(manifest.versionName) + '&jslabVersionCode=' + manifest.versionCode;

test("cloudClients", async () => {
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
      .replace("import app from '@system.app';", 'const app = globalThis.__cloudApp;')
      .replace("import manifest from '../../manifest.json';", 'const manifest = ' + JSON.stringify(manifest) + ';')
      .replace("import device from '@system.device';", 'const device = globalThis.__cloudDevice;')
      .replace("import configManager from '../core/configManager.js';", 'const configManager = globalThis.__cloudConfig;')
      .replace("import { cleanDetail, createNativeError } from '../core/userError.js';", 'const { cleanDetail, createNativeError } = globalThis.__cloudUserError;')
      .replace("import { IS_COMMUNITY_EDITION } from '../core/buildConfig.js';", 'const IS_COMMUNITY_EDITION = globalThis.__cloudCommunityEdition;');
    globalThis.__cloudFetch = harness.fetch;
    globalThis.__cloudApp = harness.app;
    globalThis.__cloudDevice = harness.device;
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
      ["import { request, getTransport, getDefaultTransport } from './cloudTransport.js';", 'const { request, getTransport, getDefaultTransport } = globalThis.__cloudTransport;']
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
    globalThis.__cloudMarketDevices = await loadCloudModule('marketDevices.js', [
      ["import { SCREEN } from '../core/screen.js';", "const SCREEN = { id: 'bandpro' };"]
    ]);
    const market = (await loadCloudModule('marketClient.js', domainImports.concat([
      ["import { marketDevices, marketDeviceLabel } from './marketDevices.js';", 'const { marketDevices, marketDeviceLabel } = globalThis.__cloudMarketDevices;'],
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
    let canIUseCalls = 0; let deviceInfoCalls = 0;
    const cloudScripts = options.cloudScripts || [{ id: 7, name: 'cloud.js' }];
    const fetch = { fetch(request) {
      assert.equal(new URL(request.url).searchParams.get('jslabVersion'), manifest.versionName);
      assert.equal(new URL(request.url).searchParams.get('jslabVersionCode'), String(manifest.versionCode));
      calls.push(request);
      if (options.pendingFetch) return;
      if (options.httpFailure) {
        const body = options.httpFailure.body === undefined
          ? JSON.stringify({ ok: false, error: options.httpFailure.error })
          : options.httpFailure.body;
        return request.fail(body, options.httpFailure.status);
      }
      if (options.fetchFailure) return request.fail(options.fetchFailureDetail || null, options.fetchFailure);
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
      app: { canIUse(capability) {
        canIUseCalls += 1;
        assert.equal(capability, '@system.fetch.fetch');
        return options.fetchSupported !== false;
      } },
      getCanIUseCalls() { return canIUseCalls; },
      device: { getInfo(request) {
        deviceInfoCalls += 1;
        if (options.deviceInfoFailure) return request.fail();
        request.success(options.deviceInfo || {});
      } },
      getDeviceInfoCalls() { return deviceInfoCalls; },
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
        assert.equal(new URL(request.url).searchParams.get('jslabVersion'), manifest.versionName);
        assert.equal(new URL(request.url).searchParams.get('jslabVersionCode'), String(manifest.versionCode));
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
      .replace("import { IS_COMMUNITY_EDITION } from '../core/buildConfig.js';", 'const IS_COMMUNITY_EDITION = true;')
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
    assert.equal(community.calls[0].url, 'https://community.test/jslab-cloud/api/cloud/device/market' + versionQuery);
    assert.equal(await selection.selectedServer(owner), 'https://community.test/jslab-cloud');
    assert.equal(await selection.chooseServer(owner), true, 'An already selected server must not prompt again');
    choices.push({ action: 'confirm', value: 'official' });
    assert.equal(await selection.chooseServer(owner, true), true);
    assert.equal(community.configValues['cloud.origin'], 'http://jslab-api.ccicc.icu');
    await communityService.listMarketScripts('');
    assert.equal(community.calls.at(-1).url, 'http://jslab-api.ccicc.icu/api/cloud/device/market' + versionQuery);
    const previousOfficial = createHarness({ communityEdition: true, configValues: { 'cloud.origin': 'https://jslab-api.ccicc.icu', 'cloud.communityServerChosen': true } });
    const previousOfficialService = await loadService(previousOfficial);
    await previousOfficialService.listMarketScripts('');
    assert.equal(previousOfficial.calls[0].url, 'http://jslab-api.ccicc.icu/api/cloud/device/market' + versionQuery);
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
      [300, 'cloud_fetch_io_error', '您的设备可能未联网（Vela 300）'],
      [6, 'cloud_fetch_unsupported', '设备可能不支持 fetch 直连，或域名解析失败，请检查网络或尝试网络桥接（Vela 6）']
    ]) {
      const nativeHarness = createHarness({ fetchFailure: code });
      const nativeService = await loadService(nativeHarness);
      const nativeError = await nativeService.startPairing('Band Pro').catch(error => error);
      assert.equal(nativeError.message, key);
      assert.equal(nativeService.errorMessage(nativeError, '生成配对二维码'), '生成配对二维码：' + text);
      const marker = /（(Vela \d+)）/.exec(text);
      assert.equal(nativeService.errorMessage(nativeError, '读取 JS 市场', { codeFirst: true }),
        marker[1] + '：读取 JS 市场：' + text.replace(marker[0], ''));
    }

    const unsupportedFetch = createHarness({ fetchFailure: 6, fetchFailureDetail: "Couldn't resolve host name" });
    const unsupportedService = await loadService(unsupportedFetch);
    const unsupportedError = await unsupportedService.listMarketScripts('').catch(error => error);
    assert.equal(unsupportedError.nativeCode, 6);
    assert.equal(unsupportedError.detail, "Couldn't resolve host name");
    assert.equal(unsupportedService.isNetworkError(unsupportedError), false);
    assert.equal(unsupportedService.errorMessage(unsupportedError, '读取市场'),
      '读取市场：设备可能不支持 fetch 直连，或域名解析失败，请检查网络或尝试网络桥接（Vela 6）');
    assert.equal(unsupportedFetch.configValues['cloud.transport'], 'fetch', 'Unsupported fetch must not overwrite the saved transport');

    const unknownNativeHarness = createHarness({ fetchFailure: 999 });
    const unknownNativeService = await loadService(unknownNativeHarness);
    const unknownNativeError = await unknownNativeService.listMarketScripts('').catch(error => error);
    assert.equal(unknownNativeService.errorMessage(unknownNativeError, '读取市场'), '读取市场：fetch 直连请求未完成（Vela 999）');
    assert.equal(unknownNativeService.errorMessage(unknownNativeError, '读取市场', { codeFirst: true }),
      'Vela 999：读取市场：fetch 直连请求未完成');

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

    for (const supported of [true, false]) {
      const automatic = createHarness({ fetchSupported: supported, configValues: { 'cloud.transport': '' } });
      const automaticService = await loadService(automatic);
      const expected = supported ? 'fetch' : 'interconnect';
      assert.equal((await automaticService.getState()).transport, expected);
      await automaticService.request('/api/cloud/device/market');
      assert.equal(automatic.calls.length, supported ? 1 : 0);
      assert.equal(automatic.proxyCalls.length, supported ? 0 : 1);
      assert.equal(automatic.configValues['cloud.transport'], '', 'Automatic defaults must not become saved choices');
      assert.equal(automatic.getDeviceInfoCalls(), 1, 'Device information must be shared by settings and requests');
    }
    for (const [deviceInfo, expected] of [
      [{ deviceType: 'band' }, 'interconnect'],
      [{ deviceType: 'watch', model: 'Xiaomi Smart Band 9 Pro' }, 'fetch'],
      [{ deviceType: 'band', model: 'Xiaomi Smart Band 9 Pro' }, 'fetch'],
      [{ deviceType: 'band', model: '小米手环 9 Pro' }, 'fetch'],
      [{ deviceType: 'band', brand: 'Xiaomi', model: 'Smart Band 9 Pro' }, 'fetch'],
      [{ deviceType: 'band', product: 'Smart Band 9 Pro' }, 'fetch'],
      [{ deviceType: 'band', model: 'XIAOMI Band 9 pRo NFC' }, 'fetch'],
      [{ deviceType: 'band', product: 'PRO-BAND-9-CHINA' }, 'fetch'],
      [{ deviceType: 'band', model: 'Xiaomi Smart Band 9' }, 'interconnect'],
      [{ deviceType: 'band', model: 'Xiaomi Smart Band 8 Pro' }, 'interconnect'],
      [{ product: 'Redmi Watch 4' }, 'interconnect'],
      [{ model: 'REDMI Watch 5' }, 'fetch'],
      [{ brand: 'REDMI', model: 'Watch 6' }, 'fetch'],
      [{ model: 'Xiaomi Watch S4' }, 'fetch']
    ]) {
      const inferred = createHarness({ deviceInfo, fetchSupported: expected !== 'fetch', configValues: { 'cloud.transport': '' } });
      const inferredService = await loadService(inferred);
      assert.equal((await inferredService.getState()).transport, expected);
      await inferredService.request('/api/cloud/device/market');
      assert.equal(inferred.calls.length, expected === 'fetch' ? 1 : 0);
      assert.equal(inferred.proxyCalls.length, expected === 'interconnect' ? 1 : 0);
      assert.equal(inferred.getCanIUseCalls(), 0, 'Recognized devices use the device-information hint');
      assert.equal(inferred.getDeviceInfoCalls(), 1);
    }
    for (const transport of ['fetch', 'interconnect']) {
      const manual = createHarness({ deviceInfo: { deviceType: 'band' }, fetchSupported: transport !== 'fetch', configValues: { 'cloud.transport': transport } });
      const manualService = await loadService(manual);
      assert.equal((await manualService.getState()).transport, transport);
      await manualService.request('/api/cloud/device/market');
      assert.equal(manual.calls.length, transport === 'fetch' ? 1 : 0);
      assert.equal(manual.proxyCalls.length, transport === 'interconnect' ? 1 : 0);
      assert.equal(manual.getCanIUseCalls(), 0, 'Saved choices must bypass capability detection');
      assert.equal(manual.getDeviceInfoCalls(), 0, 'Saved choices must bypass device guessing');
    }
    for (const device of [{ getInfo(options) { options.fail(); } }, {}, { getInfo() { throw new Error('unavailable'); } }]) {
      const unavailableInfo = createHarness({ fetchSupported: false, configValues: { 'cloud.transport': '' } });
      unavailableInfo.device = device;
      const unavailableInfoService = await loadService(unavailableInfo);
      assert.equal((await unavailableInfoService.getState()).transport, 'interconnect');
    }
    const stalledInfo = createHarness({ configValues: { 'cloud.transport': '' } });
    let lateDeviceInfo;
    stalledInfo.device = { getInfo(options) { lateDeviceInfo = options.success; } };
    const stalledInfoService = await loadService(stalledInfo);
    assert.equal((await stalledInfoService.getState()).transport, 'fetch', 'A missing callback must fall back without blocking requests');
    lateDeviceInfo({ deviceType: 'band' });
    assert.equal((await stalledInfoService.getState()).transport, 'fetch', 'Late callbacks must not change the settled default');
    for (const app of [null, {}, { canIUse() { throw new Error('unsupported query'); } }, { canIUse() {} }]) {
      const legacy = createHarness({ configValues: { 'cloud.transport': '' } });
      legacy.app = app;
      const legacyService = await loadService(legacy);
      assert.equal((await legacyService.getState()).transport, 'fetch');
      await legacyService.request('/api/cloud/device/market');
      assert.equal(legacy.calls.length, 1);
    }
    const missingFetch = createHarness({ configValues: { 'cloud.transport': '' } });
    missingFetch.fetch = {};
    const missingFetchService = await loadService(missingFetch);
    assert.equal((await missingFetchService.getState()).transport, 'interconnect');
    await missingFetchService.request('/api/cloud/device/market');
    assert.equal(missingFetch.proxyCalls.length, 1);
    assert.equal(missingFetch.getCanIUseCalls(), 0);

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
    assert.equal(invalidResponseService.errorMessage(invalidResponseError, '读取市场', { codeFirst: true }),
      'HTTP 502：读取市场：云服务返回了无法解析的响应');

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
      assert.equal(production.calls[0].url, 'http://jslab-api.ccicc.icu/api/cloud/device/scripts' + versionQuery);
    }

    const customOrigin = createHarness({ configValues: { 'cloud.origin': 'https://private-cloud.example/base/' } });
    const customOriginService = await loadService(customOrigin);
    await customOriginService.listCloudScripts();
    assert.equal(customOrigin.calls[0].url, 'https://private-cloud.example/base/api/cloud/device/scripts' + versionQuery);

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
      name: '公开名称', description: '用途说明', tags: '工具, 示例', supportedDevices: ['pro']
    });
    assert.equal(marketResult.marketId, 17);
    const marketCall = marketUpload.calls.find((call) => new URL(call.url).pathname.endsWith('/api/cloud/device/market/submit'));
    assert.equal(marketCall.method, 'POST');
    assert.deepEqual(JSON.parse(marketCall.data), {
      marketName: '公开名称', marketDescription: '用途说明', marketTags: '工具, 示例', supportedDevices: ['pro'], source: 'console.log("watch")'
    });
    const bridgedMarket = createHarness({ files: { 'local.js': 'console.log(1)' }, responses: {
      '/api/cloud/device/market/submit': { status: 'pending', marketId: 17 }
    },
      configValues: { 'cloud.transport': 'interconnect' } });
    await (await loadService(bridgedMarket)).submitMarketScript('local.js', { name: '工具', description: '说明', supportedDevices: ['pro'] });
    assert.equal(bridgedMarket.proxyCalls[0].timeoutMs, 330000);
    const rejectedStatus = createHarness({ responses: {
      '/api/cloud/device/market/3/source': { script: { id: 3, source: 'console.log(1)', status: 'rejected', statusText: '更新被拒绝，旧版仍已发布', review: { decision: 'reject', reason: '请说明用途' } } }
    } });
    const reviewState = await (await loadService(rejectedStatus)).getMarketScript(3, true);
    assert.equal(reviewState.reviewReason, '请说明用途');
    assert.equal(reviewState.statusText, '更新被拒绝，旧版仍已发布');
    const unpairedStatus = createHarness({ configValues: { 'cloud.token': '' } });
    await assert.rejects((await loadService(unpairedStatus)).getMarketScript(3, true), /not_paired/);
    assert.equal(unpairedStatus.calls.length, 0);
    const invalidSubmit = createHarness({ files: { 'local.js': 'console.log(1)' }, responses: {
      '/api/cloud/device/market/submit': { ok: true }
    } });
    await assert.rejects((await loadService(invalidSubmit)).submitMarketScript('local.js', { name: 'name', description: 'description', supportedDevices: ['pro'] }), /invalid_market_script/);

    const chineseName = '中文工具（测试）.ui.js';
    const chineseUpload = createHarness({ files: { [chineseName]: 'console.log("你好")' }, cloudScripts: [{ id: 7, name: chineseName }] });
    const chineseService = await loadService(chineseUpload);
    await chineseService.uploadScript(chineseName);
    const chineseUploadCall = chineseUpload.calls.find(call => call.method === 'PUT');
    assert.deepEqual(JSON.parse(chineseUploadCall.data), { name: chineseName, source: 'console.log("你好")' });
    assert(new URL(chineseUploadCall.url).pathname.endsWith('/api/cloud/device/scripts/7'), 'Chinese overwrite matching must use the original filename');

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
    await assert.rejects(marketService.downloadMarketScript(3, '取消的下载.js', false, false, () => false), /market_download_cancelled/);
    assert.equal(market.files['取消的下载.js'], undefined, 'Canceling compatibility warning must not write a file');
    await assert.rejects(marketService.submitMarketScript('local.js', {name:'name',description:'description'}), /请选择适配设备/);

    await marketService.listMarketScripts('中文 标签', true);
    assert.equal(new URL(market.calls.at(-1).url).searchParams.get('mine'), '1');
    assert.equal(new URL(market.calls.at(-1).url).searchParams.get('q'), '中文 标签');
    const ownSource = await marketService.getMarketScript(3, true);
    assert.equal(ownSource.source, 'console.log("中文🙂")');
    assert.ok(new URL(market.calls.at(-1).url).pathname.endsWith('/3/source') && new URL(market.calls.at(-1).url).searchParams.get('mine') === '1');
    await marketService.downloadMarketScript(3, '自己的.js', false, true);
    assert.equal(market.files['自己的.js'], ownSource.source);
    await marketService.reportMarketScript(3, '  需要审核  ');
    assert.equal(market.calls.at(-1).method, 'POST');
    assert.deepEqual(JSON.parse(market.calls.at(-1).data), { reason: '需要审核' });
    await assert.rejects(marketService.reportMarketScript(3, ' '), /reason_required/);
    const corrupt = createHarness({ responses: { '/api/cloud/device/market/3/source': { script: { id: 3, name: 'bad', source: 'console.log(1)', checksum: '00000000' } } } });
    await assert.rejects((await loadService(corrupt)).getMarketScript(3), /checksum_mismatch/);

    const navigation = [];
    const pageGlobals = {
      push: (...args) => navigation.push(args), back() {}, vibrate() {}, showToast() {},
      getCurrentClock: () => '12:00', startPageClock() {}, stopPageClock() {},
      startNetworkFeedback() {}, stopNetworkFeedback() {}, setNetworkFeedbackVisible() {},
      errorMessage: error => error.message, enterNetworkPage: (_page, next) => next(),
      normalizeMarketSaveName: marketService.normalizeMarketSaveName,
      suggestMarketFilename: marketService.suggestMarketFilename
    };
    const loadPage = relative => {
      const ux = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'tools', 'market', relative), 'utf8');
      const script = ux.match(/<script>([\s\S]*?)<\/script>/)[1]
        .replace(/^import .*;\s*$/gm, '').replace('export default', 'globalThis.page =');
      const context = Object.assign({}, pageGlobals, { console });
      require('vm').runInNewContext(script, context);
      return Object.assign({}, context.page, context.page.protected || {}, context.page.private);
    };
    const page = loadPage('market.ux');
    const pageRequests = [];
    let downloads = 0;
    page.$app = { $def: {
      getCloudClients: () => ({ marketClient: {
        listMarketScripts: (query, mine) => { pageRequests.push({ query, mine }); return Promise.resolve([{ id: 3, name: 'pending', status: 'pending' }]); },
        downloadMarketScript: () => { downloads++; return Promise.resolve({ name: 'saved.js' }); }
      } }),
      openDialog: () => Promise.resolve({ action: 'cancel' })
    } };
    page.toggleMode();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(pageRequests, [{ query: '', mine: true }]);
    page.selectScript(0);
    assert.equal(downloads, 0, 'Selecting a row must never download or open a dialog');
    page.viewSelected();
    assert.equal(navigation[0][0], 'toolsMarketView');
    assert.equal(navigation[0][1].mine, '1');
    page.selectScript(0);
    assert.equal(page.selectedScriptIndex, -1);
    page.selectScript(0);
    page.downloadSelected();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.busy, false, 'Canceling save-as must unlock list operations');
    assert.equal(downloads, 0);
    const viewer = loadPage(path.join('view', 'view.ux'));
    const fullSource = 'console.log("中文😀");\n'.repeat(1500);
    viewer.marketId = '3'; viewer.mine = '1';
    viewer.$app = { $def: { getCloudClients: () => ({ marketClient: { getMarketScript: (id, mine) => {
      assert.equal(id, 3); assert.equal(mine, true);
      return Promise.resolve({ id, name: 'full.js', source: fullSource, status: 'pending' });
    } } }) } };
    viewer.onInit(); viewer.load();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(viewer.sourceChunks.map(chunk => chunk.text).join(''), fullSource, 'Viewing source must preserve content beyond dialog limits');
    assert.equal(viewer.loading, false);
    const runtimeApi = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'runtime', 'scriptRuntimeApi.js'), 'utf8');
    assert.doesNotMatch(runtimeApi, /getCloudClients|marketClient|cloudTransport|cloud\.token/);

    assert.equal(typeof marketService.sync, 'undefined');
    assert.equal(typeof marketService.previewSync, 'undefined');
    assert.ok(!market.configGets.some((key) => /^cloud\.(scripts|lastSync|lastError)$/.test(key)));

  }

  await run();
});

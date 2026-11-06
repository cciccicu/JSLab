const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Exercise the real JSLab aliases with native callback fixtures. These fixtures
// verify documented parameters/results; they do not emulate physical hardware.
const source = fs.readFileSync(path.resolve(__dirname, '../../../vela-quickapp/src/utils/runtime/scriptRuntimeApi.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export function', 'function').replace(/^export default.*$/gm, '');
const moduleNames = ['app', 'device', 'configuration', 'file', 'network', 'brightness', 'geolocation', 'vibrator', 'sensor', 'fetch', 'interconnect', 'uploadtask', 'request', 'crypto'];
const createFactory = new Function(...moduleNames, 'createScriptDialogApi', 'loadOptionalSystemModule', 'showToast', source + '\nreturn createScriptRuntimeApi;');

function documentationRuntime(dialog, mode = 'success') {
  const errors = [];
  const active = new Set();
  const files = new Map();
  const payload = fields => new Proxy(fields, {
    get(target, key) {
      if (typeof key === 'symbol' || key === 'then') return undefined;
      assert.ok(Object.hasOwn(target, key), `Undocumented response field: ${key}`);
      return target[key];
    }
  });
  const deliver = (options, fields, callback = 'success') => {
    queueMicrotask(() => {
      try {
        if (mode === 'failure') options.fail?.('Fixture request failed', 203);
        else options[callback]?.(payload(fields));
        options.complete?.();
      } catch (error) { errors.push(error); }
    });
  };
  const required = (options, names) => names.forEach(name => assert.notEqual(options[name], undefined, `Missing ${name}`));
  const native = {
    device: {
      getInfo: options => deliver(options, { model: 'Fixture watch', screenWidth: 336, screenHeight: 480, osVersionName: 'fixture' }),
      getAvailableStorage: options => deliver(options, { availableStorage: 10485760 })
    },
    configuration: { getLocale: () => ({ language: 'zh', countryOrRegion: 'CN' }) },
    file: {
      writeText(options) { required(options, ['uri', 'text']); files.set(options.uri, options.text); deliver(options, {}); },
      readText(options) { required(options, ['uri']); assert.ok(files.has(options.uri)); deliver(options, { text: files.get(options.uri) }); }
    },
    network: {},
    brightness: { getValue: options => deliver(options, { value: 100 }) },
    battery: { getStatus: options => deliver(options, { level: 0.5, charging: false }) },
    geolocation: { getLocation: options => { assert.ok(options.timeout > 0); deliver(options, { latitude: 31, longitude: 121 }); } },
    vibrator: { vibrate: options => assert.ok(['short', 'long'].includes(options.mode)) },
    sensor: {
      subscribeAccelerometer(options) {
        assert.equal(options.interval, 'normal');
        if (mode === 'success') active.add('accelerometer');
        deliver(options, { x: 1, y: 2, z: 3 }, 'callback');
      },
      unsubscribeAccelerometer: () => active.delete('accelerometer')
    },
    fetch: { fetch(options) {
      required(options, ['url', 'responseType']);
      if (options.method === 'POST') {
        assert.equal(options.header['Content-Type'], 'application/json');
        assert.equal(typeof options.data, 'string');
        JSON.parse(options.data);
      }
      deliver(options, { code: 200, data: { count: 3 }, headers: {} });
    } },
    request: {
      download: options => { required(options, ['url']); deliver(options, { token: 'fixture-token' }); },
      onDownloadComplete: options => { assert.equal(options.token, 'fixture-token'); deliver(options, { uri: 'internal://cache/note.txt' }); }
    },
    uploadtask: { uploadFile(options) {
      required(options, ['url', 'filePath', 'name']);
      deliver(options, { statusCode: 200, data: '{}', headers: {} });
      return { abort() {} };
    } },
    interconnect: { instance: () => ({ getReadyState: options => deliver(options, { status: 1 }) }) },
    audio: { play: () => active.add('audio'), stop: () => active.delete('audio') },
    record: {
      start(options) { assert.ok(options.duration > 0); assert.equal(options.format, 'wav'); deliver(options, { uri: 'internal://cache/record.wav' }); },
      stop() {}
    },
    event: {
      publish() {},
      subscribe(options) {
        required(options, ['eventName', 'callback']);
        if (mode === 'failure') return undefined;
        active.add('event:0');
        deliver(options, { params: { level: 0.5 }, package: 'fixture' }, 'callback');
        return 0; // Catch examples that incorrectly reject a valid zero ID.
      },
      unsubscribe(options) { assert.equal(options.id, 0); active.delete('event:0'); }
    },
    crypto: {
      hashDigest(options) { assert.equal(options.algo, 'SHA256'); return crypto.createHash('sha256').update(options.data).digest('hex'); },
      btoa: value => Buffer.from(value, 'latin1').toString('base64'),
      atob: value => Buffer.from(value, 'base64').toString('latin1')
    }
  };
  native.app = { canIUse(capability) {
    const match = /^@system\.([a-z]+)\.([A-Za-z]+)$/.exec(capability);
    const known = match && typeof native[match[1]]?.[match[2]] === 'function';
    if (!known) errors.push(new Error(`Unknown capability in example: ${capability}`));
    return Boolean(known) && mode !== 'unsupported';
  } };
  const makeStorage = () => {
    const values = new Map();
    return { get: async (key, fallback) => values.has(key) ? values.get(key) : fallback,
      set: async (key, value) => { values.set(key, value); }, delete: async key => { values.delete(key); },
      clear: async () => values.clear(), all: async () => Object.fromEntries(values) };
  };
  const factory = createFactory(...moduleNames.map(name => native[name]), () => dialog,
    (_app, name) => native[name.slice('system.'.length)], () => {});
  const api = factory({ getScriptStorage: () => ({ data: makeStorage(), config: makeStorage() }) }, {
    name: 'tutorial.js', isActive: () => true, exit() {}, reload() {}
  });
  return { ...api, errors, active };
}

module.exports = { documentationRuntime };

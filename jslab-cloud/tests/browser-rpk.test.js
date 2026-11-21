const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = ['jslab-errors.js','jslab-rpk.js'].map(name => fs.readFileSync(path.join(__dirname,'../assets',name),'utf8')).join('\n');

function fixture(reply) {
  const nodes = new Map(), requests = [], documentEvents = {};
  function node(key) {
    if (!nodes.has(key)) nodes.set(key, {
      handlers: {}, style: {}, attributes: {}, textContent: '', value: '', disabled: false,
      classList: { add() {}, remove() {} },
      addEventListener(name, fn) { this.handlers[name] = fn; },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      querySelector(selector) { return node(key + ' ' + selector); }
    });
    return nodes.get(key);
  }
  const form = node('form'); form.dataset = { scriptId: '1' }; form.elements = {};
  for (const name of ['_csrf','name','packageName','versionName','versionCode','author','target','icon','signingZipFile','disableConsole','hideTopBar']) {
    form.elements[name] = Object.assign(node(name), { value: 'test', files: [], checked: false });
  }
  form.querySelectorAll = () => Object.values(form.elements);
  form.reset = () => Object.values(form.elements).forEach(field => { field.files = []; });
  const window = { addEventListener() {}, crypto: require('node:crypto').webcrypto, bootstrap: { Modal: { getOrCreateInstance: () => ({ show() {} }) } } };
  const document = {
    querySelector: selector => selector === '[data-cloud-rpk-form]' ? form : { dataset: { name: 'other.js' } },
    getElementById: () => ({}), querySelectorAll: () => [],
    addEventListener(name, fn) { documentEvents[name] = fn; }
  };
  vm.runInNewContext(source, {
    document, window, Blob, Uint8Array, atob, btoa,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    async fetch(url, options) {
      const body = JSON.parse(options.body); requests.push({ url, body });
      if (reply) return reply(url, body);
      return { ok: true, status: 200, json: async () => url.endsWith('/signing')
        ? { signing: { privateKey: 'test-key', certificate: 'test-cert', archiveBase64: 'AQID' } }
        : { rpkBase64: 'AQID', filename: 'test.rpk', chargedCents: 10, remainingCreditCents: 490 } };
    }
  });
  return {
    form, requests, errors: window.JSLabErrors,
    status: () => node('form [data-rpk-status]').textContent,
    signingStatus: () => node('form [data-rpk-signing-status]').textContent,
    select(name, file) { form.elements[name].files = file ? [file] : []; return form.elements[name].handlers.change(); },
    submit: () => form.handlers.submit({ preventDefault() {} }),
    openOther() { documentEvents.click({ target: { closest: () => ({ dataset: { cloudRpk: '2' } }) } }); }
  };
}
function file(name, value = 1) {
  return { name, size: 1, reads: 0, async arrayBuffer() { this.reads++; return Uint8Array.from([value]).buffer; } };
}

test('RPK icon is read on selection and retries use cached bytes after access expires', async () => {
  const f = fixture(), icon = file('icon.png');
  await f.select('icon', icon);
  assert.equal(icon.reads, 1); assert.equal(f.requests.length, 0);
  icon.arrayBuffer = () => { throw new DOMException('file access expired', 'NotReadableError'); };
  await f.submit(); await f.submit();
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0].body.iconBase64, 'AQ==');
  assert.equal(f.requests[1].body.iconBase64, 'AQ==');
  assert.equal(f.requests[0].body.requestId, f.requests[1].body.requestId);
  assert.match(f.status(), /打包成功/);
});

test('RPK icon reading blocks submission and replacing or clearing it cannot reuse old bytes', async () => {
  const f = fixture(); let finish;
  const selected = f.select('icon', { name: 'slow.png', size: 1, arrayBuffer: () => new Promise(resolve => { finish = resolve; }) });
  await f.submit(); assert.equal(f.requests.length, 0);
  assert.equal(f.form.elements.icon.disabled, true);
  finish(Uint8Array.from([1]).buffer); await selected;
  await f.submit(); const first = f.requests[0].body;
  await f.select('icon', file('second.png', 2)); await f.submit();
  assert.equal(f.requests[1].body.iconBase64, 'Ag==');
  assert.notEqual(f.requests[1].body.requestId, first.requestId);
  await f.select('icon', null); await f.submit();
  assert.equal(f.requests[2].body.iconBase64, '');
  await f.select('icon', file('third.png', 3)); f.openOther(); await f.submit();
  assert.equal(f.requests[3].body.iconBase64, '');
  assert.ok(f.requests[3].url.includes('/scripts/2/rpk'));
});

test('RPK file read and size failures are Chinese, classified, and never start a build', async () => {
  for (const name of ['icon', 'signingZipFile']) {
    const f = fixture(), bad = file(name === 'icon' ? 'picture.png' : 'signing.zip');
    await f.select('icon', file('old.png'));
    bad.arrayBuffer = async () => { throw new DOMException('The requested file could not be read', 'NotReadableError'); };
    await f.select(name, bad);
    const message = name === 'icon' ? f.status() : f.signingStatus();
    assert.match(message, /^\[浏览器\].*无法读取/); assert.ok(message.includes(bad.name));
    assert.doesNotMatch(message, /The requested file/);
    await f.submit(); assert.equal(f.requests.length, 0);
    if (name === 'icon') assert.equal(f.status(), message);
    const oversized = { ...file('oversized.png'), size: 32769 };
    await f.select('icon', oversized);
    assert.match(f.status(), /^\[前端\].*超过 32 KiB/); assert.equal(oversized.reads, 0);
  }
});

test('RPK network, response decoding and API validation errors retain distinct sources', async () => {
  const cases = [
    [() => { throw new TypeError('Failed to fetch'); }, /^\[浏览器\].*请求未能完成/],
    [() => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_rpk_request', message: '图标尺寸不符合要求。' }) }), /^\[接口\] HTTP 400：图标尺寸/],
    [() => ({ ok: false, status: 502, json: async () => { throw new SyntaxError('Unexpected token <'); } }), /^\[接口\] HTTP 502.*不是有效 JSON/],
    [() => ({ ok: true, status: 200, json: async () => { throw new TypeError('terminated'); } }), /^\[浏览器\].*读取服务器响应失败/],
    [() => ({ ok: true, status: 200, json: async () => ({}) }), /^\[接口\].*缺少 RPK/]
  ];
  for (const [reply, expected] of cases) { const f = fixture(reply); await f.submit(); assert.match(f.status(), expected); }
  const f = fixture();
  assert.equal(f.errors.format(new TypeError('undefined is not an object')), '[前端] 页面处理失败（TypeError）。');
  const classified = f.errors.api('额度不足。', 402);
  assert.equal(f.errors.format(f.errors.format(classified)), '[接口] HTTP 402：额度不足。');
});

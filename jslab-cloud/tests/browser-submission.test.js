const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = ['jslab-errors.js', 'jslab-cloud.js'].map(name => fs.readFileSync(path.join(__dirname, '../assets', name), 'utf8')).join('\n');
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = (status, body) => ({ status, ok: status < 400, async json() { return body; } });

function element() {
  const listeners = {};
  return {
    attributes: {}, children: [], disabled: false, hidden: false, value: '',
    set textContent(value) { this.text = value; this.children = []; },
    get textContent() { return (this.text || '') + this.children.map(child => child.textContent).join(''); },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    appendChild(child) { this.children.push(child); },
    addEventListener(name, handler) { listeners[name] = handler; },
    click() { return listeners.click?.(); },
    focus() { this.focused = true; }
  };
}

function browser(fetchResponse, { publish = true, devices = ['pro'], states = null } = {}) {
  const handlers = {}, requests = [], timers = [], toasts = [];
  const submit = element(), action = element(), unavailableAction = element();
  unavailableAction.disabled = true;
  const modal = { visible: true };
  const fields = { _csrf: 'initial-csrf', marketName: 'example', marketDescription: 'description', source: 'console.log(1)' };
  const csrf = { get value() { return fields._csrf; }, set value(value) { fields._csrf = value; } };
  const device = element();
  const form = {
    dataset: {}, hidden: false, resets: 0,
    action: 'https://example.invalid/jslab-cloud/api/cloud/market/submit', method: 'post',
    matches: selector => publish && selector === '[data-cloud-publish-form]',
    querySelector(selector) { return selector === '[type="submit"]' ? submit : /^(?:input)?\[name="_csrf"\]$/.test(selector) ? csrf : selector === '[name="supportedDevices"]' ? device : null; },
    closest: selector => selector === '.modal' ? modal : null,
    reset() { this.resets++; }
  };
  const page = element(), header = element();
  header.insertAdjacentElement = (_position, child) => page.appendChild(child);
  page.prepend = child => page.children.unshift(child);
  page.querySelector = selector => selector === '.plugin-page-header' ? header : page.children.find(child => Object.hasOwn(child.attributes, 'data-cloud-publish-status'));
  const grid = states && { dataset: { cloudMarketStates: JSON.stringify(states), query: '' }, insertAdjacentElement: (_position, child) => page.appendChild(child) };
  const windowEvents = {};
  const document = {
    hidden: false,
    addEventListener(name, handler) { handlers[name] = handler; },
    querySelector(selector) {
      if (selector === '.jslab-cloud-page') return page;
      if (selector === '[data-cloud-market-states]') return grid;
      if (selector === '.modal.show') return modal.visible ? modal : null;
      if (selector === '[data-cloud-publish-form]') return publish ? form : null;
      if (selector === '[data-cloud-publish-retry]') return page.children.flatMap(child => child.children).find(child => Object.hasOwn(child.attributes, 'data-cloud-publish-retry'));
      return null;
    },
    querySelectorAll: selector => selector === '[data-cloud-editor]' ? [] : [action, unavailableAction],
    createElement: element
  };
  let reloads = 0;
  const window = {
    location: { href: 'https://example.invalid/jslab-cloud/workspace/market', search: '', reload() { reloads++; } },
    CCICC: { toast: value => toasts.push(value) },
    bootstrap: { Modal: { getOrCreateInstance: () => ({ hide() { modal.visible = false; }, show() { modal.visible = true; } }) } },
    addEventListener(name, handler) { windowEvents[name] = handler; },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeout(id) { if (timers[id - 1]) timers[id - 1].canceled = true; }
  };
  vm.runInNewContext(source, {
    window, URL, URLSearchParams,
    FormData: class {
      *[Symbol.iterator]() { yield* Object.entries(fields); yield* devices.map(value => ['supportedDevices', value]); }
    },
    DOMParser: class { parseFromString() { return { querySelector: () => ({ value: 'fresh-csrf' }) }; } },
    document,
    fetch(url, options) {
      requests.push({ url, data: options?.body && new URLSearchParams(options.body) });
      return fetchResponse(url, options, requests.length);
    }
  });
  return {
    form, fields, submit, action, unavailableAction, modal, requests, toasts, device, window, document, page,
    get reloads() { return reloads; }, timers,
    pagehide: () => windowEvents.pagehide?.(),
    visible: () => handlers.visibilitychange?.(),
    status: () => page.children[0],
    send: () => handlers.submit({ target: { closest: () => form }, preventDefault() {}, submitter: null })
  };
}

test('market submission hides the form immediately and allows only one pending request', async () => {
  let finish;
  const fixture = browser(() => new Promise(resolve => { finish = resolve; }));
  await fixture.send();
  await fixture.send();
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.form.hidden, true);
  assert.equal(fixture.modal.visible, false);
  assert.equal(fixture.submit.disabled, true);
  assert.equal(fixture.action.disabled, true);
  assert.match(fixture.status().textContent, /正在提交脚本/);
  assert.doesNotMatch(fixture.status().textContent, /等待审核/);
  finish(response(200, { status: 'pending', marketId: 7 }));
  await flush();
  assert.match(fixture.status().textContent, /提交成功.*等待审核/);
  await fixture.send();
  assert.equal(fixture.requests.length, 1, 'the form stays locked until navigation');
  assert.equal(fixture.window.location.href, '/jslab-cloud/workspace/market?tab=mine');
});

for (const [status, message, style] of [
  ['published', /审核通过.*已发布/, 'success'],
  ['rejected', /审核未通过.*请补充用途/, 'danger']
]) {
  test(`market ${status} result closes the form and enters the publications page`, async () => {
    const fixture = browser(async () => response(200, { status, marketId: 7, review: { reason: '请补充用途' } }));
    await fixture.send();
    await flush();
    assert.equal(fixture.form.hidden, true);
    assert.equal(fixture.modal.visible, false);
    assert.equal(fixture.form.resets, 0);
    assert.match(fixture.status().textContent, message);
    assert.equal(fixture.status().className, 'alert alert-' + style);
    assert.equal(fixture.window.location.href, '/jslab-cloud/workspace/market?tab=mine');
  });
}

test('a failed market submission keeps the draft and offers a working retry', async () => {
  const fixture = browser(async (_url, _options, count) => {
    if (count === 1) throw new Error('connection lost');
    return response(200, { status: 'pending', marketId: 7 });
  });
  await fixture.send();
  await flush();
  assert.match(fixture.status().textContent, /提交未完成.*\[浏览器\].*请求未能完成/);
  assert.doesNotMatch(fixture.status().textContent, /connection lost/);
  assert.equal(fixture.fields.source, 'console.log(1)');
  assert.equal(fixture.form.resets, 0);
  assert.equal(fixture.submit.disabled, false);
  assert.equal(fixture.action.disabled, false);
  assert.equal(fixture.unavailableAction.disabled, true);
  fixture.status().children[0].click();
  assert.equal(fixture.form.hidden, false);
  assert.equal(fixture.modal.visible, true);
  await fixture.send();
  await flush();
  assert.equal(fixture.requests.length, 2);
  assert.match(fixture.status().textContent, /提交成功/);
});

test('device validation leaves an invalid form open without sending a request', async () => {
  const fixture = browser(async () => { throw new Error('must not send'); }, { devices: [] });
  await fixture.send();
  assert.equal(fixture.requests.length, 0);
  assert.equal(fixture.form.hidden, false);
  assert.equal(fixture.modal.visible, true);
  assert.equal(fixture.device.focused, true);
  assert.match(fixture.toasts[0].message, /^\[前端\]/);
});

test('CSRF retry refreshes only the token and keeps the submitted source and lock', async () => {
  let finish;
  const fixture = browser(async (_url, _options, count) => {
    if (count === 1) {
      fixture.fields.source = 'later draft';
      return response(403, { error: 'csrf_invalid' });
    }
    if (count === 2) return { ok: true, async text() { return '<input name="_csrf" value="fresh-csrf">'; } };
    return new Promise(resolve => { finish = resolve; });
  });
  await fixture.send();
  await flush();
  assert.equal(fixture.requests.length, 3);
  assert.equal(fixture.requests[2].data.get('_csrf'), 'fresh-csrf');
  assert.equal(fixture.requests[2].data.get('source'), 'console.log(1)');
  await fixture.send();
  assert.equal(fixture.requests.length, 3);
  finish(response(200, { status: 'pending', marketId: 7 }));
  await flush();
  assert.match(fixture.status().textContent, /提交成功/);
});

test('other AJAX forms retain their existing success behavior with duplicate protection', async () => {
  let finish;
  const fixture = browser(() => new Promise(resolve => { finish = resolve; }), { publish: false });
  await fixture.send();
  await fixture.send();
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.form.hidden, false);
  assert.equal(fixture.modal.visible, true);
  assert.equal(fixture.action.disabled, false);
  finish(response(200, { message: 'saved' }));
  await flush();
  assert.equal(fixture.form.resets, 1);
  assert.equal(fixture.submit.disabled, false);
  assert.equal(fixture.toasts[0].message, 'saved');
});

test('an invalid success response cannot be displayed as a successful submission', async () => {
  const fixture = browser(async () => response(200, { ok: true }));
  await fixture.send(); await flush();
  assert.match(fixture.status().textContent, /无法确认提交结果/);
  assert.match(fixture.status().textContent, /\[接口\]/);
  assert.equal(fixture.form.resets, 0);
  assert.equal(fixture.submit.disabled, false);
});

test('browser tag validation matches the handset limits', async () => {
  for (const tags of ['x'.repeat(41), Array(13).fill('tag').join(',')]) {
    const fixture = browser(async () => { throw new Error('must not send'); });
    fixture.fields.marketTags = tags;
    await fixture.send();
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.form.hidden, false);
    assert.match(fixture.toasts[0].message, /12.*40/);
  }
});

test('pending publications never schedule polling or reload on visibility changes', async () => {
  const fixture = browser(async () => { throw new Error('must not poll'); }, {
    states: [{ id: 4, status: 'pending', reason: '', revision: 'r1' }]
  });
  fixture.modal.visible = false;
  fixture.visible(); fixture.pagehide(); await flush();
  assert.equal(fixture.requests.length, 0);
  assert.equal(fixture.reloads, 0);
  assert.equal(fixture.timers.some(timer => timer.delay === 15000), false);
});

test('an oversized market submission explains HTTP 413 and retains its draft', async () => {
  const fixture = browser(async () => response(413, { error: 'request_failed', message: '请求失败，请稍后重试。' }));
  await fixture.send(); await flush();
  assert.match(fixture.status().textContent, /超过服务器允许的大小/);
  assert.match(fixture.status().textContent, /\[接口\] HTTP 413/);
  assert.equal(fixture.fields.source, 'console.log(1)');
  assert.equal(fixture.submit.disabled, false);
});

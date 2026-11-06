'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const JSZip = require('jszip');
const { createApp } = require('../server/app.cjs');

const PASSWORD = 'standalone-test-password';
const API = '/jslab-cloud/api/cloud';

async function fixture(t, options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jslab-bridge-'));
  const errors = [];
  let runtime, server;
  const f = {
    get runtime() { return runtime; },
    async start() {
      runtime = createApp({ dataDir, publicOrigin: '', trustProxy: false, registration: false,
        logger: { info() {}, warn() {}, error(error) { errors.push(error); } }, ...options });
      server = runtime.app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      f.url = `http://127.0.0.1:${server.address().port}`;
    },
    async stop() {
      if (!server) return;
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      runtime.close(); server = null;
    },
    client() {
      return {
        cookie: '', csrf: '',
        async request(route, init = {}) {
          const res = await fetch(f.url + route, { redirect: 'manual', ...init,
            headers: { ...(this.cookie ? { Cookie: this.cookie } : {}), ...init.headers } });
          const cookie = res.headers.getSetCookie().find((value) => value.startsWith('jslab.sid='));
          if (cookie) this.cookie = cookie.split(';')[0];
          return res;
        },
        async page(route) {
          const res = await this.request(route);
          const text = await res.text();
          const token = text.match(/name="_csrf" value="([a-f0-9]+)"/);
          if (token) this.csrf = token[1];
          return { res, text };
        },
        form(route, data) {
          return this.request(route, { method: 'POST', body: new URLSearchParams({ _csrf: this.csrf, ...data }) });
        },
        json(route, data, extra = {}) {
          return this.request(route, { method: 'POST', body: JSON.stringify(data), headers: {
            'Content-Type': 'application/json', Accept: 'application/json', ...extra,
          } });
        },
        async login(username = 'admin') {
          await this.page('/auth');
          const oldCookie = this.cookie;
          const res = await this.form('/auth', { username, password: PASSWORD });
          assert.equal(res.status, 303);
          assert.notEqual(this.cookie, oldCookie, 'login rotates the session ID');
          await this.page('/jslab-cloud/workspace');
          return res;
        },
      };
    },
  };
  t.after(async () => { await f.stop(); fs.rmSync(dataDir, { recursive: true, force: true }); assert.deepEqual(errors, []); });
  await f.start();
  await runtime.accounts.create({ username: 'admin', password: PASSWORD, role: 'admin' });
  return f;
}

async function activate(client) {
  const codes = await client.form('/admin/jslab-cloud/activation-codes', { count: '1' });
  assert.equal(codes.status, 200);
  const code = (await codes.text()).match(/JSLAB-[0-9A-F]{16}/)?.[0];
  assert.ok(code);
  assert.equal((await client.form('/jslab-cloud/activation', { code })).status, 302);
}

test('standalone serves local pages/assets and enforces independent browser and device authentication', async (t) => {
  const f = await fixture(t);
  const browser = f.client();
  for (const route of ['/jslab-cloud', '/jslab-cloud/docs', '/jslab-cloud/downloads', '/healthz',
    '/jslab-cloud/host-assets/bootstrap.min.css', '/jslab-cloud/host-assets/bootstrap.bundle.min.js',
    '/jslab-cloud/host-assets/icons/bootstrap-icons.min.css', '/jslab-cloud/host-assets/icons/fonts/bootstrap-icons.woff2']) {
    const res = await browser.request(route);
    assert.equal(res.status, 200, route);
    await res.arrayBuffer();
  }
  assert.equal((await browser.request('/auth/register')).status, 404);
  assert.equal((await browser.request(`${API}/scripts`)).status, 401);
  const protectedPage = await browser.request('/jslab-cloud/workspace');
  assert.equal(protectedPage.status, 302);
  assert.equal(protectedPage.headers.get('location'), '/auth');
  await browser.page('/auth');
  const anonymousCookie = browser.cookie;
  assert.equal((await browser.form('/auth', { username: 'admin', password: PASSWORD, _csrf: '无'.repeat(64) })).status, 403);
  assert.equal((await browser.form('/auth', { username: 'admin', password: 'wrong' })).status, 401);
  await browser.login();
  const oldSession = f.client(); oldSession.cookie = anonymousCookie;
  assert.equal((await oldSession.request(`${API}/me`)).status, 401);
  assert.equal((await browser.request(`${API}/device/entitlements`)).status, 401, 'a browser cookie is not a device token');
  assert.equal((await browser.json(`${API}/scripts`, { name: 'blocked.js', source: '1' })).status, 403);
  await activate(browser);
  const source = '// 中文🙂\n'.repeat(9000) + 'console.log("standalone");';
  assert.ok(Buffer.byteLength(source) > 48 * 1024);
  const written = await browser.json(`${API}/scripts`, { name: 'large.js', source }, { 'X-CSRF-Token': browser.csrf });
  assert.equal(written.status, 200);
  const { id } = await written.json();
  assert.equal((await (await browser.request(`${API}/scripts/${id}`)).json()).source, source);
  const member = await f.runtime.accounts.create({ username: 'member', password: PASSWORD });
  const other = f.client(); await other.login('member');
  assert.equal((await other.request('/admin/users')).status, 403);
  assert.equal((await other.request(`${API}/scripts/${id}`)).status, 403);
  assert.equal((await browser.form(`/admin/users/${member.id}/status`, { status: 'disabled' })).status, 303);
  assert.equal((await other.request(`${API}/me`)).status, 401);
  assert.equal((await browser.form('/auth/logout', {})).status, 303);
  assert.equal((await browser.request(`${API}/me`)).status, 401);
});

test('legacy pairing, device writes, settings and login sessions persist across a standalone restart', async (t) => {
  const f = await fixture(t);
  const device = f.client(), browser = f.client();
  const pairing = await (await device.json(`${API}/device/pairing/start`, { name: 'Legacy JSLab' }, { 'X-Forwarded-Proto': 'https' })).json();
  assert.equal(pairing.qrValue, `${f.url}/jslab-cloud/pair?code=${pairing.code}`, 'untrusted proxy headers do not set the pairing origin');
  assert.equal((await browser.request(`/jslab-cloud/pair?code=${pairing.code}`)).status, 302);
  const login = await browser.login();
  assert.equal(login.headers.get('location'), `/jslab-cloud/pair?code=${pairing.code}`);
  await activate(browser);
  assert.equal((await browser.form('/jslab-cloud/pair/claim', { code: pairing.code })).status, 200);
  const exchange = await device.json(`${API}/device/exchange`, { code: pairing.code });
  assert.equal(exchange.status, 200);
  const { token } = await exchange.json();
  const authorization = { Authorization: `Bearer ${token}` };
  assert.equal((await device.json(`${API}/device/exchange`, { code: pairing.code })).status, 400);
  assert.equal((await device.request(`${API}/scripts`, { headers: authorization })).status, 401, 'device tokens do not sign in to browser APIs');
  const source = '// 兼容旧版\n'.repeat(10000) + 'console.log(42);';
  const saved = await device.json(`${API}/device/scripts`, { name: 'legacy.js', source }, authorization);
  assert.equal(saved.status, 200);
  const { id } = await saved.json();
  const settings = Object.fromEntries([...f.runtime.ctx.config.metadata].map(([key]) => [key, String(f.runtime.ctx.config.get(key))]));
  settings.aiApiKey = 'test-private-api-key';
  settings.aiModel = 'local-test-model';
  assert.equal((await browser.form('/admin/settings', settings)).status, 303);
  assert.doesNotMatch((await browser.page('/admin/settings')).text, /test-private-api-key/);
  await f.stop(); await f.start();
  assert.equal((await browser.request(`${API}/me`)).status, 200, 'session secret and cookie survive restart');
  assert.equal(f.runtime.ctx.config.get('aiModel'), 'local-test-model');
  assert.equal(f.runtime.ctx.config.get('aiApiKey'), 'test-private-api-key');
  const loaded = await device.request(`${API}/device/scripts/${id}`, { headers: authorization });
  assert.equal(loaded.status, 200);
  assert.equal((await loaded.json()).source, source);
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ package: 'icu.ccicc.jslab', name: 'JSLab', versionName: '2.0.7', config: { designWidth: 336 } }));
  zip.file('app.jsc', 'fixture');
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  const upload = await browser.request('/admin/jslab-cloud/downloads/full-pro/upload', { method: 'POST', body: bytes,
    headers: { 'Content-Type': 'application/octet-stream', 'X-JSLab-Filename': 'test.rpk', 'X-CSRF-Token': browser.csrf } });
  assert.equal(upload.status, 200, await upload.text());
  const download = await device.request('/jslab-cloud/downloads/full-pro');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes, 'body parsers preserve binary uploads');
  await f.runtime.accounts.resetPassword('admin', 'changed-test-password');
  assert.equal((await browser.request(`${API}/me`)).status, 401);
  assert.equal((await device.request(`${API}/device/entitlements`, { headers: authorization })).status, 200, 'password changes do not revoke paired devices');
});

test('opt-in registration creates ordinary users and administrator creation is authenticated', async (t) => {
  const f = await fixture(t, { registration: true });
  const browser = f.client();
  await browser.page('/auth/register');
  assert.equal((await browser.form('/auth/register', { username: 'newuser', password: 'short' })).status, 400);
  assert.equal((await browser.form('/auth/register', { username: 'newuser', password: PASSWORD, role: 'admin' })).status, 303);
  assert.equal((await browser.request('/admin/settings')).status, 403);
  assert.equal((await browser.form('/admin/users', { username: 'injected', password: PASSWORD, role: 'admin' })).status, 403);
  assert.equal(f.runtime.accounts.list().find((user) => user.username === 'newuser').role, 'user');
  await browser.page('/jslab-cloud/workspace');
  await browser.form('/auth/logout', {});
  await browser.page('/auth');
  for (let i = 0; i < 18; i++) assert.equal((await browser.form('/auth', { username: 'newuser', password: 'wrong' })).status, 401);
  assert.equal((await browser.form('/auth', { username: 'newuser', password: PASSWORD })).status, 429);
});

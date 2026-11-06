const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');
const JSZip = require('../node_modules/jszip');
const { createReleaseDownloads, DOWNLOAD_SLOTS, MAX_DOWNLOAD_BYTES } = require('../lib/release-downloads');
const { renderDownloadBanner, registerDownloadAdmin, registerDownloadPage } = require('../lib/browser-downloads');

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jslab-downloads-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const values = { downloadsDirectory: root, downloadsBannerEnabled: true };
  const routes = new Map();
  const router = scope => ({ get: (route, ...handlers) => routes.set(scope + ' GET ' + route, handlers), post: (route, ...handlers) => routes.set(scope + ' POST ' + route, handlers) });
  const ctx = {
    rootDir: path.resolve(__dirname, '..'),
    config: { get: key => values[key], set: (key, value) => { values[key] = value; } },
    routes: { frontend: router('frontend'), admin: router('admin') },
    users: { requireAdmin: (req, res, next) => req.user?.role === 'admin' ? next() : res.status(403).send('admin') },
    security: { csrfToken: () => 'csrf', csrfProtection: (req, res, next) => (req.headers['x-csrf-token'] || req.body?._csrf) === 'csrf' ? next() : res.status(403).send('csrf') },
    render: { adminPage: (_req, res, html) => res.send(html) }, logger: { warn() {} },
  };
  const downloads = createReleaseDownloads(ctx);
  downloads.registerRoutes();
  registerDownloadAdmin({ ctx, currentUser: req => req.user, log() {}, escapeHtml: escape, assetsVersion: 'test' }, downloads);
  registerDownloadPage(ctx, { downloads, escapeHtml: escape }, {
    page: (_req, res, html) => res.send(html),
    button: (label, url) => `<a href="${url}">${label}</a>`
  });
  async function invoke(key, req = {}) {
    const res = { code: 200, headers: {}, status(code) { this.code = code; return this; }, send(value) { this.body = value; return this; }, json(value) { this.body = value; return this; }, redirect(value) { this.redirected = value; return this; }, setHeader(key, value) { this.headers[key] = value; }, download(file, filename) { this.body = fs.readFileSync(file); this.filename = filename; return this; } };
    let index = 0;
    const next = () => routes.get(key)[index++]?.(req, res, next);
    await next();
    return res;
  }
  function request(buffer, name = 'test.rpk', slot = 'full-pro') {
    const req = Readable.from([buffer.subarray(0, 31), buffer.subarray(31)]);
    req.headers = { 'content-type': 'application/octet-stream', 'content-length': String(buffer.length), 'x-jslab-filename': encodeURIComponent(name), 'x-csrf-token': 'csrf' };
    req.params = { slot }; req.user = { id: 1, role: 'admin' };
    return req;
  }
  return { root, values, routes, ctx, downloads, invoke, request };
}
async function rpk(width = 336, name = 'JSLab', versionName = '2.0.5') {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ package: 'icu.ccicc.jslab', name, versionName, config: { designWidth: width } }));
  zip.file('app.jsc', 'test data');
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('directly placed files become public downloads and survive a new plugin service instance', async t => {
  const f = fixture(t);
  assert.equal(await renderDownloadBanner(f.downloads, escape), '');
  const bytes = await rpk();
  fs.writeFileSync(path.join(f.root, DOWNLOAD_SLOTS[1].filename), bytes);
  const response = await f.invoke('frontend GET /downloads/:slot', { params: { slot: 'full-pro' } });
  assert.deepEqual(response.body, bytes);
  assert.equal(response.filename, 'JSLab-Full-Pro-2.0.5.rpk');
  assert.match(await renderDownloadBanner(f.downloads, escape), /v2\.0\.5/);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  const banner = await renderDownloadBanner(f.downloads, escape);
  assert.match(banner, /data-jslab-download-dismiss/);
  assert.match(banner, /href="\/jslab-cloud\/downloads\/full-pro"/);
  assert.doesNotMatch(banner, /community|full-rw/);
  assert.equal((await createReleaseDownloads(f.ctx).list())[0].size, bytes.length);
  await new Promise(resolve => setTimeout(resolve, 5));
  const replacement = await rpk(336, 'JSLab', '2.0.7');
  fs.writeFileSync(path.join(f.root, DOWNLOAD_SLOTS[1].filename), replacement);
  const updated = await f.invoke('frontend GET /downloads/:slot', { params: { slot: 'full-pro' } });
  assert.equal(updated.filename, 'JSLab-Full-Pro-2.0.7.rpk');
  assert.deepEqual(updated.body, replacement);
  f.values.downloadsBannerEnabled = false;
  assert.equal(await renderDownloadBanner(f.downloads, escape), '');
  assert.equal((await f.invoke('frontend GET /downloads/:slot', { params: { slot: 'full-pro' } })).code, 200);
  assert.equal((await f.invoke('frontend GET /downloads/:slot', { params: { slot: '../private' } })).code, 404);
});

test('admin upload replaces complete packages and a failure keeps the old bytes and banner revision', async t => {
  const f = fixture(t);
  const first = await rpk();
  const saved = await f.invoke('admin POST /downloads/:slot/upload', f.request(first));
  assert.equal(saved.code, 200); assert.equal(saved.body.ok, true);
  const before = f.downloads.revision(await f.downloads.list());
  const wrongDevice = await f.invoke('admin POST /downloads/:slot/upload', f.request(await rpk(432)));
  assert.equal(wrongDevice.code, 400);
  const community = await f.invoke('admin POST /downloads/:slot/upload', f.request(await rpk(336, 'JSLab社区版')));
  assert.equal(community.code, 400);
  const invalid = await f.invoke('admin POST /downloads/:slot/upload', f.request(Buffer.from('not a package')));
  assert.equal(invalid.code, 400);
  assert.deepEqual(fs.readFileSync(path.join(f.root, DOWNLOAD_SLOTS[1].filename)), first);
  assert.equal(f.downloads.revision(await f.downloads.list()), before);
  const next = await rpk(336, 'JSLab', '2.0.7');
  await new Promise(resolve => setTimeout(resolve, 5));
  const replaced = await f.invoke('admin POST /downloads/:slot/upload', f.request(next));
  assert.equal(replaced.body.ok, true);
  assert.equal(replaced.body.file.versionName, '2.0.7');
  assert.equal(replaced.body.file.downloadName, 'JSLab-Full-Pro-2.0.7.rpk');
  assert.match((await f.invoke('frontend GET /downloads')).body, /v2\.0\.7/);
  assert.notEqual(f.downloads.revision(await f.downloads.list()), before);
  assert.ok(fs.readdirSync(f.root).every(name => !name.startsWith('.upload-')));
});

test('upload and banner settings require administrator identity and CSRF before reading bytes', async t => {
  const f = fixture(t);
  const bytes = await rpk();
  const denied = f.request(bytes); denied.user = { role: 'member' };
  assert.equal((await f.invoke('admin POST /downloads/:slot/upload', denied)).code, 403);
  const missingCsrf = f.request(bytes); missingCsrf.headers['x-csrf-token'] = 'wrong';
  assert.equal((await f.invoke('admin POST /downloads/:slot/upload', missingCsrf)).code, 403);
  assert.equal((await f.downloads.list()).length, 0);
  const req = { user: { id: 1, role: 'admin' }, headers: {}, body: { _csrf: 'csrf', enabled: '1' } };
  assert.match((await f.invoke('admin POST /downloads/settings', req)).redirected, /saved=1/);
  assert.equal(f.values.downloadsBannerEnabled, true);
  req.body = { _csrf: 'csrf' };
  await f.invoke('admin POST /downloads/settings', req);
  assert.equal(f.values.downloadsBannerEnabled, false);
});

test('wrong extension oversized incomplete and disconnected uploads leave no partial installation', async t => {
  const f = fixture(t), bytes = await rpk();
  const wrong = f.request(bytes, 'test.apk');
  assert.equal((await f.invoke('admin POST /downloads/:slot/upload', wrong)).code, 400);
  const large = f.request(bytes); large.headers['content-length'] = String(MAX_DOWNLOAD_BYTES + 1);
  assert.equal((await f.invoke('admin POST /downloads/:slot/upload', large)).code, 413);
  const incomplete = f.request(bytes); incomplete.headers['content-length'] = String(bytes.length + 1);
  assert.equal((await f.invoke('admin POST /downloads/:slot/upload', incomplete)).code, 400);
  const interrupted = Readable.from((async function* () { yield bytes.subarray(0, 31); throw new Error('disconnect'); })());
  Object.assign(interrupted, { headers: f.request(bytes).headers, params: { slot: 'full-pro' }, user: { id: 1, role: 'admin' } });
  assert.equal((await f.invoke('admin POST /downloads/:slot/upload', interrupted)).code, 500);
  assert.deepEqual(fs.readdirSync(f.root), []);
});

test('the actual Android and all four latest quick-app releases pass upload validation', async t => {
  const f = fixture(t), root = path.resolve(__dirname, '../..');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'vela-quickapp/src/manifest.json'), 'utf8')).versionName;
  const inputs = [
    ['android', 'android-sync/dist/JSLab-Sync-1.0.1.apk'],
    ['full-pro', `vela-quickapp/release-archive/JSLab-Full-Pro-${version}.rpk`],
    ['full-rw', `vela-quickapp/release-archive/JSLab-Full-RW-${version}.rpk`],
    ['community-pro', `vela-quickapp/release-archive/JSLab-Community-Pro-${version}.rpk`],
    ['community-rw', `vela-quickapp/release-archive/JSLab-Community-RW-${version}.rpk`],
  ];
  for (const [slot, name] of inputs) {
    const filename = path.join(root, name);
    if (!fs.existsSync(filename)) { t.diagnostic('Local release artifact not available: ' + name); continue; }
    const bytes = fs.readFileSync(filename);
    const res = await f.invoke('admin POST /downloads/:slot/upload', f.request(bytes, path.basename(name), slot));
    assert.equal(res.code, 200, res.body.message);
    assert.equal(res.body.file.size, bytes.length);
    assert.equal(res.body.file.versionName, slot === 'android' ? '1.0.1' : version);
    assert.ok(res.body.file.downloadName.includes('-' + res.body.file.versionName + '.'));
    assert.deepEqual((await f.invoke('frontend GET /downloads/:slot', { params: { slot } })).body, bytes);
  }
});

test('the independent download page is public and remains visible when the banner is disabled', async t => {
  const f = fixture(t);
  for (const slot of DOWNLOAD_SLOTS) fs.writeFileSync(path.join(f.root, slot.filename), Buffer.from('available'));
  f.values.downloadsBannerEnabled = false;
  const response = await f.invoke('frontend GET /downloads', { headers: {} });
  assert.equal(response.code, 200);
  for (const slot of DOWNLOAD_SLOTS) assert.ok(response.body.includes(`href="/jslab-cloud/downloads/${slot.id}"`));
  assert.match(response.body, /无需登录/);
  assert.match(response.body, /完整版/);
  assert.match(response.body, /社区版/);
  assert.match(response.body, /小米手环 Pro/);
  assert.match(response.body, /红米手表/);
  assert.doesNotMatch(response.body, /data-jslab-download-dismiss/);
  const admin = await f.invoke('admin GET /downloads', { user: { role: 'admin' } });
  assert.match(admin.body, /community-pro\/upload/);
  assert.match(admin.body, /community-rw\/upload/);
});

test('community uploads enforce edition and device and retain the prior file on invalid replacement', async t => {
  const f = fixture(t);
  const initial = await rpk(336, 'JSLab社区版');
  assert.equal((await f.invoke('admin POST /downloads/:slot/upload', f.request(initial, 'community.rpk', 'community-pro'))).code, 200);
  for (const invalid of [await rpk(336), await rpk(432, 'JSLab社区版')]) {
    assert.equal((await f.invoke('admin POST /downloads/:slot/upload', f.request(invalid, 'wrong.rpk', 'community-pro'))).code, 400);
    assert.deepEqual(fs.readFileSync(path.join(f.root, 'JSLab-Community-Pro.rpk')), initial);
  }
});

test('browser dismissal persists for one release and a replacement makes the banner visible again', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../assets/jslab-downloads.js'), 'utf8');
  const saved = new Map();
  function browser(revision) {
    let click;
    const banner = { hidden: false, getAttribute: () => revision, querySelector: () => ({ addEventListener: (_event, handler) => { click = handler; } }) };
    vm.runInNewContext(source, { document: { querySelector: () => banner, querySelectorAll: () => [] }, window: { localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) } } });
    return { banner, click: () => click() };
  }
  const first = browser('first'); assert.equal(first.banner.hidden, false);
  first.click(); assert.equal(first.banner.hidden, true);
  assert.equal(browser('first').banner.hidden, true);
  assert.equal(browser('replacement').banner.hidden, false);
});

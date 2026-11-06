'use strict';

const path = require('node:path');
const express = require('express');
const session = require('express-session');
const plugin = require('../index.js');
const manifest = require('../manifest.json');
const { readOptions } = require('./options.cjs');
const { openDatabase } = require('./database.cjs');
const { createAccounts, createSecurity, SqliteSessionStore } = require('./accounts.cjs');
const { createRenderer, escapeHtml } = require('./render.cjs');
const { registerHostPages } = require('./pages.cjs');

function createApp(overrides = {}) {
  const options = { ...readOptions(), ...overrides };
  const { db, config, sessionSecret } = openDatabase(options);
  const accounts = createAccounts(db);
  const store = new SqliteSessionStore(db);
  const app = express();
  const frontend = express.Router(), admin = express.Router();
  const navigation = { items: [], register(item) { this.items.push(item); } };
  const ctx = {
    id: manifest.id, manifest, rootDir: options.rootDir, phase: 'boot',
    db, config, navigation, logger: options.logger || console,
    routes: { frontend, admin }, ...createSecurity(accounts),
  };
  ctx.render = createRenderer(ctx);
  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxy);
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' });
    // The existing pairing code consumes this header; expose only Express's trusted protocol.
    req.headers['x-forwarded-proto'] = req.protocol;
    next();
  });
  const assets = '/jslab-cloud/host-assets';
  const staticFile = (route, filename) => app.get(`${assets}/${route}`, (req, res) => res.sendFile(filename));
  staticFile('bootstrap.min.css', require.resolve('bootstrap/dist/css/bootstrap.min.css'));
  staticFile('bootstrap.bundle.min.js', require.resolve('bootstrap/dist/js/bootstrap.bundle.min.js'));
  app.use(`${assets}/icons`, express.static(path.dirname(require.resolve('bootstrap-icons/font/bootstrap-icons.css'))));
  app.use(assets, express.static(path.join(__dirname, 'assets')));
  app.use(session({
    name: 'jslab.sid', secret: sessionSecret, store,
    resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: options.publicOrigin.startsWith('https://'), maxAge: 7 * 24 * 60 * 60_000 },
  }));
  // The binary package-upload routes keep their original request stream.
  app.use(express.json({ limit: options.bodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: options.bodyLimit }));
  try {
    plugin.boot(ctx);
    registerHostPages(app, ctx, accounts, options);
    app.use('/jslab-cloud', frontend);
    app.use('/admin/jslab-cloud', admin);
    app.get('/', (req, res) => res.redirect('/jslab-cloud'));
    app.get('/healthz', (req, res) => {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok', version: manifest.version });
    });
    app.use((req, res) => res.status(404).type('text').send('未找到此页面。'));
    app.use((error, req, res, next) => {
      if (res.headersSent) return next(error);
      const status = error.status >= 400 && error.status < 500 ? error.status : 500;
      if (status === 500) ctx.logger.error(error);
      const message = status === 500 ? '服务暂时无法完成请求，请稍后重试。'
        : status === 413 ? '请求超过本站设置的大小限制。' : status === 400 && error.type === 'entity.parse.failed' ? '请求数据格式不正确。' : error.message;
      res.status(status);
      if (req.originalUrl.startsWith('/jslab-cloud/api/') || req.accepts(['html', 'json']) === 'json') {
        return res.json({ error: status === 500 ? 'internal_error' : 'invalid_request', message });
      }
      ctx.render.withLayout(req, res, `<section class="shell-auth"><h1 class="h4">请求未完成</h1><p>${escapeHtml(message)}</p><a href="/jslab-cloud">返回首页</a></section>`, { page_title: '请求未完成' });
    });
  } catch (error) {
    store.close(); db.close(); throw error;
  }
  return { app, ctx, accounts, options, close() { store.close(); db.close(); } };
}

module.exports = { createApp };

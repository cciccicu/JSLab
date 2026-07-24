const { registerStaticFiles } = require('./lib/static-files');

/** @typedef {import('../ccicc-plugin-api').PluginContext} PluginContext */

module.exports = {
  /** @param {PluginContext} ctx */
  install(ctx) {
    ctx.config.register({
      key: 'title',
      displayName: 'Page title',
      valueType: 'string',
      defaultValue: 'VIP Notes',
      hotReload: true,
    });
    registerNavigation(ctx);
    ctx.db.exec(`
        CREATE TABLE IF NOT EXISTS ${ctx.db.table('notes')} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
  },

  /** @param {PluginContext} ctx */
  boot(ctx) {
    const table = ctx.db.table('notes');
    registerNavigation(ctx);
    registerStaticFiles(ctx, { '/assets': 'assets' });

    ctx.routes.frontend.get('/', async (req, res) => {
      const current = ctx.users.current(req);
      const canCreate = current?.role === 'vip' || current?.role === 'admin';
      const notes = /** @type {Array<{ id: number; body: string; created_at: string }>} */ (
        ctx.db.prepare(`SELECT id, body, created_at FROM ${table} ORDER BY id DESC LIMIT 20`).all()
      );
      const title = String(ctx.config.get('title') || 'VIP Notes');
      const form = canCreate ? renderForm(ctx.security.csrfToken(req)) : '<p>VIP users can add notes.</p>';
      const list = notes.length
        ? `<ul class="example-plugin-list">${notes.map((note) => `<li><span>${escapeHtml(note.body)}</span><small>${escapeHtml(note.created_at)}</small></li>`).join('')}</ul>`
        : '<p class="example-plugin-empty">No notes yet.</p>';

      await ctx.render.withLayout(req, res, `
        <link rel="stylesheet" href="/example-plugin/assets/example-plugin.css?v=${encodeURIComponent(ctx.manifest.version)}">
        <section class="plugin-page example-plugin">
          <header class="plugin-page-header">
            <h1 class="plugin-page-heading-title">${escapeHtml(title)}</h1>
            <p class="plugin-page-description">A standalone development-kit example.</p>
          </header>
          <div class="card"><div class="card-body">${form}${list}</div></div>
        </section>
      `, { page_title: title, seo_description: 'Example plugin' });
    });

    ctx.routes.frontend.post(
      '/notes',
      ctx.users.requireVip,
      ctx.security.csrfProtection,
      (req, res) => {
        const user = ctx.users.current(req);
        const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
        if (!user || !body || body.length > 280) {
          res.status(400).send('Invalid note');
          return;
        }
        ctx.db.prepare(`INSERT INTO ${table} (user_id, body) VALUES (?, ?)`).run(user.id, body);
        ctx.events.emit('example-plugin:note-created', { userId: user.id });
        res.redirect('/example-plugin');
      }
    );

    ctx.routes.admin.get('/', (req, res) => {
      const row = /** @type {{ count: number }} */ (
        ctx.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()
      );
      ctx.render.adminPage(req, res, `
        <div class="page-title"><div><h2>Example Plugin</h2><p>Administrator-only summary.</p></div></div>
        <div class="card"><div class="card-body"><strong>${row.count}</strong> notes</div></div>
      `, { page_title: 'Example Plugin Admin' });
    });

    ctx.registerModule({
      name: 'NoteCount',
      displayName: 'Example note count',
      render() {
        const row = /** @type {{ count: number }} */ (
          ctx.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()
        );
        return `<span>${row.count} notes</span>`;
      },
    });
  },

  /** @param {PluginContext} ctx */
  close(ctx) {
    ctx.logger.info('Example plugin closed');
  },
};

/** @param {PluginContext} ctx */
function registerNavigation(ctx) {
  ctx.navigation.register({
    category: 'Tools',
    name: 'Example Plugin',
    path: '/example-plugin',
    surface: 'frontend',
    icon: 'puzzle',
    sortOrder: 100,
  });
  ctx.navigation.register({
    category: 'Plugins',
    name: 'Example Plugin',
    path: '/admin/example-plugin',
    surface: 'admin',
    private: true,
    icon: 'puzzle',
    sortOrder: 100,
  });
}

/** @param {string} token */
function renderForm(token) {
  return `<form method="post" action="/example-plugin/notes" class="example-plugin-form">
    <input type="hidden" name="_csrf" value="${escapeHtml(token)}">
    <label class="form-label" for="example-plugin-note">New note</label>
    <div class="plugin-actions">
      <input class="form-control" id="example-plugin-note" name="body" maxlength="280" required>
      <button class="btn btn-primary">Add</button>
    </div>
  </form>`;
}

/** @param {unknown} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

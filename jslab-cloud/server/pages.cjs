'use strict';

const { escapeHtml: esc } = require('./render.cjs');
const { localReturnTo } = require('./accounts.cjs');

function registerHostPages(app, ctx, accounts, options) {
  const { requireAuth, requireAdmin, current } = ctx.users;
  const csrf = ctx.security.csrfProtection;
  const token = ctx.render.csrfInput;
  const passwordField = (name, label, autocomplete = 'new-password') => `<div class="mb-3"><label class="form-label" for="${name}">${label}</label><input class="form-control" id="${name}" name="${name}" type="password" autocomplete="${autocomplete}" minlength="${autocomplete === 'current-password' ? 1 : 12}" maxlength="256" required></div>`;
  const usernameField = '<div class="mb-3"><label class="form-label" for="username">用户名</label><input class="form-control" id="username" name="username" autocomplete="username" minlength="3" maxlength="40" required></div>';
  const heading = (title, description) => `<header class="plugin-page-header"><h1 class="plugin-page-heading-title">${title}</h1><p class="plugin-page-description">${description}</p></header>`;
  const authPage = (req, res, register = false, message = '') => {
    const title = register ? '创建账户' : '欢迎回来';
    ctx.render.withLayout(req, res, `<section class="shell-auth"><div class="shell-eyebrow">JSLAB CLOUD</div>${heading(title, register ? '在此站点保存脚本、配对设备和分享作品。' : '登录后继续编写、同步和分享你的脚本。')}${message ? `<div class="alert alert-danger" role="alert">${esc(message)}</div>` : ''}<form method="post" action="/auth${register ? '/register' : ''}">${token(req)}${usernameField}${passwordField('password', '密码', register ? 'new-password' : 'current-password')}${register ? '<p class="small text-body-secondary">用户名使用 3–40 位字母、数字、下划线、点或连字符。密码至少 12 位。</p>' : ''}<button class="btn btn-primary w-100" type="submit">${register ? '创建账户' : '登录'}</button></form><p class="mt-4 mb-0 small">${register ? '<a href="/auth">已有账户，前往登录</a>' : options.registration ? '<a href="/auth/register">创建新账户</a>' : '需要账户？请联系此站点的管理员。'}</p></section>`, { page_title: register ? '注册' : '登录' });
  };
  const rateLimit = (req, res, next) => {
    if (accounts.consumeLogin(req.ip)) return next();
    res.set('Retry-After', '600');
    res.status(429);
    authPage(req, res, false, '尝试次数过多，请在 10 分钟后重试。');
  };
  const signIn = async (req, res, user) => {
    const destination = localReturnTo(req.session.returnTo);
    await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.userId = user.id;
    req.session.userVersion = user.auth_version;
    await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
    res.redirect(303, destination);
  };
  app.get('/auth', (req, res) => current(req) ? res.redirect('/jslab-cloud/workspace') : authPage(req, res));
  app.post('/auth', csrf, rateLimit, async (req, res) => {
    const user = await accounts.authenticate(req.body?.username, req.body?.password);
    if (!user) { res.status(401); return authPage(req, res, false, '用户名或密码不正确，或账户已停用。'); }
    await signIn(req, res, user);
  });
  if (options.registration) {
    app.get('/auth/register', (req, res) => current(req) ? res.redirect('/jslab-cloud/workspace') : authPage(req, res, true));
    app.post('/auth/register', csrf, rateLimit, async (req, res) => {
      let user;
      try { user = await accounts.create({ username: req.body?.username, password: req.body?.password }); }
      catch (error) {
        if (error.status !== 400) throw error;
        res.status(400); return authPage(req, res, true, error.message);
      }
      await signIn(req, res, user);
    });
  }
  app.post('/auth/logout', csrf, (req, res, next) => req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('jslab.sid', { path: '/' });
    res.redirect(303, '/jslab-cloud');
  }));
  app.get('/account', requireAuth, (req, res) => ctx.render.withLayout(req, res,
    `<section class="shell-auth">${heading('账户设置', `当前账户：${esc(current(req).username)}`)}<form method="post" action="/account/password">${token(req)}${passwordField('currentPassword', '当前密码', 'current-password')}${passwordField('newPassword', '新密码')}<p class="small text-body-secondary">修改后，请使用新密码重新登录。</p><button class="btn btn-outline-primary" type="submit">修改密码</button></form></section>`, { page_title: '账户设置' }));
  app.post('/account/password', requireAuth, csrf, rateLimit, async (req, res, next) => {
    const user = current(req);
    if (!await accounts.authenticate(user.username, req.body?.currentPassword)) return res.status(400).send('当前密码不正确。');
    await accounts.resetPassword(user.username, req.body?.newPassword);
    req.session.destroy((error) => error ? next(error) : res.redirect(303, '/auth'));
  });

  app.get('/admin', requireAdmin, (req, res) => res.redirect('/admin/jslab-cloud'));
  app.get('/admin/users', requireAdmin, (req, res) => {
    const rows = accounts.list().map((user) => `<tr><td>${esc(user.username)}</td><td>${user.role === 'admin' ? '管理员' : '用户'}</td><td>${user.status === 'active' ? '正常' : '已停用'}</td><td>${esc(user.created_at)}</td><td>${user.id === current(req).id ? '当前账户' : `<form method="post" action="/admin/users/${user.id}/status">${token(req)}<input type="hidden" name="status" value="${user.status === 'active' ? 'disabled' : 'active'}"><button class="btn btn-sm btn-outline-${user.status === 'active' ? 'danger' : 'primary'}">${user.status === 'active' ? '停用' : '启用'}</button></form>`}</td></tr>`).join('');
    ctx.render.adminPage(req, res, `${heading('账户管理', '创建此站点的账户，管理访问权限。')}<div class="shell-admin-grid"><section class="card"><div class="card-body"><h2 class="h5 mb-3">所有账户</h2><div class="table-responsive"><table class="table align-middle"><thead><tr><th>用户名</th><th>角色</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></div></section><section class="card"><div class="card-body"><h2 class="h5 mb-3">创建账户</h2><form method="post" action="/admin/users">${token(req)}${usernameField}${passwordField('password', '初始密码')}<label class="form-label" for="role">角色</label><select class="form-select mb-3" id="role" name="role"><option value="user">用户</option><option value="admin">管理员</option></select><button class="btn btn-outline-primary" type="submit">创建账户</button></form></div></section></div>`, { page_title: '账户管理' });
  });
  app.post('/admin/users', requireAdmin, csrf, async (req, res) => {
    await accounts.create({ username: req.body?.username, password: req.body?.password, role: req.body?.role });
    req.session.notice = '账户已创建。';
    res.redirect(303, '/admin/users');
  });
  app.post('/admin/users/:id/status', requireAdmin, csrf, (req, res) => {
    accounts.setStatus(Number(req.params.id), req.body?.status, current(req).id);
    req.session.notice = '账户状态已更新。';
    res.redirect(303, '/admin/users');
  });

  const isSecret = (key) => key.endsWith('ApiKey');
  app.get('/admin/settings', requireAdmin, (req, res) => {
    const groups = new Map([['站点与下载', []], ['市场审核', []], ['代码生成', []]]);
    for (const spec of ctx.config.metadata.values()) {
      const key = spec.key, value = ctx.config.get(key), id = `setting-${key}`;
      const label = `<label class="form-label" for="${id}">${esc(spec.displayName)}</label>`;
      let input;
      if (spec.valueType === 'boolean') input = `<div class="form-check"><input class="form-check-input" type="checkbox" id="${id}" name="${key}" value="true"${value ? ' checked' : ''}>${label}</div>`;
      else if (isSecret(key)) input = `${label}<input class="form-control" type="password" id="${id}" name="${key}" autocomplete="new-password" placeholder="${value ? '已保存；留空保持原值' : '尚未设置'}"><div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="clear-${key}" name="clear_${key}" value="true"><label class="form-check-label small" for="clear-${key}">清除已保存的密钥</label></div>`;
      else if (spec.enumOptions) input = `${label}<select class="form-select" id="${id}" name="${key}">${spec.enumOptions.map((entry) => `<option value="${esc(entry)}"${entry === value ? ' selected' : ''}>${esc(key === 'marketModerationMode' ? { manual: '人工审核', llm: 'AI 自动审核' }[entry] : entry)}</option>`).join('')}</select>`;
      else if (spec.controlType === 'textarea') input = `${label}<textarea class="form-control" id="${id}" name="${key}" rows="5">${esc(value)}</textarea>`;
      else input = `${label}<input class="form-control" type="${spec.valueType === 'number' ? 'number' : 'text'}"${spec.valueType === 'number' ? ' step="any"' : ''} id="${id}" name="${key}" value="${esc(value)}"${key === 'pairingPublicOrigin' && options.publicOrigin ? ' disabled' : ''}>`;
      const group = key.startsWith('ai') ? '代码生成' : key.startsWith('llm') || key === 'marketModerationMode' ? '市场审核' : '站点与下载';
      groups.get(group).push(`<div class="mb-4">${input}<div class="form-text">${esc(spec.description)}</div></div>`);
    }
    ctx.render.adminPage(req, res, `${heading('服务配置', '配置本站的配对地址、下载内容和 AI 服务。保存后立即生效。')}<form method="post" action="/admin/settings">${token(req)}<div class="shell-settings-grid">${[...groups].map(([title, fields]) => `<section class="card"><div class="card-body"><h2 class="h5 mb-4">${title}</h2>${fields.join('')}</div></section>`).join('')}</div><button class="btn btn-primary mt-4" type="submit">保存配置</button></form>`, { page_title: '服务配置' });
  });
  app.post('/admin/settings', requireAdmin, csrf, (req, res) => {
    const updates = [];
    for (const spec of ctx.config.metadata.values()) {
      const key = spec.key;
      if (key === 'pairingPublicOrigin' && options.publicOrigin) continue;
      let value = req.body?.[key];
      if (isSecret(key) && req.body?.[`clear_${key}`] === 'true') value = '';
      else if (isSecret(key) && !value) continue;
      if (spec.valueType === 'boolean') value = value === 'true';
      else if (typeof value !== 'string') return res.status(400).send(`缺少配置项：${spec.displayName}`);
      else if (spec.valueType === 'number') {
        value = value.trim() === '' ? NaN : Number(value);
        if (!Number.isFinite(value)) return res.status(400).send(`请输入有效数值：${spec.displayName}`);
      }
      if (spec.enumOptions && !spec.enumOptions.includes(value)) return res.status(400).send(`配置值无效：${spec.displayName}`);
      updates.push([key, value]);
    }
    ctx.db.transaction(() => { for (const [key, value] of updates) ctx.config.set(key, value); })();
    req.session.notice = '配置已保存。';
    res.redirect(303, '/admin/settings');
  });
}

module.exports = { registerHostPages };

'use strict';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function createRenderer(ctx) {
  const csrfInput = (req) => `<input type="hidden" name="_csrf" value="${escapeHtml(ctx.security.csrfToken(req))}">`;
  function render(req, res, content, { page_title = 'JSLab Cloud' } = {}, admin = false) {
    const user = ctx.users.current(req);
    const currentPath = req.originalUrl.split('?')[0].replace(/\/$/, '');
    const nav = (url, title, icon) => `<a href="${escapeHtml(url)}"${currentPath === url ? ' aria-current="page"' : ''}><i class="bi bi-${icon}" aria-hidden="true"></i><span>${escapeHtml(title)}</span></a>`;
    const account = user
      ? `${nav('/account', user.username, 'person-circle')}<form method="post" action="/auth/logout">${csrfInput(req)}<button type="submit" class="shell-icon-button" title="退出登录" aria-label="退出登录"><i class="bi bi-box-arrow-right" aria-hidden="true"></i></button></form>`
      : nav('/auth', '登录', 'person-circle');
    const notice = req.session.notice;
    delete req.session.notice;
    res.type('html').send(`<!doctype html><html lang="zh-CN" data-bs-theme="light"><head>
      <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="color-scheme" content="light dark"><title>${escapeHtml(page_title)} · JSLab Cloud</title>
      <link rel="icon" href="/jslab-cloud/assets/jslab-mark.png">
      <script src="/jslab-cloud/host-assets/shell.js" defer></script>
      <link rel="stylesheet" href="/jslab-cloud/host-assets/bootstrap.min.css">
      <link rel="stylesheet" href="/jslab-cloud/host-assets/icons/bootstrap-icons.min.css">
      <link rel="stylesheet" href="/jslab-cloud/host-assets/shell.css">
      <script src="/jslab-cloud/host-assets/bootstrap.bundle.min.js" defer></script>
      </head><body><a class="visually-hidden-focusable shell-skip" href="#main">跳到内容</a>
      <header class="shell-header"><div class="shell-header-inner">
        <a class="shell-brand" href="/jslab-cloud"><img src="/jslab-cloud/assets/jslab-mark.png" width="30" height="30" alt=""><span>JSLab <span class="shell-brand-cloud">Cloud</span></span></a>
        <nav class="shell-nav" aria-label="主导航">${nav('/jslab-cloud/workspace', '云空间', 'cloud')}${nav('/jslab-cloud/workspace/market', '脚本市场', 'grid')}${nav('/jslab-cloud/docs', '文档', 'book')}${nav('/jslab-cloud/downloads', '下载', 'download')}</nav>
        <div class="shell-account">${user?.role === 'admin' ? nav('/admin/jslab-cloud', '管理', 'sliders') : ''}${account}<button class="shell-icon-button" type="button" data-theme-toggle aria-label="切换明暗主题" title="切换明暗主题"><i class="bi bi-circle-half" aria-hidden="true"></i></button></div>
      </div></header>
      ${admin ? `<nav class="shell-admin-nav" aria-label="管理导航"><div>${ctx.navigation.items.filter((item) => item.surface === 'admin').map((item) => nav(item.path, item.name, item.icon)).join('')}${nav('/admin/jslab-cloud/downloads', '安装包下载', 'download')}${nav('/admin/settings', '服务配置', 'gear')}${nav('/admin/users', '账户管理', 'people')}</div></nav>` : ''}
      <main id="main" class="shell-main${admin ? ' shell-main-admin' : ''}">${notice ? `<div class="alert alert-success" role="status">${escapeHtml(notice)}</div>` : ''}${content}</main>
      <footer class="shell-footer"><span>JSLab Cloud</span><a href="https://github.com/cciccicu/JSLab" target="_blank" rel="noopener"><i class="bi bi-github" aria-hidden="true"></i> GitHub</a><a href="/jslab-cloud/docs">使用指南</a></footer>
      </body></html>`);
  }
  return {
    csrfInput,
    withLayout: (req, res, content, page) => render(req, res, content, page),
    adminPage: (req, res, content, page) => render(req, res, content, page, true),
  };
}

module.exports = { escapeHtml, createRenderer };

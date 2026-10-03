/**
 * Register the inherited-mode SSR workspace. The host supplies the outer
 * Nunjucks layout; this module only returns page fragments and progressive JS.
 */
const { withErrorMessage } = require('./error-messages');

function registerBrowserPages(ctx, options) {
  const {
    scripts, marketScripts, devices, pairings, entitlementFor, currentUser, escapeHtml, formatCredit,
    writeScript, deleteScript, redeemActivationCode, hash, log,
  } = options;
  const assetVersion = encodeURIComponent(ctx.manifest.version);
  const assets = () => `<link rel="stylesheet" href="/jslab-cloud/assets/jslab-cloud.css?v=${assetVersion}"><script src="/jslab-cloud/assets/jslab-cloud.js?v=${assetVersion}" defer></script>`;
  const csrf = (req) => escapeHtml(ctx.security.csrfToken(req));
  const escAttr = (value) => escapeHtml(value).replace(/`/g, '&#96;');
  const page = (req, res, content, title) => ctx.render.withLayout(req, res, `${assets()}${content}`, { page_title: title });
  const button = (label, href, className = 'btn btn-outline-primary') => `<a class="${className}" href="${escAttr(href)}">${escapeHtml(label)}</a>`;
  const isAjax = (req) => String(req.headers?.accept || '').includes('application/json') || req.body?.ajax === '1';
  const json = (res, status, body) => {
    const responseBody = withErrorMessage(body);
    if (typeof res.status === 'function') res.status(status);
    if (typeof res.json === 'function') return res.json(responseBody);
    res.setHeader?.('Content-Type', 'application/json; charset=utf-8');
    return res.send(JSON.stringify(responseBody));
  };
  const modal = (id, title, body, size = '') => `<div class="modal fade jslab-cloud-modal" id="${id}" tabindex="-1" aria-labelledby="${id}-title" aria-hidden="true"><div class="modal-dialog modal-dialog-scrollable ${size}"><div class="modal-content"><div class="modal-header"><h2 class="modal-title fs-5" id="${id}-title">${title}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="关闭"></button></div><div class="modal-body">${body}</div></div></div></div>`;
  const statusBadge = (status) => {
    const labels = { published: '已发布', pending: '待审核', rejected: '已拒绝', draft: '草稿' };
    return `<span class="badge text-bg-${status === 'published' ? 'success' : status === 'pending' ? 'warning' : status === 'rejected' ? 'danger' : 'secondary'}">${labels[status] || labels.draft}</span>`;
  };
  const marketForm = (req) => `<form method="post" action="/jslab-cloud/api/cloud/market/submit" data-cloud-ajax data-cloud-publish-form><input type="hidden" name="_csrf" value="${csrf(req)}"><input type="hidden" name="ajax" value="1"><div class="mb-3"><label class="form-label" for="cloud-market-name">市场名称</label><input id="cloud-market-name" class="form-control" name="marketName" maxlength="124" required></div><div class="mb-3"><label class="form-label" for="cloud-market-type">脚本类型</label><select id="cloud-market-type" class="form-select" name="marketType" required><option value="" selected disabled>请选择脚本类型</option><option value="console">控制台脚本</option><option value="ui">UI 脚本</option></select></div><div class="mb-3"><label class="form-label" for="cloud-market-description">市场说明</label><textarea id="cloud-market-description" class="form-control" name="marketDescription" maxlength="1000" required></textarea></div><div class="mb-3"><label class="form-label" for="cloud-market-tags">标签</label><input id="cloud-market-tags" class="form-control" name="marketTags" placeholder="工具, 示例"></div><div class="mb-3"><label class="form-label" for="cloud-market-source">代码</label><textarea id="cloud-market-source" class="form-control jslab-cloud-code" name="source" rows="16" required></textarea></div><p class="small text-body-secondary">市场内容是独立快照。来自云空间时只自动填入代码，其他信息仍需填写。</p><button class="btn btn-primary" type="submit">提交审核</button></form>`;

  ctx.routes.frontend.get('/workspace', ctx.users.requireAuth, (req, res) => {
    const user = currentUser(req);
    const entitlement = entitlementFor(user.id);
    const query = String(req.query?.q || '').trim().slice(0, 80);
    const like = `%${query}%`;
    const rows = ctx.db.prepare(`SELECT id,name,type,source,updated_at FROM ${scripts} WHERE user_id=? AND name LIKE ? ORDER BY updated_at DESC`).all(user.id, like);
    const items = rows.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong><small class="d-block text-body-secondary">${row.type === 'ui' ? 'UI 脚本' : '控制台脚本'}</small></td><td class="text-body-secondary">${escapeHtml(row.updated_at)}</td><td class="text-end"><div class="plugin-actions justify-content-end"><button class="btn btn-sm btn-outline-primary" type="button" data-cloud-edit="${row.id}">编辑</button><a class="btn btn-sm btn-outline-secondary" href="/jslab-cloud/workspace/market?publish=${row.id}">发布到市场</a></div></td></tr>`).join('');
    const access = entitlement.cloud_enabled === 1
      ? `<div class="alert alert-success" role="status"><strong>云空间已激活。</strong> AI 余额：¥${formatCredit(entitlement.ai_credit_cents)}。</div>`
      : `<div class="alert alert-warning" role="status"><strong>云空间未激活。</strong> 创建或上传文件前请先兑换激活码。</div>`;
    const empty = `<div class="jslab-cloud-empty"><h2>没有找到脚本</h2><p>${query ? '请尝试其他搜索词。' : '创建第一个 JSLab 脚本开始同步。'}</p><button class="btn btn-outline-primary" type="button" data-cloud-new>新建文件</button></div>`;
    const entitlementModal = `<section class="jslab-cloud-activation-summary" aria-labelledby="cloud-activation-status"><h3 class="h6" id="cloud-activation-status">当前状态</h3><dl class="jslab-cloud-summary-grid"><div><dt>云空间</dt><dd>${entitlement.cloud_enabled === 1 ? '已激活' : '未激活'}</dd></div><div><dt>代码生成 AI</dt><dd>${entitlement.ai_enabled === 1 ? '已激活' : '未激活'}</dd></div><div><dt>AI 余额</dt><dd>¥${formatCredit(entitlement.ai_credit_cents)}</dd></div></dl></section><section class="jslab-cloud-redeem" aria-labelledby="cloud-redeem-title"><h3 class="h6" id="cloud-redeem-title">兑换激活码</h3><p class="text-body-secondary">首次兑换会激活云空间与代码生成 AI，后续兑换将增加 AI 余额。</p><form method="post" action="/jslab-cloud/workspace/activation" class="jslab-cloud-inline-form" data-cloud-ajax><input type="hidden" name="_csrf" value="${csrf(req)}"><input type="hidden" name="ajax" value="1"><label class="visually-hidden" for="activation-code-modal">激活码</label><input id="activation-code-modal" class="form-control font-monospace" name="code" maxlength="22" autocomplete="off" placeholder="JSLAB-XXXXXXXXXXXXXXXX" required><button class="btn btn-outline-primary" type="submit">兑换</button></form></section>`;
    const deviceRows = ctx.db.prepare(`SELECT id,name,last_used_at,created_at,revoked_at FROM ${devices} WHERE user_id=? ORDER BY id DESC`).all(user.id);
    const deviceItems = deviceRows.map((row) => `<tr data-cloud-row><td><strong>${escapeHtml(row.name)}</strong></td><td>${row.revoked_at ? '<span class="badge text-bg-secondary">已撤销</span>' : '<span class="badge text-bg-success">有效</span>'}</td><td>${escapeHtml(row.last_used_at || '从未使用')}</td><td class="text-end">${row.revoked_at ? '' : `<form method="post" action="/jslab-cloud/workspace/devices/${row.id}/revoke" data-cloud-ajax><input type="hidden" name="_csrf" value="${csrf(req)}"><input type="hidden" name="ajax" value="1"><button class="btn btn-sm btn-outline-danger" type="submit" data-confirm="确定撤销此设备吗？">撤销</button></form>`}</td></tr>`).join('');
    const pendingRows = ctx.db.prepare(`SELECT device_name,expires_at FROM ${pairings} WHERE user_id=? AND used_at IS NULL AND expires_at>datetime('now') ORDER BY created_at DESC`).all(user.id);
    const pendingItems = pendingRows.map((row) => `<tr><td>${escapeHtml(row.device_name)}</td><td><span class="badge text-bg-warning">等待手环完成</span></td><td>${escapeHtml(row.expires_at)}</td></tr>`).join('');
    const editorRows = rows.map((row) => `<div class="d-none" data-cloud-script="${row.id}" data-name="${escAttr(row.name)}" data-type="${escAttr(row.type)}" data-source="${escAttr(row.source)}"></div>`).join('');
    const editorForm = `<form method="post" action="/jslab-cloud/scripts/new" class="jslab-cloud-editor-form" data-cloud-ajax data-cloud-editor-modal><input type="hidden" name="_csrf" value="${csrf(req)}"><input type="hidden" name="ajax" value="1"><input type="hidden" name="id" data-cloud-editor-id><div class="mb-3"><label class="form-label" for="cloud-editor-name">文件名</label><input id="cloud-editor-name" class="form-control" name="name" maxlength="124" required></div><div><label class="form-label" for="cloud-editor-source">源码</label><textarea id="cloud-editor-source" class="form-control jslab-cloud-code" name="source" rows="18" required></textarea></div><div class="plugin-actions mt-3"><button class="btn btn-primary" type="submit">保存文件</button><button class="btn btn-outline-danger d-none" type="button" data-cloud-delete>删除文件</button></div></form>`;
    const workspaceModals = modal('cloud-activation-modal', '激活与充值', entitlementModal) + modal('cloud-pairing-modal', '设备管理', `<p class="text-body-secondary">在手环生成配对码后输入 8 位短码，或使用手环二维码打开确认页。</p><form method="post" action="/jslab-cloud/pair/claim" data-cloud-ajax class="jslab-cloud-pair-form"><input type="hidden" name="_csrf" value="${csrf(req)}"><input type="hidden" name="ajax" value="1"><label class="visually-hidden" for="cloud-pair-code">8 位配对码</label><input id="cloud-pair-code" class="form-control font-monospace text-uppercase" name="code" minlength="8" maxlength="8" autocomplete="one-time-code" placeholder="XXXXXXXX" required><button class="btn btn-primary" type="submit">确认配对</button></form><hr><h3 class="h6">待完成配对</h3><div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>设备</th><th>状态</th><th>有效期</th></tr></thead><tbody>${pendingItems || '<tr><td colspan="3" class="text-body-secondary">暂无待完成配对。</td></tr>'}</tbody></table></div><hr><h3 class="h6">已配对设备</h3><div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>设备</th><th>状态</th><th>最后使用</th><th></th></tr></thead><tbody>${deviceItems || '<tr><td colspan="4" class="text-body-secondary">暂无已配对设备。</td></tr>'}</tbody></table></div>`, 'modal-lg') + modal('cloud-editor-modal', '源码编辑', editorForm, 'modal-xl') + modal('cloud-publish-modal', '发布到市场', marketForm(req), 'modal-lg');
    return page(req, res, `<section class="plugin-page jslab-cloud-page"><header class="plugin-page-header plugin-page-heading"><div><h1 class="plugin-page-heading-title">JSLab Cloud</h1><p class="plugin-page-description">云空间只管理当前文件内容；市场发布是独立快照。</p></div><div class="plugin-actions"><button class="btn btn-primary" type="button" data-cloud-new>新建</button><button class="btn btn-outline-secondary" type="button" data-bs-toggle="modal" data-bs-target="#cloud-pairing-modal">设备管理</button><button class="btn btn-outline-secondary" type="button" data-bs-toggle="modal" data-bs-target="#cloud-activation-modal">充值与激活</button>${button('JS 市场', '/jslab-cloud/workspace/market', 'btn btn-outline-secondary')}</div></header>${access}<div class="jslab-cloud-toolbar"><form method="get" action="/jslab-cloud/workspace" class="jslab-cloud-search"><input class="form-control" name="q" value="${escAttr(query)}" placeholder="搜索云空间文件"><button class="btn btn-outline-secondary" type="submit">搜索</button></form></div><div class="card jslab-cloud-table-card"><div class="table-responsive"><table class="table align-middle mb-0 jslab-cloud-files-table"><thead><tr><th>云空间文件</th><th class="jslab-cloud-updated-column">更新时间</th><th><span class="visually-hidden">操作</span></th></tr></thead><tbody>${items || `<tr><td colspan="3">${empty}</td></tr>`}</tbody></table></div></div>${editorRows}</section>${workspaceModals}`, 'JSLab Cloud');
  });

  ctx.routes.frontend.get('/workspace/new', ctx.users.requireAuth, (req, res) => {
    const user = currentUser(req);
    if (entitlementFor(user.id).cloud_enabled !== 1) {
      return page(req, res, `<section class="plugin-page jslab-cloud-page"><div class="alert alert-warning"><h1>云空间未激活</h1><p>创建或编辑云端脚本前请先激活 JSLab Cloud 与 AI。</p>${button('前往激活', '/jslab-cloud/workspace?panel=activation')}</div></section>`, '云空间需要激活');
    }
    return res.redirect('/jslab-cloud/workspace?panel=editor');
  });

  ctx.routes.frontend.get('/workspace/scripts/:id', ctx.users.requireAuth, (req, res) => {
    const user = currentUser(req);
    const row = ctx.db.prepare(`SELECT * FROM ${scripts} WHERE id=? AND user_id=?`).get(Number(req.params.id), user.id);
    if (!row) return res.status(404).send('未找到脚本');
    return res.redirect(`/jslab-cloud/workspace?panel=editor&script=${row.id}`);
  });

  ctx.routes.frontend.post('/workspace/scripts/:id/save', ctx.users.requireAuth, ctx.security.csrfProtection, (req, res) => {
    const user = currentUser(req);
    const row = ctx.db.prepare(`SELECT * FROM ${scripts} WHERE id=? AND user_id=?`).get(Number(req.params.id), user.id);
    if (!row) return res.status(404).send('未找到脚本');
    return writeScript(req, res);
  });

  ctx.routes.frontend.post('/workspace/scripts/:id/delete', ctx.users.requireAuth, ctx.security.csrfProtection, (req, res) => {
    const user = currentUser(req);
    const row = ctx.db.prepare(`SELECT id FROM ${scripts} WHERE id=? AND user_id=?`).get(Number(req.params.id), user.id);
    if (!row) return res.status(404).send('未找到脚本');
    req.params.id = String(row.id);
    return deleteScript(req, res);
  });

  ctx.routes.frontend.get('/workspace/activation', ctx.users.requireAuth, (req, res) => {
    const user = currentUser(req);
    const entitlement = entitlementFor(user.id);
    const active = entitlement.cloud_enabled === 1;
    const notice = req.query?.redeemed === '1'
      ? '<div class="alert alert-success" role="status">激活完成，云空间和代码生成 AI 额度已更新。</div>'
      : req.query?.error === 'invalid'
        ? '<div class="alert alert-danger" role="alert">激活码无效或已经被使用，请检查后重试。</div>'
        : '';
    return page(req, res, `<section class="plugin-page jslab-cloud-page"><header class="plugin-page-header plugin-page-heading"><div><h1 class="plugin-page-heading-title">激活与额度</h1><p class="plugin-page-description">激活后可使用云同步和代码生成 AI。</p></div><div class="plugin-actions">${button('云端工作区', '/jslab-cloud/workspace', 'btn btn-outline-secondary')}</div></header>${notice}<div class="jslab-cloud-summary-grid"><div class="card"><div class="card-body"><span>云同步</span><strong>${active ? '已激活' : '未激活'}</strong></div></div><div class="card"><div class="card-body"><span>代码生成 AI</span><strong>${entitlement.ai_enabled === 1 ? '已激活' : '未激活'}</strong></div></div><div class="card"><div class="card-body"><span>AI 余额</span><strong>¥${formatCredit(entitlement.ai_credit_cents)}</strong></div></div></div><div class="card jslab-cloud-activation-card"><div class="card-body"><h2 class="h5">兑换激活码</h2><p class="text-body-secondary">首次有效兑换会激活账户并赠送 ¥2.00；之后每个未使用激活码增加 ¥3.00。</p><form method="post" action="/jslab-cloud/workspace/activation" class="jslab-cloud-inline-form"><input type="hidden" name="_csrf" value="${csrf(req)}"><label class="visually-hidden" for="activation-code">激活码</label><input id="activation-code" class="form-control" name="code" maxlength="22" autocomplete="off" placeholder="JSLAB-XXXXXXXXXXXXXXXX" required><button class="btn btn-outline-primary" type="submit">兑换</button></form></div></div></section>`, '激活与额度');
  });

  ctx.routes.frontend.get('/workspace/market', (req, res) => {
    const query = String(req.query?.q || '').trim().slice(0, 80);
    const tab = req.query?.tab === 'mine' && currentUser(req) ? 'mine' : 'market';
    const like = `%${query}%`;
    const user = currentUser(req);
    const rows = tab === 'mine'
      ? ctx.db.prepare(`SELECT id,name,type,description,status,pending_status,updated_at,owner_user_id FROM ${marketScripts} WHERE owner_user_id=? AND (status!='draft' OR pending_status IS NOT NULL) AND (name LIKE ? OR description LIKE ? OR tags LIKE ?) ORDER BY updated_at DESC LIMIT 50`).all(user.id, like, like, like)
      : ctx.db.prepare(`SELECT id,name,type,description,status,pending_status,updated_at,owner_user_id FROM ${marketScripts} WHERE status='published' AND (name LIKE ? OR description LIKE ? OR tags LIKE ?) ORDER BY updated_at DESC LIMIT 50`).all(like, like, like);
    const items = rows.map((row) => {
      const author = ctx.users.get(row.owner_user_id);
      const authorName = author?.display_name || author?.username || `用户 ${row.owner_user_id}`;
      const effective = row.pending_status === 'pending' || row.pending_status === 'rejected' ? row.pending_status : row.status;
      const manage = user && row.owner_user_id === user.id ? `<button class="btn btn-sm btn-outline-secondary" type="button" data-cloud-market-edit="${row.id}">编辑</button><form method="post" action="/jslab-cloud/workspace/market/${row.id}/delete" data-cloud-ajax><input type="hidden" name="_csrf" value="${csrf(req)}"><input type="hidden" name="ajax" value="1"><button class="btn btn-sm btn-outline-danger" type="submit" data-confirm="确定删除此市场脚本吗？">删除</button></form>` : '';
      const adminDelete = user?.role === 'admin' && row.owner_user_id !== user.id ? `<form method="post" action="/jslab-cloud/workspace/market/${row.id}/delete" data-cloud-ajax><input type="hidden" name="_csrf" value="${csrf(req)}"><input type="hidden" name="ajax" value="1"><button class="btn btn-sm btn-outline-danger" type="submit" data-confirm="确定删除此市场脚本吗？">删除</button></form>` : '';
      const view = row.status === 'published' ? `<a class="btn btn-sm btn-outline-secondary" href="/jslab-cloud/workspace/market/${row.id}">查看详情</a>` : '';
      const download = row.status === 'published' ? `<a class="btn btn-sm btn-outline-secondary" href="/jslab-cloud/workspace/market/${row.id}/download">下载</a>` : '';
      const save = tab === 'market' && user ? `<form method="post" action="/jslab-cloud/workspace/market/${row.id}/save" data-cloud-ajax><input type="hidden" name="_csrf" value="${csrf(req)}"><input type="hidden" name="ajax" value="1"><button class="btn btn-sm btn-outline-primary" type="submit">保存到云空间</button></form>` : '';
      const title = row.status === 'published' ? `<a href="/jslab-cloud/workspace/market/${row.id}">${escapeHtml(row.name)}</a>` : escapeHtml(row.name);
      return `<article class="card jslab-cloud-market-item"><div class="card-body"><div class="jslab-cloud-market-content"><div class="jslab-cloud-market-title"><h2 class="h5">${title}</h2><span class="badge text-bg-secondary">${row.type === 'ui' ? 'UI' : '控制台'}</span>${tab === 'mine' ? statusBadge(effective) : ''}</div><p class="jslab-cloud-market-description">${escapeHtml(row.description || '作者未提供说明。')}</p><p class="jslab-cloud-market-byline">作者：<a href="/jslab-cloud/workspace/authors/${row.owner_user_id}">${escapeHtml(authorName)}</a></p></div><div class="plugin-actions jslab-cloud-market-actions">${view}${save}${download}${manage}${adminDelete}</div></div></article>`;
    }).join('');
    const mineHref = `/jslab-cloud/workspace/market?tab=mine${query ? `&q=${encodeURIComponent(query)}` : ''}`;
    const marketHref = `/jslab-cloud/workspace/market${query ? `?q=${encodeURIComponent(query)}` : ''}`;
    const publishModal = user ? modal('cloud-publish-modal', '发布到市场', marketForm(req), 'modal-lg') : '';
    return page(req, res, `<section class="plugin-page jslab-cloud-page"><header class="plugin-page-header plugin-page-heading"><div><h1 class="plugin-page-heading-title">JS 市场</h1><p class="plugin-page-description">保存或下载前请检查源码。市场脚本拥有 JSLab 权限，不提供沙箱隔离。</p></div><div class="plugin-actions">${button('JSLab Cloud', '/jslab-cloud/workspace', 'btn btn-outline-secondary')}</div></header><nav class="nav nav-tabs jslab-cloud-market-tabs" aria-label="市场视图"><a class="nav-link${tab === 'market' ? ' active' : ''}" href="${marketHref}">市场脚本</a>${user ? `<a class="nav-link${tab === 'mine' ? ' active' : ''}" href="${mineHref}">我的发布</a>` : ''}</nav><form method="get" action="/jslab-cloud/workspace/market" class="jslab-cloud-search mb-4"><input type="hidden" name="tab" value="${tab}"><label class="visually-hidden" for="market-search">搜索市场</label><input id="market-search" class="form-control" name="q" value="${escAttr(query)}" placeholder="搜索市场"><button class="btn btn-outline-secondary">搜索</button></form><div class="jslab-cloud-market-grid">${items || `<div class="jslab-cloud-empty"><h2>${tab === 'mine' ? '尚未提交市场脚本' : '暂无公开脚本'}</h2><p>请尝试其他搜索词或稍后再来。</p></div>`}</div></section>${publishModal}`, tab === 'mine' ? '我的发布' : 'JS 市场');
  });

  ctx.routes.frontend.get('/api/cloud/market/:id/manage', ctx.users.requireAuth, (req, res) => {
    const user = currentUser(req);
    const row = ctx.db.prepare(`SELECT id,name,type,description,tags,source,status,pending_status,pending_name,pending_type,pending_description,pending_tags,pending_source,owner_user_id FROM ${marketScripts} WHERE id=? AND (owner_user_id=? OR ?='admin')`).get(Number(req.params.id), user.id, user.role);
    if (!row) return json(res, 404, { error: 'not_found' });
    const pending = row.pending_status === 'pending' || row.pending_status === 'rejected';
    json(res, 200, { script: { id: row.id, name: pending ? row.pending_name || row.name : row.name, type: pending ? row.pending_type || row.type : row.type, description: pending ? row.pending_description || row.description : row.description, tags: pending ? row.pending_tags || row.tags : row.tags, source: pending ? row.pending_source || row.source : row.source } });
  });

  ctx.routes.frontend.get('/workspace/publications', ctx.users.requireAuth, (req, res) => {
    return res.redirect('/jslab-cloud/workspace/market?tab=mine');
  });

  ctx.routes.frontend.get('/workspace/market/:id', (req, res) => {
    const row = ctx.db.prepare(`SELECT * FROM ${marketScripts} WHERE id=? AND status='published'`).get(Number(req.params.id));
    if (!row) return res.status(404).send('未找到市场脚本');
    const user = currentUser(req);
    const report = user ? `<button class="btn btn-outline-danger" type="button" data-bs-toggle="modal" data-bs-target="#cloud-report-modal">举报脚本</button>` : '';
    const reportModal = user ? modal('cloud-report-modal', '举报脚本', `<form method="post" action="/jslab-cloud/api/cloud/market/${row.id}/report"><input type="hidden" name="_csrf" value="${csrf(req)}"><div class="mb-3"><label class="form-label" for="report-reason">举报原因</label><textarea id="report-reason" class="form-control" name="reason" maxlength="500" rows="5" placeholder="请说明需要审核的问题" required></textarea><div class="form-text">最多 500 个字符。</div></div><div class="plugin-actions justify-content-end"><button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">取消</button><button class="btn btn-outline-danger" type="submit">提交举报</button></div></form>`) : '';
    const author = ctx.users.get(row.owner_user_id);
    const save = user ? `<form method="post" action="/jslab-cloud/workspace/market/${row.id}/save"><input type="hidden" name="_csrf" value="${csrf(req)}"><button class="btn btn-outline-primary">保存到我的云空间</button></form>` : '';
    return page(req, res, `<section class="plugin-page jslab-cloud-page"><header class="plugin-page-header plugin-page-heading"><div><p class="plugin-page-eyebrow">${row.type === 'ui' ? 'UI 脚本' : '控制台脚本'}</p><h1 class="plugin-page-heading-title">${escapeHtml(row.name)}</h1><p class="plugin-page-description">${escapeHtml(row.description || '作者未提供说明。')}</p><p class="text-body-secondary">作者：<a href="/jslab-cloud/workspace/authors/${row.owner_user_id}">${escapeHtml(author?.display_name || author?.username || `用户 ${row.owner_user_id}`)}</a></p></div><div class="plugin-actions">${save}${button('下载源码', `/jslab-cloud/workspace/market/${row.id}/download`)}${report}${button('返回市场', '/jslab-cloud/workspace/market', 'btn btn-outline-secondary')}</div></header><div class="alert alert-warning"><strong>可信源码风险提示：</strong>保存或下载前请阅读源码和权限声明。</div><div class="card jslab-cloud-source-card"><div class="jslab-cloud-source-toolbar"><span><strong>SHA-256</strong><code>${escapeHtml(row.hash)}</code></span><button class="btn btn-sm btn-outline-secondary" type="button" data-copy-source>复制源码</button></div><pre class="jslab-cloud-source"><code>${escapeHtml(row.source)}</code></pre></div></section>${reportModal}`, row.name);
  });

  ctx.routes.frontend.get('/workspace/market/:id/download', (req, res) => {
    const row = ctx.db.prepare(`SELECT id,name,source FROM ${marketScripts} WHERE id=? AND status='published'`).get(Number(req.params.id));
    if (!row) return res.status(404).send('未找到市场脚本');
    const stem = String(row.name || 'script').replace(/\.js$/i, '').replace(/[\\/"\r\n;]/g, '_').trim() || 'script';
    const filename = `${stem}.js`;
    res.setHeader('Content-Disposition', `attachment; filename="jslab-${row.id}.js"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return res.type('text/javascript; charset=utf-8').send(row.source);
  });

  ctx.routes.frontend.get('/workspace/authors/:id', (req, res) => {
    const authorId = Number(req.params.id);
    const author = ctx.users.get(authorId);
    if (!author) return res.status(404).send('未找到作者');
    const rows = ctx.db.prepare(`SELECT id,name,type,description FROM ${marketScripts} WHERE owner_user_id=? AND status='published' ORDER BY updated_at DESC`).all(authorId);
    const items = rows.map((row) => `<article class="card jslab-cloud-market-item"><div class="card-body"><div class="jslab-cloud-market-content"><div class="jslab-cloud-market-title"><h2 class="h5"><a href="/jslab-cloud/workspace/market/${row.id}">${escapeHtml(row.name)}</a></h2><span class="badge text-bg-secondary">${row.type === 'ui' ? 'UI' : '控制台'}</span></div><p class="jslab-cloud-market-description">${escapeHtml(row.description || '作者未提供说明。')}</p></div><div class="plugin-actions jslab-cloud-market-actions"><a class="btn btn-sm btn-outline-secondary" href="/jslab-cloud/workspace/market/${row.id}">查看详情</a><a class="btn btn-sm btn-outline-secondary" href="/jslab-cloud/workspace/market/${row.id}/download">下载</a></div></div></article>`).join('');
    const name = author.display_name || author.username;
    return page(req, res, `<section class="plugin-page jslab-cloud-page"><header class="plugin-page-header plugin-page-heading"><div><p class="plugin-page-eyebrow">作者</p><h1 class="plugin-page-heading-title">${escapeHtml(name)}</h1><p class="plugin-page-description">已发布的 JSLab 脚本。</p></div><div class="plugin-actions">${button('返回市场', '/jslab-cloud/workspace/market', 'btn btn-outline-secondary')}</div></header><div class="jslab-cloud-market-grid">${items || '<div class="jslab-cloud-empty"><h2>暂无公开脚本</h2></div>'}</div></section>`, name);
  });

  const unpublish = (userId, id) => ctx.db.transaction(() => {
    const row = ctx.db.prepare(`SELECT id FROM ${marketScripts} WHERE id=? AND owner_user_id=?`).get(id, userId);
    if (!row) return null;
    ctx.db.prepare(`UPDATE ${marketScripts} SET status='draft',pending_name=NULL,pending_type=NULL,pending_description=NULL,pending_tags=NULL,pending_source=NULL,pending_hash=NULL,pending_checksum=NULL,pending_status=NULL,updated_at=datetime('now') WHERE id=?`).run(row.id);
    return row;
  })();

  ctx.routes.frontend.post('/workspace/publications/:id/unpublish', ctx.users.requireAuth, ctx.security.csrfProtection, (req, res) => {
    const user = currentUser(req);
    const result = unpublish(user.id, Number(req.params.id));
    if (!result) return res.status(404).send('未找到市场脚本');
    log(user.id, 'market.unpublish', String(req.params.id));
    if (isAjax(req)) return json(res, 200, { ok: true, message: '市场发布状态已更新。', removeRow: true });
    return res.redirect('/jslab-cloud/workspace/publications');
  });

  ctx.routes.frontend.post('/workspace/market/:id/save', ctx.users.requireAuth, ctx.security.csrfProtection, (req, res) => {
    const user = currentUser(req);
    const csrfValue = req.body?._csrf;
    const row = ctx.db.prepare(`SELECT * FROM ${marketScripts} WHERE id=? AND status='published'`).get(Number(req.params.id));
    if (!row) return res.status(404).send('未找到市场脚本');
    const existing = ctx.db.prepare(`SELECT id FROM ${scripts} WHERE user_id=? AND name=?`).get(user.id, row.name);
    if (existing && req.body?.confirm !== '1') {
      if (isAjax(req)) return json(res, 409, { error: 'file_exists', message: `云空间已有 ${row.name}，是否替换？`, confirm: true });
      return page(req, res, `<section class="plugin-page jslab-cloud-page"><header class="plugin-page-header plugin-page-heading"><div><h1 class="plugin-page-heading-title">云空间已有同名文件</h1><p class="plugin-page-description">保存 ${escapeHtml(row.name)} 将替换云空间中的当前内容。本地手环文件不会改变。</p></div></header><div class="plugin-actions"><form method="post" action="/jslab-cloud/workspace/market/${row.id}/save"><input type="hidden" name="_csrf" value="${csrf(req)}"><input type="hidden" name="confirm" value="1"><button class="btn btn-outline-danger" type="submit">确认替换</button></form>${button('取消', `/jslab-cloud/workspace/market/${row.id}`, 'btn btn-outline-secondary')}</div></section>`, '确认替换云空间文件');
    }
    req.params.id = existing ? String(existing.id) : undefined;
    req.body = { name: row.name, source: row.source, _csrf: csrfValue || 'present' };
    return writeScript(req, res);
  });

  ctx.routes.frontend.post('/workspace/market/:id/delete', ctx.users.requireAuth, ctx.security.csrfProtection, (req, res) => {
    const user = currentUser(req);
    const row = ctx.db.prepare(`SELECT id,owner_user_id FROM ${marketScripts} WHERE id=?`).get(Number(req.params.id));
    if (!row || (row.owner_user_id !== user.id && user.role !== 'admin')) return json(res, 404, { error: 'not_found', message: '市场脚本不存在或无权删除。' });
    ctx.db.prepare(`DELETE FROM ${marketScripts} WHERE id=?`).run(row.id);
    log(user.id, 'market.delete', String(row.id));
    if (isAjax(req)) return json(res, 200, { ok: true, message: '市场脚本已删除。', removeCard: true });
    return res.redirect('/jslab-cloud/workspace/market?tab=mine');
  });

  ctx.routes.frontend.get('/pair', (req, res) => {
    const code = String(req.query?.code || '').trim().toUpperCase();
    if (!/^[0-9A-F]{8}$/.test(code)) return res.status(400).send('配对码无效或已过期');
    const user = currentUser(req);
    if (!user) return res.redirect('/login?returnTo=' + encodeURIComponent('/jslab-cloud/pair?code=' + code));
    const row = ctx.db.prepare(`SELECT device_name,expires_at,user_id,claimed_at,used_at FROM ${pairings} WHERE code_hash=?`).get(hash(code));
    if (!row || row.used_at || row.expires_at <= new Date().toISOString().slice(0, 19).replace('T', ' ')) return page(req, res, '<section class="plugin-page jslab-cloud-page"><div class="alert alert-warning"><h1>配对码已过期</h1><p>请在手环端重新生成配对码。</p></div></section>', '配对码已过期');
    const message = row.user_id === user.id ? '当前账户已确认，请回到手环等待完成配对。' : row.user_id ? '此配对码已被其他账户确认。' : '确认后，手环会自动完成设备配对。';
    return page(req, res, `<section class="plugin-page jslab-cloud-page"><header class="plugin-page-header plugin-page-heading"><div><h1 class="plugin-page-heading-title">配对手环</h1><p class="plugin-page-description">设备：${escapeHtml(row.device_name)}</p></div></header><div class="alert alert-info">${message}</div>${row.user_id ? '' : `<form method="post" action="/jslab-cloud/pair/claim"><input type="hidden" name="_csrf" value="${csrf(req)}"><input type="hidden" name="code" value="${escAttr(code)}"><button class="btn btn-primary">确认配对</button></form>`}</section>`, '配对手环');
  });

  ctx.routes.frontend.post('/pair/claim', ctx.users.requireAuth, ctx.security.csrfProtection, (req, res) => {
    const user = currentUser(req);
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!/^[0-9A-F]{8}$/.test(code)) return isAjax(req) ? json(res, 400, { error: 'invalid_code', message: '配对码格式无效。' }) : res.status(400).send('配对码无效');
    const result = ctx.db.prepare(`UPDATE ${pairings} SET user_id=?,claimed_at=datetime('now') WHERE code_hash=? AND user_id IS NULL AND used_at IS NULL AND expires_at > datetime('now')`).run(user.id, hash(code));
    if (!result.changes) return isAjax(req) ? json(res, 409, { error: 'pairing_unavailable', message: '配对码已被确认、使用或过期。' }) : res.status(409).send('配对码已被使用、确认或过期');
    log(user.id, 'device.pairing.claim', 'claimed');
    if (isAjax(req)) return json(res, 200, { ok: true, message: '已确认配对，请回到手环完成连接。', reload: true });
    return page(req, res, '<section class="plugin-page jslab-cloud-page"><div class="alert alert-success"><h1>已确认配对</h1><p>请回到手环，等待设备完成配对。</p></div></section>', '配对已确认');
  });

  ctx.routes.frontend.get('/workspace/devices', ctx.users.requireAuth, (req, res) => {
    const user = currentUser(req);
    const rows = ctx.db.prepare(`SELECT id,name,last_used_at,created_at,revoked_at FROM ${devices} WHERE user_id=? ORDER BY id DESC`).all(user.id);
    const items = rows.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td>${row.revoked_at ? '<span class="badge text-bg-secondary">已撤销</span>' : '<span class="badge text-bg-success">有效</span>'}</td><td>${escapeHtml(row.last_used_at || '从未使用')}</td><td>${escapeHtml(row.created_at)}</td><td class="text-end">${row.revoked_at ? '' : `<form method="post" action="/jslab-cloud/workspace/devices/${row.id}/revoke"><input type="hidden" name="_csrf" value="${csrf(req)}"><button class="btn btn-sm btn-outline-danger" data-confirm="确定撤销此设备吗？">撤销</button></form>`}</td></tr>`).join('');
    const pendingRows = ctx.db.prepare(`SELECT device_name,expires_at,claimed_at FROM ${pairings} WHERE user_id=? AND used_at IS NULL AND expires_at>datetime('now') ORDER BY created_at DESC`).all(user.id);
    const pending = pendingRows.map((row) => `<tr><td>${escapeHtml(row.device_name)}</td><td><span class="badge text-bg-warning">等待手环完成</span></td><td>${escapeHtml(row.expires_at)}</td></tr>`).join('');
    return page(req, res, `<section class="plugin-page jslab-cloud-page"><header class="plugin-page-header plugin-page-heading"><div><h1 class="plugin-page-heading-title">设备配对</h1><p class="plugin-page-description">在手环生成配对码后，可在此输入短码，或用手机扫描手环二维码。</p></div><div class="plugin-actions">${button('JSLab Cloud', '/jslab-cloud/workspace', 'btn btn-outline-secondary')}</div></header><div class="card jslab-cloud-activation-card"><div class="card-body"><h2 class="h5">输入手环配对码</h2><form method="post" action="/jslab-cloud/pair/claim" class="jslab-cloud-inline-form"><input type="hidden" name="_csrf" value="${csrf(req)}"><label class="visually-hidden" for="pairing-code">8 位配对码</label><input id="pairing-code" class="form-control font-monospace text-uppercase" name="code" minlength="8" maxlength="8" autocomplete="one-time-code" placeholder="XXXXXXXX" required><button class="btn btn-outline-primary" type="submit">确认配对</button></form></div></div><h2 class="h5 mt-4">等待手环完成</h2><div class="card jslab-cloud-table-card"><div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>设备</th><th>状态</th><th>有效期</th></tr></thead><tbody>${pending || '<tr><td colspan="3" class="text-body-secondary">暂无待完成配对。</td></tr>'}</tbody></table></div></div><h2 class="h5 mt-4">已配对设备</h2><div class="card jslab-cloud-table-card"><div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>设备</th><th>状态</th><th>最后使用</th><th>配对时间</th><th><span class="visually-hidden">操作</span></th></tr></thead><tbody>${items || '<tr><td colspan="5"><div class="jslab-cloud-empty"><h2>暂无已配对设备</h2></div></td></tr>'}</tbody></table></div></div></section>`, '设备配对');
  });

  ctx.routes.frontend.post('/workspace/devices/:id/revoke', ctx.users.requireAuth, ctx.security.csrfProtection, (req, res) => {
    const user = currentUser(req);
    const result = ctx.db.prepare(`UPDATE ${devices} SET revoked_at=datetime('now') WHERE id=? AND user_id=? AND revoked_at IS NULL`).run(Number(req.params.id), user.id);
    if (result.changes) log(user.id, 'device.revoke', String(req.params.id));
    if (isAjax(req)) return result.changes ? json(res, 200, { ok: true, message: '设备已撤销。', removeRow: true }) : json(res, 404, { error: 'not_found', message: '设备不存在或已经撤销。' });
    return res.redirect('/jslab-cloud/workspace/devices');
  });

  ctx.routes.frontend.post('/workspace/activation', ctx.users.requireAuth, ctx.security.csrfProtection, (req, res) => {
    const user = currentUser(req);
    const result = redeemActivationCode(user.id, req.body?.code);
    if (!result.ok) return isAjax(req) ? json(res, 400, { error: 'invalid_activation', message: '激活码无效或已经使用。' }) : res.redirect('/jslab-cloud/workspace/activation?error=invalid');
    log(user.id, 'activation.redeem', result.firstActivation ? 'initial' : 'topup');
    if (isAjax(req)) return json(res, 200, { ok: true, message: '激活与额度已更新。', reload: true });
    return res.redirect('/jslab-cloud/workspace/activation?redeemed=1');
  });

}

module.exports = { registerBrowserPages };

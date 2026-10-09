const { scriptFilename } = require('./script-filename');

function registerMarketPages(ctx, options, view) {
  const { scripts, marketScripts, currentUser, escapeHtml, writeScript, hash, log } = options;
  const { csrf, escAttr, page, button, isAjax, json, modal, statusBadge, marketForm } = view;
  ctx.routes.frontend.get('/workspace/market', (req, res) => {
    const query = String(req.query?.q || '').trim().slice(0, 80);
    const tab = req.query?.tab === 'mine' && currentUser(req) ? 'mine' : 'market';
    const like = `%${query}%`;
    const user = currentUser(req);
    const rows = tab === 'mine'
      ? ctx.db.prepare(`SELECT id,name,description,status,pending_status,updated_at,owner_user_id FROM ${marketScripts} WHERE owner_user_id=? AND (status!='draft' OR pending_status IS NOT NULL) AND (name LIKE ? OR description LIKE ? OR tags LIKE ?) ORDER BY updated_at DESC LIMIT 50`).all(user.id, like, like, like)
      : ctx.db.prepare(`SELECT id,name,description,status,pending_status,updated_at,owner_user_id FROM ${marketScripts} WHERE status='published' AND (name LIKE ? OR description LIKE ? OR tags LIKE ?) ORDER BY updated_at DESC LIMIT 50`).all(like, like, like);
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
      return `<article class="card jslab-cloud-market-item"><div class="card-body"><div class="jslab-cloud-market-content"><div class="jslab-cloud-market-title"><h2 class="h5">${title}</h2>${tab === 'mine' ? statusBadge(effective) : ''}</div><p class="jslab-cloud-market-description">${escapeHtml(row.description || '作者未提供说明。')}</p><p class="jslab-cloud-market-byline">作者：<a href="/jslab-cloud/workspace/authors/${row.owner_user_id}">${escapeHtml(authorName)}</a></p></div><div class="plugin-actions jslab-cloud-market-actions">${view}${save}${download}${manage}${adminDelete}</div></div></article>`;
    }).join('');
    const mineHref = `/jslab-cloud/workspace/market?tab=mine${query ? `&q=${encodeURIComponent(query)}` : ''}`;
    const marketHref = `/jslab-cloud/workspace/market${query ? `?q=${encodeURIComponent(query)}` : ''}`;
    const publishModal = user ? modal('cloud-publish-modal', '发布到市场', marketForm(req), 'modal-lg') : '';
    return page(req, res, `<section class="plugin-page jslab-cloud-page"><header class="plugin-page-header plugin-page-heading"><div><h1 class="plugin-page-heading-title">JS 市场</h1><p class="plugin-page-description">保存或下载前请检查源码。市场脚本拥有 JSLab 权限，不提供沙箱隔离。</p></div><div class="plugin-actions">${button('JSLab Cloud', '/jslab-cloud/workspace', 'btn btn-outline-secondary')}${button('文档', '/jslab-cloud/docs', 'btn btn-outline-secondary')}</div></header><nav class="nav nav-tabs jslab-cloud-market-tabs" aria-label="市场视图"><a class="nav-link${tab === 'market' ? ' active' : ''}" href="${marketHref}">市场脚本</a>${user ? `<a class="nav-link${tab === 'mine' ? ' active' : ''}" href="${mineHref}">我的发布</a>` : ''}</nav><form method="get" action="/jslab-cloud/workspace/market" class="jslab-cloud-search mb-4"><input type="hidden" name="tab" value="${tab}"><label class="visually-hidden" for="market-search">搜索市场</label><input id="market-search" class="form-control" name="q" value="${escAttr(query)}" placeholder="搜索市场"><button class="btn btn-outline-secondary">搜索</button></form><div class="jslab-cloud-market-grid">${items || `<div class="jslab-cloud-empty"><h2>${tab === 'mine' ? '尚未提交市场脚本' : '暂无公开脚本'}</h2><p>请尝试其他搜索词或稍后再来。</p></div>`}</div></section>${publishModal}`, tab === 'mine' ? '我的发布' : 'JS 市场');
  });

  ctx.routes.frontend.get('/api/cloud/market/:id/manage', ctx.users.requireAuth, (req, res) => {
    const user = currentUser(req);
    const row = ctx.db.prepare(`SELECT id,name,description,tags,source,status,pending_status,pending_name,pending_description,pending_tags,pending_source,owner_user_id FROM ${marketScripts} WHERE id=? AND (owner_user_id=? OR ?='admin')`).get(Number(req.params.id), user.id, user.role);
    if (!row) return json(res, 404, { error: 'not_found' });
    const pending = row.pending_status === 'pending' || row.pending_status === 'rejected';
    json(res, 200, { script: { id: row.id, name: pending ? row.pending_name || row.name : row.name, description: pending ? row.pending_description || row.description : row.description, tags: pending ? row.pending_tags || row.tags : row.tags, source: pending ? row.pending_source || row.source : row.source } });
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
    return page(req, res, `<section class="plugin-page jslab-cloud-page"><header class="plugin-page-header plugin-page-heading"><div><h1 class="plugin-page-heading-title">${escapeHtml(row.name)}</h1><p class="plugin-page-description">${escapeHtml(row.description || '作者未提供说明。')}</p><p class="text-body-secondary">作者：<a href="/jslab-cloud/workspace/authors/${row.owner_user_id}">${escapeHtml(author?.display_name || author?.username || `用户 ${row.owner_user_id}`)}</a></p></div><div class="plugin-actions">${save}${button('下载源码', `/jslab-cloud/workspace/market/${row.id}/download`)}${report}${button('返回市场', '/jslab-cloud/workspace/market', 'btn btn-outline-secondary')}</div></header><div class="alert alert-warning"><strong>可信源码风险提示：</strong>保存或下载前请阅读源码和权限声明。</div><div class="card jslab-cloud-source-card"><div class="jslab-cloud-source-toolbar"><span><strong>SHA-256</strong><code>${escapeHtml(row.hash)}</code></span><button class="btn btn-sm btn-outline-secondary" type="button" data-copy-source>复制源码</button></div><pre class="jslab-cloud-source"><code>${escapeHtml(row.source)}</code></pre></div></section>${reportModal}`, row.name);
  });

  ctx.routes.frontend.get('/workspace/market/:id/download', (req, res) => {
    const row = ctx.db.prepare(`SELECT id,name,source FROM ${marketScripts} WHERE id=? AND status='published'`).get(Number(req.params.id));
    if (!row) return res.status(404).send('未找到市场脚本');
    const filename = scriptFilename(row.name);
    res.setHeader('Content-Disposition', `attachment; filename="jslab-${row.id}.js"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return res.type('text/javascript; charset=utf-8').send(row.source);
  });

  ctx.routes.frontend.get('/workspace/authors/:id', (req, res) => {
    const authorId = Number(req.params.id);
    const author = ctx.users.get(authorId);
    if (!author) return res.status(404).send('未找到作者');
    const rows = ctx.db.prepare(`SELECT id,name,description FROM ${marketScripts} WHERE owner_user_id=? AND status='published' ORDER BY updated_at DESC`).all(authorId);
    const items = rows.map((row) => `<article class="card jslab-cloud-market-item"><div class="card-body"><div class="jslab-cloud-market-content"><div class="jslab-cloud-market-title"><h2 class="h5"><a href="/jslab-cloud/workspace/market/${row.id}">${escapeHtml(row.name)}</a></h2></div><p class="jslab-cloud-market-description">${escapeHtml(row.description || '作者未提供说明。')}</p></div><div class="plugin-actions jslab-cloud-market-actions"><a class="btn btn-sm btn-outline-secondary" href="/jslab-cloud/workspace/market/${row.id}">查看详情</a><a class="btn btn-sm btn-outline-secondary" href="/jslab-cloud/workspace/market/${row.id}/download">下载</a></div></div></article>`).join('');
    const name = author.display_name || author.username;
    return page(req, res, `<section class="plugin-page jslab-cloud-page"><header class="plugin-page-header plugin-page-heading"><div><p class="plugin-page-eyebrow">作者</p><h1 class="plugin-page-heading-title">${escapeHtml(name)}</h1><p class="plugin-page-description">已发布的 JSLab 脚本。</p></div><div class="plugin-actions">${button('返回市场', '/jslab-cloud/workspace/market', 'btn btn-outline-secondary')}</div></header><div class="jslab-cloud-market-grid">${items || '<div class="jslab-cloud-empty"><h2>暂无公开脚本</h2></div>'}</div></section>`, name);
  });

  const unpublish = (userId, id) => ctx.db.transaction(() => {
    const row = ctx.db.prepare(`SELECT id FROM ${marketScripts} WHERE id=? AND owner_user_id=?`).get(id, userId);
    if (!row) return null;
    ctx.db.prepare(`UPDATE ${marketScripts} SET status='draft',pending_name=NULL,pending_description=NULL,pending_tags=NULL,pending_source=NULL,pending_hash=NULL,pending_checksum=NULL,pending_status=NULL,updated_at=datetime('now') WHERE id=?`).run(row.id);
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
    const filename = scriptFilename(row.name);
    const existing = ctx.db.prepare(`SELECT id FROM ${scripts} WHERE user_id=? AND name=?`).get(user.id, filename);
    if (existing && req.body?.confirm !== '1') {
      if (isAjax(req)) return json(res, 409, { error: 'file_exists', message: `云空间已有 ${filename}，是否替换？`, confirm: true });
      return page(req, res, `<section class="plugin-page jslab-cloud-page"><header class="plugin-page-header plugin-page-heading"><div><h1 class="plugin-page-heading-title">云空间已有同名文件</h1><p class="plugin-page-description">保存 ${escapeHtml(filename)} 将替换云空间中的当前内容。本地手环文件不会改变。</p></div></header><div class="plugin-actions"><form method="post" action="/jslab-cloud/workspace/market/${row.id}/save"><input type="hidden" name="_csrf" value="${csrf(req)}"><input type="hidden" name="confirm" value="1"><button class="btn btn-outline-danger" type="submit">确认替换</button></form>${button('取消', `/jslab-cloud/workspace/market/${row.id}`, 'btn btn-outline-secondary')}</div></section>`, '确认替换云空间文件');
    }
    req.params.id = existing ? String(existing.id) : undefined;
    req.body = { name: filename, source: row.source, _csrf: csrfValue || 'present' };
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
}

module.exports = { registerMarketPages };

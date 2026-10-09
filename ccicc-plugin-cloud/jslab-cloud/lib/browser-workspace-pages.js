function registerWorkspacePages(ctx, options, view) {
  const { scripts, devices, pairings, entitlementFor, currentUser, escapeHtml,
    formatCredit, writeScript, deleteScript } = options;
  const { csrf, escAttr, page, button, modal, marketForm } = view;
  const activationPurchase = '<p>还没有激活码？<a href="https://catfk.com/shop/788UHUA9" target="_blank" rel="noopener noreferrer">购买激活码</a>，购买后在这里兑换。</p>';
  ctx.routes.frontend.get('/workspace', ctx.users.requireAuth, (req, res) => {
    const user = currentUser(req);
    const entitlement = entitlementFor(user.id);
    const query = String(req.query?.q || '').trim().slice(0, 80);
    const like = `%${query}%`;
    const rows = ctx.db.prepare(`SELECT id,name,source,updated_at FROM ${scripts} WHERE user_id=? AND name LIKE ? ORDER BY updated_at DESC`).all(user.id, like);
    const items = rows.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td class="text-body-secondary">${escapeHtml(row.updated_at)}</td><td class="text-end"><div class="plugin-actions justify-content-end"><button class="btn btn-sm btn-outline-primary" type="button" data-cloud-edit="${row.id}">编辑</button><a class="btn btn-sm btn-outline-secondary" href="/jslab-cloud/workspace/market?publish=${row.id}">发布到市场</a></div></td></tr>`).join('');
    const access = entitlement.cloud_enabled === 1
      ? `<div class="alert alert-success" role="status"><strong>云空间已激活。</strong> AI 余额：¥${formatCredit(entitlement.ai_credit_cents)}。</div>`
      : `<div class="alert alert-warning" role="status"><strong>云空间未激活。</strong> 创建或上传文件前请先兑换激活码。</div>`;
    const empty = `<div class="jslab-cloud-empty"><h2>没有找到脚本</h2><p>${query ? '请尝试其他搜索词。' : '创建第一个 JSLab 脚本开始同步。'}</p><button class="btn btn-outline-primary" type="button" data-cloud-new>新建文件</button></div>`;
    const entitlementModal = `<section class="jslab-cloud-activation-summary" aria-labelledby="cloud-activation-status"><h3 class="h6" id="cloud-activation-status">当前状态</h3><dl class="jslab-cloud-summary-grid"><div><dt>云空间</dt><dd>${entitlement.cloud_enabled === 1 ? '已激活' : '未激活'}</dd></div><div><dt>代码生成 AI</dt><dd>${entitlement.ai_enabled === 1 ? '已激活' : '未激活'}</dd></div><div><dt>AI 余额</dt><dd>¥${formatCredit(entitlement.ai_credit_cents)}</dd></div></dl></section><section class="jslab-cloud-redeem" aria-labelledby="cloud-redeem-title"><h3 class="h6" id="cloud-redeem-title">兑换激活码</h3><p class="text-body-secondary">首次兑换会激活云空间与代码生成 AI，后续兑换将增加 AI 余额。</p>${activationPurchase}<form method="post" action="/jslab-cloud/workspace/activation" class="jslab-cloud-inline-form" data-cloud-ajax><input type="hidden" name="_csrf" value="${csrf(req)}"><input type="hidden" name="ajax" value="1"><label class="visually-hidden" for="activation-code-modal">激活码</label><input id="activation-code-modal" class="form-control font-monospace" name="code" maxlength="22" autocomplete="off" placeholder="JSLAB-XXXXXXXXXXXXXXXX" required><button class="btn btn-outline-primary" type="submit">兑换</button></form></section>`;
    const deviceRows = ctx.db.prepare(`SELECT id,name,last_used_at,created_at,revoked_at FROM ${devices} WHERE user_id=? ORDER BY id DESC`).all(user.id);
    const deviceItems = deviceRows.map((row) => `<tr data-cloud-row><td><strong>${escapeHtml(row.name)}</strong></td><td>${row.revoked_at ? '<span class="badge text-bg-secondary">已撤销</span>' : '<span class="badge text-bg-success">有效</span>'}</td><td>${escapeHtml(row.last_used_at || '从未使用')}</td><td class="text-end">${row.revoked_at ? '' : `<form method="post" action="/jslab-cloud/workspace/devices/${row.id}/revoke" data-cloud-ajax><input type="hidden" name="_csrf" value="${csrf(req)}"><input type="hidden" name="ajax" value="1"><button class="btn btn-sm btn-outline-danger" type="submit" data-confirm="确定撤销此设备吗？">撤销</button></form>`}</td></tr>`).join('');
    const pendingRows = ctx.db.prepare(`SELECT device_name,expires_at FROM ${pairings} WHERE user_id=? AND used_at IS NULL AND expires_at>datetime('now') ORDER BY created_at DESC`).all(user.id);
    const pendingItems = pendingRows.map((row) => `<tr><td>${escapeHtml(row.device_name)}</td><td><span class="badge text-bg-warning">等待手环完成</span></td><td>${escapeHtml(row.expires_at)}</td></tr>`).join('');
    const editorRows = rows.map((row) => `<div class="d-none" data-cloud-script="${row.id}" data-name="${escAttr(row.name)}" data-source="${escAttr(row.source)}"></div>`).join('');
    const editorForm = `<form method="post" action="/jslab-cloud/scripts/new" class="jslab-cloud-editor-form" data-cloud-ajax data-cloud-editor-modal><input type="hidden" name="_csrf" value="${csrf(req)}"><input type="hidden" name="ajax" value="1"><input type="hidden" name="id" data-cloud-editor-id><div class="mb-3"><label class="form-label" for="cloud-editor-name">文件名</label><input id="cloud-editor-name" class="form-control" name="name" maxlength="128" required></div><div><label class="form-label" for="cloud-editor-source">源码</label><textarea id="cloud-editor-source" class="form-control jslab-cloud-code" name="source" rows="18" required></textarea></div><div class="plugin-actions mt-3"><button class="btn btn-primary" type="submit">保存文件</button><button class="btn btn-outline-danger d-none" type="button" data-cloud-delete>删除文件</button></div></form>`;
    const workspaceModals = modal('cloud-activation-modal', '激活与充值', entitlementModal) + modal('cloud-pairing-modal', '设备管理', `<p class="text-body-secondary">在手环生成配对码后输入 8 位短码，或使用手环二维码打开确认页。</p><form method="post" action="/jslab-cloud/pair/claim" data-cloud-ajax class="jslab-cloud-pair-form"><input type="hidden" name="_csrf" value="${csrf(req)}"><input type="hidden" name="ajax" value="1"><label class="visually-hidden" for="cloud-pair-code">8 位配对码</label><input id="cloud-pair-code" class="form-control font-monospace text-uppercase" name="code" minlength="8" maxlength="8" autocomplete="one-time-code" placeholder="XXXXXXXX" required><button class="btn btn-primary" type="submit">确认配对</button></form><hr><h3 class="h6">待完成配对</h3><div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>设备</th><th>状态</th><th>有效期</th></tr></thead><tbody>${pendingItems || '<tr><td colspan="3" class="text-body-secondary">暂无待完成配对。</td></tr>'}</tbody></table></div><hr><h3 class="h6">已配对设备</h3><div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>设备</th><th>状态</th><th>最后使用</th><th></th></tr></thead><tbody>${deviceItems || '<tr><td colspan="4" class="text-body-secondary">暂无已配对设备。</td></tr>'}</tbody></table></div>`, 'modal-lg') + modal('cloud-editor-modal', '源码编辑', editorForm, 'modal-xl') + modal('cloud-publish-modal', '发布到市场', marketForm(req), 'modal-lg');
    return page(req, res, `<section class="plugin-page jslab-cloud-page"><header class="plugin-page-header plugin-page-heading"><div><h1 class="plugin-page-heading-title">JSLab Cloud</h1><p class="plugin-page-description">云空间只管理当前文件内容；市场发布是独立快照。</p></div><div class="plugin-actions"><button class="btn btn-primary" type="button" data-cloud-new>新建</button><button class="btn btn-outline-secondary" type="button" data-bs-toggle="modal" data-bs-target="#cloud-pairing-modal">设备管理</button><button class="btn btn-outline-secondary" type="button" data-bs-toggle="modal" data-bs-target="#cloud-activation-modal">充值与激活</button>${button('JS 市场', '/jslab-cloud/workspace/market', 'btn btn-outline-secondary')}${button('文档', '/jslab-cloud/docs', 'btn btn-outline-secondary')}</div></header>${access}<div class="jslab-cloud-toolbar"><form method="get" action="/jslab-cloud/workspace" class="jslab-cloud-search"><input class="form-control" name="q" value="${escAttr(query)}" placeholder="搜索云空间文件"><button class="btn btn-outline-secondary" type="submit">搜索</button></form></div><div class="card jslab-cloud-table-card"><div class="table-responsive"><table class="table align-middle mb-0 jslab-cloud-files-table"><thead><tr><th>云空间文件</th><th class="jslab-cloud-updated-column">更新时间</th><th><span class="visually-hidden">操作</span></th></tr></thead><tbody>${items || `<tr><td colspan="3">${empty}</td></tr>`}</tbody></table></div></div>${editorRows}</section>${workspaceModals}`, 'JSLab Cloud');
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
    return page(req, res, `<section class="plugin-page jslab-cloud-page"><header class="plugin-page-header plugin-page-heading"><div><h1 class="plugin-page-heading-title">激活与额度</h1><p class="plugin-page-description">激活后可使用云同步和代码生成 AI。</p></div><div class="plugin-actions">${button('云端工作区', '/jslab-cloud/workspace', 'btn btn-outline-secondary')}</div></header>${notice}<div class="jslab-cloud-summary-grid"><div class="card"><div class="card-body"><span>云同步</span><strong>${active ? '已激活' : '未激活'}</strong></div></div><div class="card"><div class="card-body"><span>代码生成 AI</span><strong>${entitlement.ai_enabled === 1 ? '已激活' : '未激活'}</strong></div></div><div class="card"><div class="card-body"><span>AI 余额</span><strong>¥${formatCredit(entitlement.ai_credit_cents)}</strong></div></div></div><div class="card jslab-cloud-activation-card"><div class="card-body"><h2 class="h5">兑换激活码</h2><p class="text-body-secondary">首次有效兑换会激活账户并赠送 ¥2.00；之后每个未使用激活码增加 ¥3.00。</p>${activationPurchase}<form method="post" action="/jslab-cloud/workspace/activation" class="jslab-cloud-inline-form"><input type="hidden" name="_csrf" value="${csrf(req)}"><label class="visually-hidden" for="activation-code">激活码</label><input id="activation-code" class="form-control" name="code" maxlength="22" autocomplete="off" placeholder="JSLAB-XXXXXXXXXXXXXXXX" required><button class="btn btn-outline-primary" type="submit">兑换</button></form></div></div></section>`, '激活与额度');
  });
}

module.exports = { registerWorkspacePages };

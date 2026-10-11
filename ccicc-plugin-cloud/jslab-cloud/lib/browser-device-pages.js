function registerDevicePages(ctx, options, view) {
  const { devices, pairings, currentUser, escapeHtml, redeemActivationCode, hash, log } = options;
  const { csrf, escAttr, page, button, isAjax, json } = view;
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
    const items = rows.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td data-label="状态">${row.revoked_at ? '<span class="badge text-bg-secondary">已撤销</span>' : '<span class="badge text-bg-success">有效</span>'}</td><td data-label="最后使用">${escapeHtml(row.last_used_at || '从未使用')}</td><td data-label="配对时间">${escapeHtml(row.created_at)}</td><td class="text-end jslab-cloud-record-actions">${row.revoked_at ? '' : `<form method="post" action="/jslab-cloud/workspace/devices/${row.id}/revoke"><input type="hidden" name="_csrf" value="${csrf(req)}"><button class="btn btn-sm btn-outline-danger" data-confirm="确定撤销此设备吗？">撤销</button></form>`}</td></tr>`).join('');
    const pendingRows = ctx.db.prepare(`SELECT device_name,expires_at,claimed_at FROM ${pairings} WHERE user_id=? AND used_at IS NULL AND expires_at>datetime('now') ORDER BY created_at DESC`).all(user.id);
    const pending = pendingRows.map((row) => `<tr><td>${escapeHtml(row.device_name)}</td><td data-label="状态"><span class="badge text-bg-warning">等待手环完成</span></td><td data-label="有效期">${escapeHtml(row.expires_at)}</td></tr>`).join('');
    return page(req, res, `<section class="plugin-page jslab-cloud-page"><header class="plugin-page-header plugin-page-heading"><div><h1 class="plugin-page-heading-title">设备配对</h1><p class="plugin-page-description">在手环生成配对码后，可在此输入短码，或用手机扫描手环二维码。</p></div><div class="plugin-actions">${button('JSLab Cloud', '/jslab-cloud/workspace', 'btn btn-outline-secondary')}</div></header><div class="card jslab-cloud-activation-card"><div class="card-body"><h2 class="h5">输入手环配对码</h2><form method="post" action="/jslab-cloud/pair/claim" class="jslab-cloud-inline-form"><input type="hidden" name="_csrf" value="${csrf(req)}"><label class="visually-hidden" for="pairing-code">8 位配对码</label><input id="pairing-code" class="form-control font-monospace text-uppercase" name="code" minlength="8" maxlength="8" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" pattern="[0-9a-fA-F]{8}" placeholder="XXXXXXXX" required><button class="btn btn-outline-primary" type="submit">确认配对</button></form></div></div><h2 class="h5 mt-4">等待手环完成</h2><div class="card jslab-cloud-table-card"><div class="table-responsive"><table class="table align-middle mb-0 jslab-cloud-record-table" role="table"><thead><tr><th scope="col">设备</th><th scope="col">状态</th><th scope="col">有效期</th></tr></thead><tbody>${pending || '<tr><td colspan="3" class="text-body-secondary">暂无待完成配对。</td></tr>'}</tbody></table></div></div><h2 class="h5 mt-4">已配对设备</h2><div class="card jslab-cloud-table-card"><div class="table-responsive"><table class="table align-middle mb-0 jslab-cloud-record-table" role="table"><thead><tr><th scope="col">设备</th><th scope="col">状态</th><th scope="col">最后使用</th><th scope="col">配对时间</th><th scope="col"><span class="visually-hidden">操作</span></th></tr></thead><tbody>${items || '<tr><td colspan="5"><div class="jslab-cloud-empty"><h2>暂无已配对设备</h2></div></td></tr>'}</tbody></table></div></div></section>`, '设备配对');
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

module.exports = { registerDevicePages };

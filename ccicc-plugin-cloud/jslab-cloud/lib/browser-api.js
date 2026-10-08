function registerBrowserApi(state, services) {
  const { ctx, scripts, devices, json, currentUser, entitlementFor, consume, log } = state;
  const { redeemActivationCode } = services.activation;
  const { cloudFiles, market } = services;
  const writeScript = (req, res) => cloudFiles.writeScript(req, res, currentUser(req), true);
  const deleteScript = (req, res) => cloudFiles.deleteScript(req, res, currentUser(req), true);
  ctx.routes.frontend.get('/', (req, res) => res.redirect('/jslab-cloud/workspace'));
  ctx.routes.frontend.get('/activation', ctx.users.requireAuth, (req, res) => res.redirect('/jslab-cloud/workspace/activation'));
  ctx.routes.frontend.post('/activation', ctx.users.requireAuth, ctx.security.csrfProtection, (req, res) => {
    const user = currentUser(req);
    if (!consume(`activation:${user.id}:${req.ip || req.headers['x-forwarded-for'] || 'unknown'}`, 10, 60_000)) {
      return res.status(429).send('激活尝试次数过多');
    }
    const result = redeemActivationCode(user.id, req.body?.code);
    if (!result.ok) return res.redirect('/jslab-cloud/workspace/activation?error=invalid');
    log(user.id, 'activation.redeem', result.firstActivation ? 'initial' : 'topup');
    return res.redirect('/jslab-cloud/workspace/activation?redeemed=1');
  });
  ctx.routes.frontend.get('/market', (req, res) => res.redirect('/jslab-cloud/workspace/market'));
  ctx.routes.frontend.get('/market/:id', (req, res) => res.redirect(`/jslab-cloud/workspace/market/${Number(req.params.id)}`));
  ctx.routes.frontend.get('/devices', ctx.users.requireAuth, (req, res) => res.redirect('/jslab-cloud/workspace/devices'));
  ctx.routes.frontend.post('/devices/pair', ctx.users.requireAuth, ctx.security.csrfProtection, (req, res) => res.redirect('/jslab-cloud/workspace/devices'));
  ctx.routes.frontend.get('/scripts/new', ctx.users.requireAuth, (req, res) => res.redirect('/jslab-cloud/workspace/new'));
  ctx.routes.frontend.get('/scripts/:id', ctx.users.requireAuth, (req, res) => res.redirect(`/jslab-cloud/workspace/scripts/${Number(req.params.id)}`));
  ctx.routes.frontend.post('/scripts/:id/save', ctx.users.requireAuth, ctx.security.csrfProtection, (req, res) => {
    const user = currentUser(req); const row = ctx.db.prepare(`SELECT * FROM ${scripts} WHERE id=? AND user_id=?`).get(Number(req.params.id), user.id);
    if (!row) return res.status(404).send('未找到脚本');
    req.body.name = row.name;
    return writeScript(req, res);
  });
  ctx.routes.frontend.post('/scripts/new', ctx.users.requireAuth, ctx.security.csrfProtection, (req, res) => writeScript(req, res));
  ctx.routes.frontend.get('/api/cloud/me', (req, res) => {
    const user = currentUser(req);
    if (!user) return json(res, 401, { error: 'auth_required' });
    const rows = ctx.db.prepare(`SELECT id,name,updated_at FROM ${scripts} WHERE user_id=? ORDER BY updated_at DESC`).all(user.id);
    const entitlement = entitlementFor(user.id);
    json(res, 200, { user: { id: user.id, username: user.username, email: user.email }, entitlement: { cloudEnabled: entitlement.cloud_enabled === 1, aiEnabled: entitlement.ai_enabled === 1, aiCreditCents: entitlement.ai_credit_cents }, scripts: rows });
  });
  ctx.routes.frontend.get('/api/cloud/scripts', ctx.users.requireAuth,
    (req, res) => cloudFiles.listScripts(req, res, currentUser(req)));
  ctx.routes.frontend.get('/api/cloud/scripts/:id', ctx.users.requireAuth,
    (req, res) => cloudFiles.getScript(req, res, currentUser(req)));
  ctx.routes.frontend.post('/api/cloud/scripts', ctx.users.requireAuth, ctx.security.csrfProtection, writeScript);
  ctx.routes.frontend.delete('/api/cloud/scripts/:id', ctx.users.requireAuth, ctx.security.csrfProtection, deleteScript);
  ctx.routes.frontend.get('/api/cloud/devices', ctx.users.requireAuth, (req, res) => { const user = currentUser(req); const rows = ctx.db.prepare(`SELECT id,name,last_used_at,created_at,revoked_at FROM ${devices} WHERE user_id=? ORDER BY id DESC`).all(user.id); json(res, 200, { devices: rows }); });
  ctx.routes.frontend.post('/api/cloud/devices/:id/revoke', ctx.users.requireAuth, ctx.security.csrfProtection, (req, res) => { const user = currentUser(req); const result = ctx.db.prepare(`UPDATE ${devices} SET revoked_at=datetime('now') WHERE id=? AND user_id=? AND revoked_at IS NULL`).run(Number(req.params.id), user.id); if (!result.changes) return json(res, 404, { error: 'not_found' }); log(user.id, 'device.revoke', String(req.params.id)); json(res, 200, { id: Number(req.params.id) }); });
  ctx.routes.frontend.get('/api/cloud/market', market.listMarket);
  ctx.routes.frontend.get('/api/cloud/market/:id/source', market.getMarketSource);
  ctx.routes.frontend.post('/api/cloud/market/:id/report', ctx.users.requireAuth,
    ctx.security.csrfProtection, market.reportMarket);
  ctx.routes.frontend.post('/api/cloud/market/submit', ctx.users.requireAuth,
    ctx.security.csrfProtection, (req, res) => market.submitMarket(req, res, currentUser(req), true));
}

module.exports = { registerBrowserApi };

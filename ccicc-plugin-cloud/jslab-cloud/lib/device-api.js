const crypto = require('crypto');
const { identity: RUNTIME_CONTRACT } = require('./runtime-contract.json');

function registerDeviceApi(state, services) {
  const { ctx, devices, pairings, json, hash, log, consume, requireDevice,
    deviceUser, entitlementFor, DEFAULT_PAIRING_PUBLIC_ORIGIN } = state;
  const { cloudFiles, market, ai } = services;

  ctx.routes.frontend.get('/api/cloud/device/scripts', requireDevice,
    (req, res) => cloudFiles.listScripts(req, res, deviceUser(req)));
  ctx.routes.frontend.get('/api/cloud/device/scripts/:id', requireDevice,
    (req, res) => cloudFiles.getScript(req, res, deviceUser(req)));
  ctx.routes.frontend.post('/api/cloud/device/scripts', requireDevice,
    (req, res) => cloudFiles.writeScript(req, res, deviceUser(req)));
  ctx.routes.frontend.put('/api/cloud/device/scripts/:id', requireDevice,
    (req, res) => cloudFiles.writeScript(req, res, deviceUser(req)));
  ctx.routes.frontend.delete('/api/cloud/device/scripts/:id', requireDevice,
    (req, res) => cloudFiles.deleteScript(req, res, deviceUser(req)));
  const pairingOrigin = (req) => {
    const configured = String(ctx.config.get('pairingPublicOrigin') || '').trim().replace(/\/$/, '');
    if (configured) return configured;
    const forwarded = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
    const protocol = forwarded || (req.protocol ? String(req.protocol) : 'http');
    const host = String(req.headers?.host || '192.168.3.17:3000').split(',')[0].trim();
    if (/^jslab-api\.ccicc\.icu(?::\d+)?$/i.test(host)) return DEFAULT_PAIRING_PUBLIC_ORIGIN;
    return protocol + '://' + host;
  };
  ctx.routes.frontend.post('/api/cloud/device/pairing/start', (req, res) => {
    if (!consume(`pair-start:${req.ip || req.headers['x-forwarded-for'] || 'unknown'}`, 10, 60_000)) return json(res, 429, { error: 'rate_limited' });
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const deviceName = String(req.body?.name || 'JSLab device').trim().slice(0, 80) || 'JSLab device';
    ctx.db.prepare(`INSERT INTO ${pairings} (code_hash,device_name,expires_at) VALUES (?, ?, datetime('now','+10 minutes'))`).run(hash(code), deviceName);
    const qrValue = pairingOrigin(req) + '/jslab-cloud/pair?code=' + encodeURIComponent(code);
    log(null, 'device.pairing.start', 'issued');
    json(res, 200, { code, qrValue, expiresIn: 600, deviceName });
  });
  ctx.routes.frontend.get('/api/cloud/device/pairing/status', (req, res) => {
    const code = String(req.query?.code || '').trim().toUpperCase();
    const row = /^[0-9A-F]{8}$/.test(code) ? ctx.db.prepare(`SELECT device_name,user_id,claimed_at,used_at,expires_at FROM ${pairings} WHERE code_hash=?`).get(hash(code)) : null;
    if (!row) return json(res, 404, { error: 'pairing_not_found' });
    if (row.used_at) return json(res, 200, { status: 'used' });
    if (new Date(row.expires_at + 'Z').getTime() <= Date.now()) return json(res, 200, { status: 'expired' });
    json(res, 200, { status: row.claimed_at ? 'claimed' : 'pending', deviceName: row.device_name, expiresAt: row.expires_at });
  });
  ctx.routes.frontend.post('/api/cloud/device/pairing/cancel', (req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!/^[0-9A-F]{8}$/.test(code)) return json(res, 400, { error: 'invalid_pairing_code' });
    const result = ctx.db.prepare(`DELETE FROM ${pairings} WHERE code_hash=? AND used_at IS NULL`).run(hash(code));
    json(res, 200, { cancelled: result.changes === 1 });
  });
  ctx.routes.frontend.post('/api/cloud/device/exchange', (req, res) => {
    if (!consume(`exchange:${req.ip || req.headers['x-forwarded-for'] || 'unknown'}`, 20, 60_000)) return json(res, 429, { error: 'rate_limited' });
    const token = crypto.randomBytes(32).toString('base64url');
    const exchange = ctx.db.transaction(() => {
      const code = String(req.body?.code || '').trim().toUpperCase();
      const codeHash = hash(code);
      const row = ctx.db.prepare(`SELECT * FROM ${pairings} WHERE code_hash=? AND user_id IS NOT NULL AND used_at IS NULL AND expires_at > datetime('now')`).get(codeHash);
      if (!row) return null;
      const consumed = ctx.db.prepare(`UPDATE ${pairings} SET used_at=datetime('now') WHERE code_hash=? AND used_at IS NULL AND expires_at > datetime('now')`).run(codeHash);
      if (consumed.changes !== 1) return null;
      ctx.db.prepare(`INSERT INTO ${devices} (user_id,name,token_hash) VALUES (?, ?, ?)`).run(row.user_id, row.device_name || String(req.body?.name || 'JSLab device').slice(0, 80), hash(token));
      return row.user_id;
    })();
    if (!exchange) return json(res, 400, { error: 'invalid_pairing_code' });
    json(res, 200, { token, userId: exchange });
  });
  ctx.routes.frontend.post('/api/cloud/device/revoke', requireDevice, (req, res) => {
    const header = String(req.headers.authorization || '');
    const token = header.replace(/^Bearer\s+/i, '').trim();
    const result = ctx.db.prepare(`UPDATE ${devices} SET revoked_at=datetime('now') WHERE token_hash=? AND revoked_at IS NULL`).run(hash(token));
    if (!result.changes) return json(res, 401, { error: 'device_auth_required' });
    log(null, 'device.self_revoke', 'current');
    json(res, 200, { revoked: true });
  });
  ctx.routes.frontend.get('/api/cloud/device/entitlements', requireDevice, (req, res) => {
    const user = deviceUser(req); const entitlement = entitlementFor(user.id);
    json(res, 200, { runtimeContract: RUNTIME_CONTRACT, entitlement: { cloudEnabled: entitlement.cloud_enabled === 1, aiEnabled: entitlement.ai_enabled === 1, aiCreditCents: Number(entitlement.ai_credit_cents) || 0 } });
  });
  ctx.routes.frontend.post('/api/cloud/device/ai/generate', requireDevice, async (req, res) => {
    const user = deviceUser(req); const result = await ai.generateAiSource(user, req.body || {});
    if (result.error) return json(res, result.status, { error: result.error });
    return json(res, 200, result);
  });
  ctx.routes.frontend.get('/api/cloud/device/market', market.listMarket);
  ctx.routes.frontend.get('/api/cloud/device/market/:id/source', market.getMarketSource);
  ctx.routes.frontend.post('/api/cloud/device/market/submit', requireDevice,
    (req, res) => market.submitMarket(req, res, deviceUser(req)));
}

module.exports = { registerDeviceApi };

const crypto = require('crypto');

function createActivationService(state) {
  const { ctx, activationCodes, entitlements, entitlementFor, hash, log, INITIAL_AI_CREDIT_CENTS, ACTIVATION_CODE_CREDIT_CENTS } = state;
  const issueActivationCodes = (adminId, count) => {
    const requested = Math.min(500, Math.max(1, Math.floor(Number(count) || 0)));
    const batchId = crypto.randomBytes(8).toString('hex');
    const codes = [];
    const insert = ctx.db.prepare(`INSERT INTO ${activationCodes} (code_hash,credit_cents,batch_id,created_by) VALUES (?, ?, ?, ?)`);
    const issue = ctx.db.transaction(() => {
      while (codes.length < requested) {
        const code = 'JSLAB-' + crypto.randomBytes(8).toString('hex').toUpperCase();
        try {
          insert.run(hash(code), ACTIVATION_CODE_CREDIT_CENTS, batchId, adminId);
          codes.push(code);
        } catch (error) {
          if (!/UNIQUE/i.test(String(error && error.message))) throw error;
        }
      }
    });
    issue();
    log(adminId, 'activation_codes.issue', `${batchId}:${codes.length}`);
    return { batchId, codes };
  };
  const redeemActivationCode = (userId, code) => {
    const normalized = String(code || '').trim().toUpperCase();
    if (!/^JSLAB-[0-9A-F]{16}$/.test(normalized)) return { ok: false, error: 'invalid_activation_code' };
    const redeem = ctx.db.transaction(() => {
      const codeRow = ctx.db.prepare(`SELECT * FROM ${activationCodes} WHERE code_hash=? AND redeemed_at IS NULL`).get(hash(normalized));
      if (!codeRow) return { ok: false, error: 'invalid_activation_code' };
      const existing = entitlementFor(userId);
      const firstActivation = existing.activated_at == null;
      const credit = firstActivation ? INITIAL_AI_CREDIT_CENTS : Number(codeRow.credit_cents);
      const redeemed = ctx.db.prepare(`UPDATE ${activationCodes} SET redeemed_by=?, redeemed_at=datetime('now') WHERE id=? AND redeemed_at IS NULL`).run(userId, codeRow.id);
      if (!redeemed.changes) return { ok: false, error: 'invalid_activation_code' };
      ctx.db.prepare(`INSERT INTO ${entitlements} (user_id,cloud_enabled,ai_enabled,ai_credit_cents,activated_at,updated_at)
        VALUES (?, 1, 1, ?, datetime('now'), datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET cloud_enabled=1, ai_enabled=1,
        ai_credit_cents=ai_credit_cents + excluded.ai_credit_cents,
        activated_at=COALESCE(activated_at, datetime('now')), updated_at=datetime('now')`).run(userId, credit);
      return { ok: true, firstActivation, creditCents: credit, entitlement: entitlementFor(userId) };
    });
    return redeem();
  };
  return { issueActivationCodes, redeemActivationCode };
}

module.exports = { createActivationService };

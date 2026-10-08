const crypto = require('crypto');
const { validScriptName } = require('./script-filename');
const { withErrorMessage } = require('./error-messages');

const MAX_SOURCE = 48 * 1024;
const DEFAULT_PAIRING_PUBLIC_ORIGIN = 'https://ccicc.icu';
const INITIAL_AI_CREDIT_CENTS = 200;
const ACTIVATION_CODE_CREDIT_CENTS = 300;
const MAX_AI_PROMPT_CHARS = 8000;

function checksum(source) {
  let a = 1;
  let b = 0;
  const bytes = Buffer.from(source, 'utf8');
  for (const byte of bytes) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  return ((b * 65536 + a) >>> 0).toString(16).padStart(8, '0');
}
function createServerContext(ctx) {
  const scripts = ctx.db.table('scripts');
  const marketScripts = ctx.db.table('market_scripts');
  const devices = ctx.db.table('devices');
  const pairings = ctx.db.table('pairing_codes');
  const audit = ctx.db.table('audit_log');
  const reviews = ctx.db.table('moderation_reviews');
  const reports = ctx.db.table('market_reports');
  const entitlements = ctx.db.table('user_entitlements');
  const activationCodes = ctx.db.table('activation_codes');
  const aiUsage = ctx.db.table('ai_usage');
  const aiReservations = ctx.db.table('ai_reservations');
  const json = (res, status, body) => res.status(status).json({ ok: status < 400, ...withErrorMessage(body) });
  const wantsJson = (req) => String(req.headers?.accept || '').includes('application/json') || req.body?.ajax === '1';
  const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
  const log = (userId, action, detail) => ctx.db.prepare(`INSERT INTO ${audit} (user_id, action, detail) VALUES (?, ?, ?)`).run(userId || null, action, detail || '');
  const currentUser = (req) => ctx.users.current(req);
  const deviceIdentity = (req) => {
    if (Object.prototype.hasOwnProperty.call(req, 'jslabCloudDeviceIdentity')) return req.jslabCloudDeviceIdentity;
    const header = String(req.headers.authorization || '');
    if (!/^Bearer\s+/i.test(header)) return (req.jslabCloudDeviceIdentity = null);
    const row = ctx.db.prepare(`SELECT * FROM ${devices} WHERE token_hash=? AND revoked_at IS NULL`).get(hash(header.replace(/^Bearer\s+/i, '').trim()));
    if (!row) return (req.jslabCloudDeviceIdentity = null);
    const user = ctx.users.get(row.user_id);
    if (!user || user.status !== 'active') return (req.jslabCloudDeviceIdentity = null);
    ctx.db.prepare(`UPDATE ${devices} SET last_used_at=datetime('now') WHERE id=?`).run(row.id);
    return (req.jslabCloudDeviceIdentity = { user, device: row });
  };
  const deviceUser = (req) => deviceIdentity(req)?.user || null;
  const requireDevice = (req, res, next) => { if (!deviceIdentity(req)) return json(res, 401, { error: 'device_auth_required' }); return next(); };
  const entitlementFor = (userId) => ctx.db.prepare(`SELECT * FROM ${entitlements} WHERE user_id=?`).get(userId) || {
    user_id: userId, cloud_enabled: 0, ai_enabled: 0, ai_credit_cents: 0, activated_at: null
  };
  const hasCloudAccess = (user) => !!user && entitlementFor(user.id).cloud_enabled === 1;
  const hasAiAccess = (user) => {
    const entitlement = user ? entitlementFor(user.id) : null;
    return !!entitlement && entitlement.ai_enabled === 1 && entitlement.cloud_enabled === 1;
  };
  const sourceFromBody = (body) => typeof body?.source === 'string' ? body.source : '';
  const validSource = (name, source, existing = false) => validScriptName(name, existing) && Buffer.byteLength(source, 'utf8') <= MAX_SOURCE;
  const validJavaScript = (source) => {
    try { new Function(String(source)); return true; } catch (_) { return false; }
  };
  const rateWindows = new Map();
  const consume = (key, limit, windowMs) => {
    const now = Date.now(); const window = rateWindows.get(key) || [];
    const active = window.filter((time) => now - time < windowMs);
    if (active.length >= limit) return false;
    active.push(now); rateWindows.set(key, active); return true;
  };
  const getPositiveInteger = (key, fallback, maximum) => {
    const value = Number(ctx.config.get(key));
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.min(maximum, Math.floor(value));
  };
  return {
    ctx, scripts, marketScripts, devices, pairings, audit, reviews, reports, entitlements,
    activationCodes, aiUsage, aiReservations, json, wantsJson, hash, log, currentUser,
    deviceUser, requireDevice, entitlementFor, hasCloudAccess, hasAiAccess,
    sourceFromBody, validSource, validJavaScript, consume, getPositiveInteger, checksum,
    MAX_SOURCE, DEFAULT_PAIRING_PUBLIC_ORIGIN, INITIAL_AI_CREDIT_CENTS,
    ACTIVATION_CODE_CREDIT_CENTS, MAX_AI_PROMPT_CHARS
  };
}

module.exports = { createServerContext };

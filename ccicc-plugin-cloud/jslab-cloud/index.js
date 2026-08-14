const crypto = require('crypto');
const { registerStaticFiles } = require('./lib/static-files');
const { registerBrowserPages } = require('./lib/browser-pages');
const { buildAiSystemPrompt } = require('./lib/ai-prompts');

const MAX_SOURCE = 48 * 1024;
const NAME_RE = /^[^/\\.][^/\\]{0,120}\.(?:js|ui\.js)$/i;
const INITIAL_AI_CREDIT_CENTS = 200;
const ACTIVATION_CODE_CREDIT_CENTS = 300;
const MAX_AI_PROMPT_CHARS = 8000;
const DEFAULT_AI_MODEL = 'deepseek-ai/DeepSeek-V4-Flash';
const DEFAULT_MARKET_MODERATION_PROMPT = '审核 JSLab 市场脚本是否包含恶意行为、凭据窃取、破坏性操作或与说明明显不符的行为。正常使用 JSLab API 的脚本应通过审核。';

function checksum(source) {
  let a = 1;
  let b = 0;
  const bytes = Buffer.from(source, 'utf8');
  for (const byte of bytes) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  return ((b * 65536 + a) >>> 0).toString(16).padStart(8, '0');
}

module.exports = {
  install(ctx) {
    ctx.config.register({ key: 'marketModerationMode', displayName: '市场审核方式', description: '人工审核由管理员决定；单 LLM 审核使用下方审核模型直接给出结论。保存后立即生效。', valueType: 'string', defaultValue: 'manual', enumOptions: ['manual', 'llm'], controlType: 'select', hotReload: true });
    ctx.config.register({ key: 'pairingPublicOrigin', displayName: '配对二维码：网页地址', description: '手环二维码使用的 ccicc.icu 公网页面地址；留空时根据当前请求自动生成。保存后立即生效。', valueType: 'string', defaultValue: '', hotReload: true });
    ctx.config.register({ key: 'llmApiUrl', displayName: '市场审核 LLM：API 地址', description: '仅在审核方式为“单 LLM”时使用，不用于代码生成。', valueType: 'string', defaultValue: '', hotReload: true });
    ctx.config.register({ key: 'llmApiKey', displayName: '市场审核 LLM：API 密钥', description: '仅发送给市场审核服务。', valueType: 'string', defaultValue: '', hotReload: true });
    ctx.config.register({ key: 'llmModel', displayName: '市场审核 LLM：模型', description: '审核服务使用的模型标识。', valueType: 'string', defaultValue: '', hotReload: true });
    ctx.config.register({ key: 'llmModerationPrompt', displayName: '市场审核 LLM：审核提示词', description: '用于定义审核标准；系统会自动追加固定的 JSON 输出格式。保存后立即生效。', valueType: 'string', controlType: 'textarea', defaultValue: DEFAULT_MARKET_MODERATION_PROMPT, hotReload: true });
    ctx.config.register({ key: 'aiApiUrl', displayName: '代码生成 AI：API 地址', description: '仅用于设备端 AI 代码生成，不用于市场审核。', valueType: 'string', defaultValue: '', hotReload: true });
    ctx.config.register({ key: 'aiApiKey', displayName: '代码生成 AI：API 密钥', description: '仅发送给代码生成服务。', valueType: 'string', defaultValue: '', hotReload: true });
    ctx.config.register({ key: 'aiModel', displayName: '代码生成 AI：模型', description: '代码生成服务使用的模型标识。', valueType: 'string', defaultValue: DEFAULT_AI_MODEL, hotReload: true });
    ctx.config.register({ key: 'aiInputCentsPerMillionTokens', displayName: '代码生成 AI：输入价格（分/M Token）', description: '按 1,000,000 Token 计价；当前为硅基流动 DeepSeek V4 Flash 的 ¥0.005/千 Token 输入价。', valueType: 'number', defaultValue: 500, hotReload: true });
    ctx.config.register({ key: 'aiCachedInputCentsPerMillionTokens', displayName: '代码生成 AI：缓存命中输入价格（分/M Token）', description: '服务商未单列缓存价时与普通输入同价；按 1,000,000 Token 计价。', valueType: 'number', defaultValue: 500, hotReload: true });
    ctx.config.register({ key: 'aiOutputCentsPerMillionTokens', displayName: '代码生成 AI：输出价格（分/M Token）', description: '按 1,000,000 Token 计价；当前为硅基流动 DeepSeek V4 Flash 的 ¥0.01/千 Token 输出价。', valueType: 'number', defaultValue: 1000, hotReload: true });
    ctx.config.register({ key: 'aiMaxOutputTokens', displayName: '代码生成 AI：最大输出 Token 数', description: '有效范围 1-16384，默认 8192。', valueType: 'number', defaultValue: 8192, hotReload: true });
    ctx.config.register({ key: 'aiRequestTimeoutMs', displayName: '代码生成 AI：请求超时（毫秒）', description: '有效范围 1-300000，默认 90000。', valueType: 'number', defaultValue: 90_000, hotReload: true });
    const t = (name) => ctx.db.table(name);
    ctx.db.exec(`
      CREATE TABLE IF NOT EXISTS ${t('scripts')} (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL,
        type TEXT NOT NULL, source TEXT NOT NULL, hash TEXT NOT NULL, checksum TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, name)
      );
      CREATE TABLE IF NOT EXISTS ${t('market_scripts')} (
        id INTEGER PRIMARY KEY AUTOINCREMENT, owner_user_id INTEGER NOT NULL,
        name TEXT NOT NULL, type TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL, hash TEXT NOT NULL, checksum TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        pending_name TEXT, pending_type TEXT, pending_description TEXT, pending_tags TEXT,
        pending_source TEXT, pending_hash TEXT, pending_checksum TEXT, pending_status TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS ${t('devices')} (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL,
        token_hash TEXT UNIQUE, revoked_at TEXT, last_used_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS ${t('pairing_codes')} (
        code_hash TEXT PRIMARY KEY, user_id INTEGER, device_name TEXT NOT NULL DEFAULT 'JSLab device',
        expires_at TEXT NOT NULL, claimed_at TEXT, used_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS ${t('audit_log')} (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS ${t('moderation_reviews')} (
        id INTEGER PRIMARY KEY AUTOINCREMENT, script_id INTEGER NOT NULL, model TEXT NOT NULL,
        decision TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS ${t('market_reports')} (
        id INTEGER PRIMARY KEY AUTOINCREMENT, script_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
        reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS ${t('user_entitlements')} (
        user_id INTEGER PRIMARY KEY, cloud_enabled INTEGER NOT NULL DEFAULT 0, ai_enabled INTEGER NOT NULL DEFAULT 0,
        ai_credit_cents INTEGER NOT NULL DEFAULT 0, activated_at TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS ${t('activation_codes')} (
        id INTEGER PRIMARY KEY AUTOINCREMENT, code_hash TEXT NOT NULL UNIQUE, credit_cents INTEGER NOT NULL DEFAULT 300,
        batch_id TEXT NOT NULL, created_by INTEGER, redeemed_by INTEGER, redeemed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS ${t('ai_usage')} (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, device_id INTEGER,
        mode TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL, charged_cents INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS ${t('ai_reservations')} (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, reserved_cents INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'reserved', created_at TEXT NOT NULL DEFAULT (datetime('now')), settled_at TEXT
      );
    `);
  },

  boot(ctx) {
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

    // A process restart cannot have an in-flight provider request from the old plugin instance.
    ctx.db.transaction(() => {
      const orphaned = ctx.db.prepare(`SELECT id,user_id,reserved_cents FROM ${aiReservations} WHERE status='reserved'`).all();
      orphaned.forEach((reservation) => {
        ctx.db.prepare(`UPDATE ${aiReservations} SET status='cancelled', settled_at=datetime('now') WHERE id=? AND status='reserved'`).run(reservation.id);
        ctx.db.prepare(`UPDATE ${entitlements} SET ai_credit_cents=ai_credit_cents+?, updated_at=datetime('now') WHERE user_id=?`)
          .run(reservation.reserved_cents, reservation.user_id);
      });
    })();

    // The host maps this frontend entry to https://jslab-api.ccicc.icu when Caddy is enabled.
    ctx.caddy.registerSubdomain('jslab-api');
    registerStaticFiles(ctx, { '/assets': 'assets' });
    ctx.navigation.register({ category: '工具', name: 'JSLab Cloud', path: '/jslab-cloud', surface: 'frontend', icon: 'cloud', sortOrder: 40 });
    ctx.navigation.register({ category: '插件', name: 'JSLab Cloud 管理', path: '/admin/jslab-cloud', surface: 'admin', private: true, icon: 'cloud', sortOrder: 40 });

    const json = (res, status, body) => res.status(status).json({ ok: status < 400, ...body });
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
    const requireDevice = (req, res, next) => { if (!deviceIdentity(req)) return json(res, 401, { error: 'device_auth_required' }); next(); };
    const entitlementFor = (userId) => ctx.db.prepare(`SELECT * FROM ${entitlements} WHERE user_id=?`).get(userId) || {
      user_id: userId, cloud_enabled: 0, ai_enabled: 0, ai_credit_cents: 0, activated_at: null
    };
    const hasCloudAccess = (user) => !!user && entitlementFor(user.id).cloud_enabled === 1;
    const hasAiAccess = (user) => {
      const entitlement = user ? entitlementFor(user.id) : null;
      return !!entitlement && entitlement.ai_enabled === 1 && entitlement.cloud_enabled === 1;
    };
    const requireActivatedDevice = (req, res, next) => {
      const user = deviceUser(req);
      if (!user) return json(res, 401, { error: 'device_auth_required' });
      if (!hasCloudAccess(user)) return json(res, 403, { error: 'activation_required' });
      next();
    };
    const sourceFromBody = (body) => typeof body?.source === 'string' ? body.source : '';
    const validSource = (name, source) => NAME_RE.test(name) && Buffer.byteLength(source, 'utf8') <= MAX_SOURCE;
    const validJavaScript = (source) => {
      try { new Function(String(source)); return true; } catch (_) { return false; }
    };
    const marketSourceIssue = (source) => {
      const checks = [
        [/\beval\s*\(/, 'dynamic_code'],
        [/\bFunction\s*\(/, 'dynamic_code'],
        [/\bdevice\.(?:getDeviceId|getSerial)\s*\(/, 'device_identifier'],
        [/(?:authorization|bearer|api[_-]?key|device[_-]?token)\s*[:=]\s*['"][^'"]+/i, 'embedded_secret'],
      ];
      const match = checks.find(([pattern]) => pattern.test(String(source)));
      return match ? match[1] : null;
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
    const getPositiveNumber = (key, fallback, maximum) => {
      const value = Number(ctx.config.get(key));
      if (!Number.isFinite(value) || value <= 0) return fallback;
      return Math.min(maximum, value);
    };
    const getTokenPrices = () => ({
      input: getPositiveNumber('aiInputCentsPerMillionTokens', 500, 1_000_000),
      cachedInput: getPositiveNumber('aiCachedInputCentsPerMillionTokens', 500, 1_000_000),
      output: getPositiveNumber('aiOutputCentsPerMillionTokens', 1000, 1_000_000)
    });
    const estimateTokenCount = (value) => Buffer.byteLength(String(value || ''), 'utf8');
    const tokenCost = (inputTokens, outputTokens, cachedInputTokens = 0) => {
      const prices = getTokenPrices();
      const cached = Math.min(inputTokens, Math.max(0, cachedInputTokens));
      const cacheMiss = inputTokens - cached;
      return Math.max(1, Math.ceil((cacheMiss * prices.input + cached * prices.cachedInput + outputTokens * prices.output) / 1_000_000));
    };
    const stripCodeFence = (value) => {
      const content = String(value || '').trim();
      const match = content.match(/^```(?:javascript|js)?\s*\n?([\s\S]*?)\n?```$/i);
      return (match ? match[1] : content).trim();
    };
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
    const reserveAiCredit = (userId, reservedCents) => {
      const reserve = ctx.db.transaction(() => {
        const result = ctx.db.prepare(`UPDATE ${entitlements} SET ai_credit_cents=ai_credit_cents-?, updated_at=datetime('now')
          WHERE user_id=? AND cloud_enabled=1 AND ai_enabled=1 AND ai_credit_cents>=?`).run(reservedCents, userId, reservedCents);
        if (!result.changes) return null;
        const reservation = ctx.db.prepare(`INSERT INTO ${aiReservations} (user_id,reserved_cents) VALUES (?, ?)`)
          .run(userId, reservedCents);
        return { id: Number(reservation.lastInsertRowid), reservedCents };
      });
      return reserve();
    };
    const cancelAiReservation = (reservationId) => {
      const cancel = ctx.db.transaction(() => {
        const reservation = ctx.db.prepare(`SELECT * FROM ${aiReservations} WHERE id=? AND status='reserved'`).get(reservationId);
        if (!reservation) return false;
        const changed = ctx.db.prepare(`UPDATE ${aiReservations} SET status='cancelled', settled_at=datetime('now') WHERE id=? AND status='reserved'`)
          .run(reservationId);
        if (!changed.changes) return false;
        ctx.db.prepare(`UPDATE ${entitlements} SET ai_credit_cents=ai_credit_cents+?, updated_at=datetime('now') WHERE user_id=?`)
          .run(reservation.reserved_cents, reservation.user_id);
        return true;
      });
      return cancel();
    };
    const settleAiReservation = (reservationId, userId, mode, model, inputTokens, outputTokens, cachedInputTokens) => {
      const chargedCents = tokenCost(inputTokens, outputTokens, cachedInputTokens);
      const settle = ctx.db.transaction(() => {
        const reservation = ctx.db.prepare(`SELECT * FROM ${aiReservations} WHERE id=? AND user_id=? AND status='reserved'`)
          .get(reservationId, userId);
        if (!reservation) return null;
        if (chargedCents > reservation.reserved_cents) return null;
        const refundCents = reservation.reserved_cents - chargedCents;
        if (refundCents) ctx.db.prepare(`UPDATE ${entitlements} SET ai_credit_cents=ai_credit_cents+?, updated_at=datetime('now') WHERE user_id=?`)
          .run(refundCents, userId);
        const settled = ctx.db.prepare(`UPDATE ${aiReservations} SET status='settled', settled_at=datetime('now') WHERE id=? AND status='reserved'`)
          .run(reservationId);
        if (!settled.changes) return null;
        ctx.db.prepare(`INSERT INTO ${aiUsage} (user_id,mode,model,input_tokens,output_tokens,total_tokens,charged_cents)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).run(userId, mode, model, inputTokens, outputTokens, inputTokens + outputTokens, chargedCents);
        return { chargedCents, remainingCreditCents: entitlementFor(userId).ai_credit_cents };
      });
      return settle();
    };
    const generateAiSource = async (user, body) => {
      const mode = body?.mode === 'rewrite' ? 'rewrite' : body?.mode === 'create' ? 'create' : '';
      const prompt = String(body?.prompt || '').trim();
      const source = sourceFromBody(body);
      const name = String(body?.name || '').trim();
      if (!mode || !prompt || prompt.length > MAX_AI_PROMPT_CHARS || !NAME_RE.test(name) || Buffer.byteLength(source, 'utf8') > MAX_SOURCE) {
        return { error: 'invalid_ai_request', status: 400 };
      }
      if (!hasAiAccess(user)) return { error: 'activation_required', status: 403 };
      const url = String(ctx.config.get('aiApiUrl') || '');
      const key = String(ctx.config.get('aiApiKey') || '');
      const model = String(ctx.config.get('aiModel') || DEFAULT_AI_MODEL);
      const maxTokens = getPositiveInteger('aiMaxOutputTokens', 8192, 16384);
      if (!url || !key || !model || typeof fetch !== 'function') return { error: 'ai_not_configured', status: 503 };
      if (!consume(`ai:${user.id}`, 6, 60_000)) return { error: 'rate_limited', status: 429 };
      const userRequest = mode === 'rewrite'
        ? `Task: Rewrite the existing ${name} according to this request: ${prompt}\n\nExisting source:\n${source}`
        : `Task: Create a new ${name} according to this request: ${prompt}`;
      const systemPrompt = buildAiSystemPrompt(name, body?.environment);
      // UTF-8 bytes conservatively bound ordinary provider tokenization; reserve message overhead too.
      const estimatedCost = tokenCost(estimateTokenCount(systemPrompt + userRequest) + 128, maxTokens);
      const reservation = reserveAiCredit(user.id, estimatedCost);
      if (!reservation) return { error: 'ai_credit_insufficient', status: 402 };
      let payload;
      let timeout = null;
      try {
        const timeoutMs = getPositiveInteger('aiRequestTimeoutMs', 90_000, 300_000);
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        const response = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          signal: controller ? controller.signal : undefined,
          body: JSON.stringify({ model, temperature: 0.2, max_tokens: maxTokens, thinking: { type: 'disabled' }, messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userRequest }
          ] })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        payload = await response.json();
      } catch (error) {
        cancelAiReservation(reservation.id);
        ctx.logger.warn({ userId: user.id, error: error.message }, 'AI generation request failed');
        return { error: 'ai_provider_unavailable', status: 502 };
      } finally {
        if (timeout) clearTimeout(timeout);
      }
      const code = stripCodeFence(payload?.choices?.[0]?.message?.content);
      const inputTokens = Number(payload?.usage?.prompt_tokens);
      const outputTokens = Number(payload?.usage?.completion_tokens);
      const cachedInputTokens = Number(payload?.usage?.prompt_tokens_details?.cached_tokens || 0);
      if (!code || !validSource(name, code) || !validJavaScript(code) || !Number.isInteger(inputTokens) || inputTokens < 0 || !Number.isInteger(outputTokens) || outputTokens < 0 || !Number.isInteger(cachedInputTokens) || cachedInputTokens < 0 || cachedInputTokens > inputTokens) {
        cancelAiReservation(reservation.id);
        return { error: 'ai_invalid_response', status: 502 };
      }
      const billing = settleAiReservation(reservation.id, user.id, mode, model, inputTokens, outputTokens, cachedInputTokens);
      if (!billing) {
        cancelAiReservation(reservation.id);
        return { error: 'ai_credit_insufficient', status: 402 };
      }
      log(user.id, 'ai.generate', `${mode}:${billing.chargedCents}`);
      return { code, usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, chargedCents: billing.chargedCents }, remainingCreditCents: billing.remainingCreditCents };
    };
    const applyMarketDecision = (marketId, decision) => ctx.db.transaction(() => {
      const row = ctx.db.prepare(`SELECT * FROM ${marketScripts} WHERE id=?`).get(marketId);
      if (!row) return null;
      if (row.pending_status === 'pending' || row.pending_status === 'rejected') {
        if (decision === 'approve') {
          ctx.db.prepare(`UPDATE ${marketScripts} SET name=pending_name,type=pending_type,description=pending_description,tags=pending_tags,source=pending_source,hash=pending_hash,checksum=pending_checksum,status='published',pending_name=NULL,pending_type=NULL,pending_description=NULL,pending_tags=NULL,pending_source=NULL,pending_hash=NULL,pending_checksum=NULL,pending_status=NULL,updated_at=datetime('now') WHERE id=?`).run(marketId);
        } else {
          ctx.db.prepare(`UPDATE ${marketScripts} SET pending_status='rejected',updated_at=datetime('now') WHERE id=?`).run(marketId);
        }
      } else {
        ctx.db.prepare(`UPDATE ${marketScripts} SET status=?,updated_at=datetime('now') WHERE id=?`).run(decision === 'approve' ? 'published' : 'rejected', marketId);
      }
      return ctx.db.prepare(`SELECT status,pending_status FROM ${marketScripts} WHERE id=?`).get(marketId);
    })();
    const llmReview = async (scriptId) => {
      const url = String(ctx.config.get('llmApiUrl') || ''); const key = String(ctx.config.get('llmApiKey') || ''); const model = String(ctx.config.get('llmModel') || '');
      const moderationPrompt = String(ctx.config.get('llmModerationPrompt') || DEFAULT_MARKET_MODERATION_PROMPT).trim() || DEFAULT_MARKET_MODERATION_PROMPT;
      if (!url || !key || !model || typeof fetch !== 'function') return null;
      const row = ctx.db.prepare(`SELECT COALESCE(pending_name,name) AS name,COALESCE(pending_description,description) AS description,COALESCE(pending_source,source) AS source FROM ${marketScripts} WHERE id=?`).get(scriptId);
      if (!row) return null;
      try {
        const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, temperature: 0, thinking: { type: 'disabled' }, messages: [{ role: 'system', content: `${moderationPrompt}\n\n只返回 JSON，不要使用 Markdown：{"decision":"approve|reject","reason":"简短说明"}` }, { role: 'user', content: `Name: ${row.name}\nDescription: ${row.description}\nSource:\n${row.source}` }] }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json(); const content = String(payload?.choices?.[0]?.message?.content || ''); const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, ''));
        if (parsed.decision !== 'approve' && parsed.decision !== 'reject') throw new Error('Invalid moderation decision');
        const decision = parsed.decision; const reason = String(parsed.reason || '').slice(0, 1000);
        ctx.db.prepare(`INSERT INTO ${reviews} (script_id,model,decision,reason) VALUES (?, ?, ?, ?)`).run(scriptId, model, decision, reason);
        return { decision, reason };
      } catch (error) { ctx.logger.warn({ scriptId, error: error.message }, 'LLM moderation failed; leaving script pending'); return null; }
    };
    const escapeHtml = (value) => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const formatCredit = (cents) => (Math.max(0, Number(cents) || 0) / 100).toFixed(2);
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
    ctx.routes.frontend.get('/api/cloud/scripts', (req, res) => {
      const user = currentUser(req) || deviceUser(req);
      if (!user) return json(res, 401, { error: 'auth_required' });
      if (!hasCloudAccess(user)) return json(res, 403, { error: 'activation_required' });
      const rows = ctx.db.prepare(`SELECT id,name,type,updated_at FROM ${scripts} WHERE user_id=? ORDER BY updated_at DESC`).all(user.id);
      json(res, 200, { scripts: rows });
    });
    ctx.routes.frontend.get('/api/cloud/scripts/:id', (req, res) => {
      const user = currentUser(req) || deviceUser(req);
      if (!user) return json(res, 401, { error: 'auth_required' });
      if (!hasCloudAccess(user)) return json(res, 403, { error: 'activation_required' });
      const row = ctx.db.prepare(`SELECT * FROM ${scripts} WHERE id=? AND user_id=?`).get(Number(req.params.id), user.id);
      if (!row) return json(res, 404, { error: 'not_found' });
      json(res, 200, { script: { id: row.id, name: row.name, type: row.type, updated_at: row.updated_at }, source: row.source, hash: row.hash, checksum: row.checksum });
    });
    const writeScript = (req, res) => {
      const user = currentUser(req) || deviceUser(req);
      if (!user) return json(res, 401, { error: 'auth_required' });
      if (!hasCloudAccess(user)) return json(res, 403, { error: 'activation_required' });
      if (!consume(`write:${user.id}`, 120, 60_000)) return json(res, 429, { error: 'rate_limited' });
      const source = sourceFromBody(req.body);
      const name = String(req.body?.name || '').trim();
      if (!validSource(name, source)) return json(res, 400, { error: 'invalid_script' });
      if (!validJavaScript(source)) return json(res, 400, { error: 'invalid_javascript' });
      const existing = req.params.id ? ctx.db.prepare(`SELECT * FROM ${scripts} WHERE id=? AND user_id=?`).get(Number(req.params.id), user.id) : null;
      if (req.params.id && !existing) return json(res, 404, { error: 'not_found' });
      const insert = ctx.db.transaction(() => {
        if (!existing) {
          const result = ctx.db.prepare(`INSERT INTO ${scripts} (user_id,name,type,source,hash,checksum) VALUES (?, ?, ?, ?, ?, ?)`).run(user.id, name, /\.ui\.js$/i.test(name) ? 'ui' : 'console', source, hash(source), checksum(source));
          return { id: result.lastInsertRowid };
        }
        ctx.db.prepare(`UPDATE ${scripts} SET name=?,type=?,source=?,hash=?,checksum=?,updated_at=datetime('now') WHERE id=?`).run(name, /\.ui\.js$/i.test(name) ? 'ui' : 'console', source, hash(source), checksum(source), existing.id);
        return { id: existing.id };
      });
      let result;
      try {
        result = insert();
      } catch (error) {
        if (/UNIQUE/i.test(String(error && error.message))) return json(res, 409, { error: 'script_name_exists' });
        throw error;
      }
      log(user.id, 'script.write', String(result.id));
      if (req.body?._csrf && !wantsJson(req)) return res.redirect(`/jslab-cloud/workspace/scripts/${result.id}`);
      json(res, 200, result);
    };
    const deleteScript = (req, res) => {
      const user = currentUser(req) || deviceUser(req);
      if (!user) return json(res, 401, { error: 'auth_required' });
      if (!hasCloudAccess(user)) return json(res, 403, { error: 'activation_required' });
      const row = ctx.db.prepare(`SELECT * FROM ${scripts} WHERE id=? AND user_id=?`).get(Number(req.params.id), user.id);
      if (!row) return json(res, 404, { error: 'not_found' });
      ctx.db.transaction(() => {
        ctx.db.prepare(`DELETE FROM ${scripts} WHERE id=?`).run(row.id);
      })();
      log(user.id, 'script.delete', String(row.id));
      if (req.body?._csrf && !wantsJson(req)) return res.redirect('/jslab-cloud/workspace');
      json(res, 200, { id: row.id, deleted: true });
    };
    registerBrowserPages(ctx, {
      scripts, marketScripts, devices, pairings, entitlementFor, currentUser, escapeHtml, formatCredit,
      writeScript, deleteScript, redeemActivationCode, hash, log,
    });
    ctx.routes.frontend.post('/api/cloud/scripts', ctx.users.requireAuth, ctx.security.csrfProtection, writeScript);
    ctx.routes.frontend.post('/api/cloud/device/scripts', requireDevice, writeScript);
    ctx.routes.frontend.put('/api/cloud/scripts/:id', requireDevice, writeScript);
    ctx.routes.frontend.delete('/api/cloud/device/scripts/:id', requireDevice, deleteScript);
    ctx.routes.frontend.delete('/api/cloud/scripts/:id', ctx.users.requireAuth, ctx.security.csrfProtection, deleteScript);
    const pairingOrigin = (req) => {
      const configured = String(ctx.config.get('pairingPublicOrigin') || '').trim().replace(/\/$/, '');
      if (configured) return configured;
      const forwarded = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
      const protocol = forwarded || (req.protocol ? String(req.protocol) : 'http');
      const host = String(req.headers?.host || '192.168.3.17:3000').split(',')[0].trim();
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
      json(res, 200, { entitlement: { cloudEnabled: entitlement.cloud_enabled === 1, aiEnabled: entitlement.ai_enabled === 1, aiCreditCents: Number(entitlement.ai_credit_cents) || 0 } });
    });
    ctx.routes.frontend.post('/api/cloud/device/ai/generate', requireDevice, async (req, res) => {
      const user = deviceUser(req); const result = await generateAiSource(user, req.body || {});
      if (result.error) return json(res, result.status, { error: result.error });
      return json(res, 200, result);
    });
    ctx.routes.frontend.get('/api/cloud/devices', ctx.users.requireAuth, (req, res) => { const user = currentUser(req); const rows = ctx.db.prepare(`SELECT id,name,last_used_at,created_at,revoked_at FROM ${devices} WHERE user_id=? ORDER BY id DESC`).all(user.id); json(res, 200, { devices: rows }); });
    ctx.routes.frontend.post('/api/cloud/devices/:id/revoke', ctx.users.requireAuth, ctx.security.csrfProtection, (req, res) => { const user = currentUser(req); const result = ctx.db.prepare(`UPDATE ${devices} SET revoked_at=datetime('now') WHERE id=? AND user_id=? AND revoked_at IS NULL`).run(Number(req.params.id), user.id); if (!result.changes) return json(res, 404, { error: 'not_found' }); log(user.id, 'device.revoke', String(req.params.id)); json(res, 200, { id: Number(req.params.id) }); });
    ctx.routes.frontend.get('/api/cloud/market', (req, res) => { const q = `%${String(req.query.q || '').slice(0, 80)}%`; const rows = ctx.db.prepare(`SELECT id,name,type,description,tags,updated_at FROM ${marketScripts} WHERE status='published' AND (name LIKE ? OR description LIKE ?) ORDER BY updated_at DESC LIMIT 50`).all(q, q); json(res, 200, { scripts: rows }); });
    ctx.routes.frontend.get('/api/cloud/market/:id/source', (req, res) => { const row = ctx.db.prepare(`SELECT * FROM ${marketScripts} WHERE id=? AND status='published'`).get(Number(req.params.id)); if (!row) return json(res, 404, { error: 'not_found' }); json(res, 200, { script: row }); });
    ctx.routes.frontend.post('/api/cloud/market/:id/report', ctx.users.requireAuth, ctx.security.csrfProtection, (req, res) => { const user = currentUser(req); const reason = String(req.body?.reason || '').trim().slice(0, 500); if (!reason) return json(res, 400, { error: 'reason_required' }); const row = ctx.db.prepare(`SELECT id FROM ${marketScripts} WHERE id=? AND status='published'`).get(Number(req.params.id)); if (!row) return json(res, 404, { error: 'not_found' }); ctx.db.prepare(`INSERT INTO ${reports} (script_id,user_id,reason) VALUES (?, ?, ?)`).run(row.id, user.id, reason); log(user.id, 'market.report', String(row.id)); if (req.body?._csrf && !wantsJson(req)) return res.redirect(`/jslab-cloud/workspace/market/${row.id}`); json(res, 200, { reported: true, message: '举报已提交。' }); });
    ctx.routes.frontend.post('/api/cloud/market/submit', ctx.users.requireAuth, ctx.security.csrfProtection, async (req, res) => {
      const user = currentUser(req);
      if (!hasCloudAccess(user)) return json(res, 403, { error: 'activation_required', message: '请先激活云空间。' });
      const source = sourceFromBody(req.body);
      const sourceIssue = marketSourceIssue(source);
      if (sourceIssue) return json(res, 400, { error: 'market_source_rejected', reason: sourceIssue, message: '代码包含市场不允许的内容，请修改后重试。' });
      const marketId = Number(req.body?.marketId || 0);
      const marketName = String(req.body?.marketName || '').trim().slice(0, 124);
      const marketType = req.body?.marketType === 'ui' || req.body?.marketType === 'console' ? req.body.marketType : '';
      const marketDescription = String(req.body?.marketDescription || '').trim().slice(0, 1000);
      if (!marketName) return json(res, 400, { error: 'name_required', message: '请填写市场名称。' });
      if (!marketType) return json(res, 400, { error: 'type_required', message: '请选择脚本类型。' });
      if (!marketDescription) return json(res, 400, { error: 'description_required', message: '请填写市场说明。' });
      if (!source || Buffer.byteLength(source, 'utf8') > MAX_SOURCE) return json(res, 400, { error: 'invalid_script', message: '代码不能为空且不能超过 48 KiB。' });
      if (!validJavaScript(source)) return json(res, 400, { error: 'invalid_javascript', message: '代码存在 JavaScript 语法错误。' });
      const marketTags = JSON.stringify((Array.isArray(req.body?.marketTags) ? req.body.marketTags : String(req.body?.marketTags || '').split(',')).map((tag) => String(tag).trim().slice(0, 40)).filter(Boolean).slice(0, 12));
      let submittedId;
      if (marketId) {
        const existing = ctx.db.prepare(`SELECT id,status,owner_user_id FROM ${marketScripts} WHERE id=? AND owner_user_id=?`).get(marketId, user.id);
        if (!existing) return json(res, 404, { error: 'not_found', message: '市场脚本不存在或无权编辑。' });
        ctx.db.prepare(`UPDATE ${marketScripts} SET pending_name=?,pending_type=?,pending_description=?,pending_tags=?,pending_source=?,pending_hash=?,pending_checksum=?,pending_status='pending',updated_at=datetime('now') WHERE id=?`).run(marketName, marketType, marketDescription, marketTags, source, hash(source), checksum(source), marketId);
        submittedId = marketId;
      } else {
        const inserted = ctx.db.prepare(`INSERT INTO ${marketScripts} (owner_user_id,name,type,description,tags,source,hash,checksum,status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`).run(user.id,marketName,marketType,marketDescription,marketTags,source,hash(source),checksum(source));
        submittedId = inserted.lastInsertRowid;
      }
      log(user.id, 'market.submit', String(submittedId));
      let review = null;
      if (ctx.config.get('marketModerationMode') === 'llm') {
        review = await llmReview(submittedId);
        if (review) applyMarketDecision(submittedId, review.decision);
      }
      const current = ctx.db.prepare(`SELECT status,pending_status FROM ${marketScripts} WHERE id=?`).get(submittedId);
      const status = current?.pending_status === 'pending' || current?.pending_status === 'rejected' ? current.pending_status : current?.status || 'pending';
      if (req.body?._csrf && !wantsJson(req)) return res.redirect('/jslab-cloud/workspace?panel=publications');
      return json(res, 200, { status, marketId: submittedId, review, message: '市场脚本已提交审核。' });
    });
    const renderAdminPage = (req, res, issued) => {
      const rows = ctx.db.prepare(`SELECT s.id,COALESCE(s.pending_name,s.name) AS name,s.status,s.pending_status,(SELECT decision FROM ${reviews} r WHERE r.script_id=s.id ORDER BY r.id DESC LIMIT 1) AS llm_decision,(SELECT reason FROM ${reviews} r WHERE r.script_id=s.id ORDER BY r.id DESC LIMIT 1) AS llm_reason FROM ${marketScripts} s WHERE s.status IN ('pending','rejected') OR s.pending_status IN ('pending','rejected') ORDER BY s.updated_at`).all();
      const entitlementSummary = ctx.db.prepare(`SELECT COUNT(*) AS activated, COALESCE(SUM(ai_credit_cents), 0) AS credit_cents FROM ${entitlements} WHERE cloud_enabled=1 AND ai_enabled=1`).get();
      const usageSummary = ctx.db.prepare(`SELECT COALESCE(SUM(total_tokens),0) AS tokens,COALESCE(SUM(charged_cents),0) AS charged_cents FROM ${aiUsage}`).get();
      const reportRows = ctx.db.prepare(`SELECT r.id,r.reason,r.created_at,s.id AS script_id,s.name FROM ${reports} r JOIN ${marketScripts} s ON s.id=r.script_id ORDER BY r.id DESC LIMIT 20`).all();
      const token = escapeHtml(ctx.security.csrfToken(req));
      const items = rows.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong>${row.pending_status ? '<small class="d-block text-body-secondary">已发布内容的更新，审核通过前线上版本不变</small>' : ''}</td><td>${row.llm_decision ? `<span class="badge text-bg-${row.llm_decision === 'approve' ? 'success' : 'danger'}">${row.llm_decision === 'approve' ? 'LLM 已通过' : 'LLM 建议拒绝'}</span><small class="d-block text-body-secondary">${escapeHtml(row.llm_reason)}</small>${row.llm_decision === 'reject' ? '<small class="d-block text-body-secondary">可由管理员人工复核并通过。</small>' : ''}` : `<span class="text-body-secondary">${ctx.config.get('marketModerationMode') === 'llm' ? 'LLM 暂未给出有效结论' : '等待人工审核'}</span>`}</td><td class="text-end"><form method="post" action="/admin/jslab-cloud/scripts/${row.id}/review" class="jslab-cloud-admin-actions"><input type="hidden" name="_csrf" value="${token}"><button name="status" value="published" class="btn btn-sm btn-outline-primary">人工通过</button><button name="status" value="rejected" class="btn btn-sm btn-outline-danger">人工拒绝</button></form></td></tr>`).join('');
      const reportItems = reportRows.map((row) => `<tr><td><a href="/jslab-cloud/workspace/market/${row.script_id}">${escapeHtml(row.name)}</a></td><td>${escapeHtml(row.reason)}</td><td class="text-body-secondary">${escapeHtml(row.created_at)}</td></tr>`).join('');
      const issuedCodes = issued && issued.codes && issued.codes.length
        ? `<div class="card jslab-cloud-admin-section"><div class="card-body"><h3 class="h5">已生成激活码</h3><p>请立即复制保存，系统只会保留激活码哈希。</p><textarea class="form-control font-monospace" rows="${Math.min(16, issued.codes.length + 1)}" readonly>${escapeHtml(issued.codes.join('\n'))}</textarea><p class="text-body-secondary mb-0">批次 ${escapeHtml(issued.batchId)} · 共 ${issued.codes.length} 个激活码。</p></div></div>`
        : '';
      ctx.render.adminPage(req, res, `<link rel="stylesheet" href="/jslab-cloud/assets/jslab-cloud.css?v=${encodeURIComponent(ctx.manifest.version)}"><div class="jslab-cloud-admin"><div class="page-title"><div><h2>JSLab Cloud 管理</h2><p>管理账户激活、AI 用量和市场审核。</p></div></div><div class="jslab-cloud-admin-summary"><div><span>已激活账户</span><strong>${entitlementSummary.activated}</strong></div><div><span>剩余 AI 额度</span><strong>¥${formatCredit(entitlementSummary.credit_cents)}</strong></div><div><span>已计费 Token</span><strong>${Number(usageSummary.tokens).toLocaleString()}</strong></div><div><span>AI 费用</span><strong>¥${formatCredit(usageSummary.charged_cents)}</strong></div></div><div class="card jslab-cloud-admin-section"><div class="card-body"><h3 class="h5">批量生成激活码</h3><p class="text-body-secondary">首次兑换激活云空间和 AI，并赠送 ¥2.00；后续每个激活码增加 ¥3.00。</p><form method="post" action="/admin/jslab-cloud/activation-codes" class="jslab-cloud-inline-form"><input type="hidden" name="_csrf" value="${token}"><label class="visually-hidden" for="activation-count">生成数量</label><input id="activation-count" class="form-control" type="number" min="1" max="500" name="count" value="10" required><button class="btn btn-outline-primary">生成激活码</button></form></div></div>${issuedCodes}<div class="card jslab-cloud-admin-section"><div class="card-header"><h3 class="h5 mb-0">市场审核</h3></div><div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>脚本</th><th>审核状态</th><th><span class="visually-hidden">操作</span></th></tr></thead><tbody>${items || '<tr><td colspan="3" class="text-body-secondary">暂无待审核脚本。</td></tr>'}</tbody></table></div></div><div class="card jslab-cloud-admin-section"><div class="card-header"><h3 class="h5 mb-0">最近举报</h3></div><div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>脚本</th><th>原因</th><th>提交时间</th></tr></thead><tbody>${reportItems || '<tr><td colspan="3" class="text-body-secondary">暂无举报。</td></tr>'}</tbody></table></div></div></div>`, { page_title: 'JSLab Cloud 管理' });
    };
    ctx.routes.admin.get('/', ctx.users.requireAdmin, (req, res) => renderAdminPage(req, res));
    ctx.routes.admin.post('/activation-codes', ctx.users.requireAdmin, ctx.security.csrfProtection, (req, res) => {
      const admin = currentUser(req); const issued = issueActivationCodes(admin.id, req.body?.count);
      renderAdminPage(req, res, issued);
    });
    ctx.routes.admin.post('/scripts/:id/review', ctx.users.requireAdmin, ctx.security.csrfProtection, (req, res) => { const decision = req.body?.status === 'published' ? 'approve' : 'reject'; applyMarketDecision(Number(req.params.id), decision); log(currentUser(req).id, 'market.review', `${req.params.id}:${decision}`); res.redirect('/admin/jslab-cloud'); });
  },
  uninstall(ctx, { purgeData }) { if (purgeData) ['ai_reservations','ai_usage','activation_codes','user_entitlements','market_reports','moderation_reviews','audit_log','pairing_codes','devices','market_scripts','scripts'].forEach((name) => ctx.db.exec(`DROP TABLE IF EXISTS ${ctx.db.table(name)}`)); }
};

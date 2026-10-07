'use strict';

const DEFAULT_AI_MODEL = 'deepseek-ai/DeepSeek-V4-Flash';
const DEFAULT_MARKET_MODERATION_PROMPT = '审核 JSLab 市场脚本是否包含恶意行为、凭据窃取、破坏性操作或与说明明显不符的行为。正常使用 JSLab API 的脚本应通过审核。';

// Shared durable setup also runs when an update calls boot without install.
// Register metadata/defaults without overwriting saved configuration values.
function ensurePersistentState(ctx) {
    ctx.config.register({ key: 'marketModerationMode', displayName: '市场审核方式', description: '人工审核由管理员决定；单 LLM 审核使用下方审核模型直接给出结论。保存后立即生效。', valueType: 'string', defaultValue: 'manual', enumOptions: ['manual', 'llm'], controlType: 'select', hotReload: true });
    ctx.config.register({ key: 'pairingPublicOrigin', displayName: '配对二维码：网页地址', description: '手机扫描二维码后打开的网页地址；生产环境留空时使用 https://ccicc.icu，本地开发时根据当前请求生成。保存后立即生效。', valueType: 'string', defaultValue: '', hotReload: true });
    ctx.config.register({ key: 'llmApiUrl', displayName: '市场审核 LLM：API 地址', description: '仅在审核方式为“单 LLM”时使用，不用于代码生成。', valueType: 'string', defaultValue: '', hotReload: true });
    ctx.config.register({ key: 'llmApiKey', displayName: '市场审核 LLM：API 密钥', description: '仅发送给市场审核服务。', valueType: 'string', defaultValue: '', hotReload: true });
    ctx.config.register({ key: 'llmModel', displayName: '市场审核 LLM：模型', description: '审核服务使用的模型标识。', valueType: 'string', defaultValue: '', hotReload: true });
    ctx.config.register({ key: 'llmModerationPrompt', displayName: '市场审核 LLM：审核提示词', description: '用于定义审核标准；系统会自动追加统一运行能力说明和 JSON 输出格式。保存后立即生效。', valueType: 'string', controlType: 'textarea', defaultValue: DEFAULT_MARKET_MODERATION_PROMPT, hotReload: true });
    ctx.config.register({ key: 'llmRequestTimeoutMs', displayName: '市场审核 LLM：请求超时（毫秒）', description: '有效范围 1-300000，默认 90000。', valueType: 'number', defaultValue: 90_000, hotReload: true });
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
        source TEXT NOT NULL, hash TEXT NOT NULL, checksum TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, name)
      );
      CREATE TABLE IF NOT EXISTS ${t('market_scripts')} (
        id INTEGER PRIMARY KEY AUTOINCREMENT, owner_user_id INTEGER NOT NULL,
        name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL, hash TEXT NOT NULL, checksum TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        pending_name TEXT, pending_description TEXT, pending_tags TEXT,
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
        decision TEXT NOT NULL, reason TEXT NOT NULL, content_hash TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
}
module.exports = { ensurePersistentState, DEFAULT_AI_MODEL, DEFAULT_MARKET_MODERATION_PROMPT };

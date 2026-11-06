'use strict';

const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const session = require('express-session');
const derive = promisify(scrypt);
const USER_FIELDS = 'id,username,display_name,email,role,status,auth_version,created_at';
const invalid = (message) => Object.assign(new Error(message), { status: 400 });

function validateAccount({ username, password }) {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{2,39}$/.test(username)) {
    throw invalid('用户名应为 3–40 位字母、数字、下划线、点或连字符，并以字母、数字或下划线开头。');
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    throw invalid('密码长度应为 12–256 个字符。');
  }
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

function createAccounts(db) {
  const get = (id) => db.prepare(`SELECT ${USER_FIELDS} FROM host_users WHERE id=?`).get(id) || null;
  return {
    get,
    list: () => db.prepare(`SELECT ${USER_FIELDS} FROM host_users ORDER BY id`).all(),
    hasAdmin: () => !!db.prepare("SELECT id FROM host_users WHERE role='admin' AND status='active' LIMIT 1").get(),
    async create({ username, password, role = 'user' }) {
      validateAccount({ username, password });
      if (!['user', 'admin'].includes(role)) throw invalid('无效的账户角色。');
      const hash = await hashPassword(password);
      try {
        const result = db.prepare('INSERT INTO host_users(username,password_hash,role) VALUES (?,?,?)').run(username, hash, role);
        return get(Number(result.lastInsertRowid));
      } catch (error) {
        if (/UNIQUE constraint failed: host_users.username/.test(error.message)) throw invalid('该用户名已被使用。');
        throw error;
      }
    },
    async authenticate(username, password) {
      if (typeof username !== 'string' || username.length > 40 || typeof password !== 'string' || password.length > 256) return null;
      const row = db.prepare('SELECT * FROM host_users WHERE username=?').get(username);
      // The same derivation runs for an unknown username.
      const [salt, expected] = (row?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
      const actual = await derive(password, salt, 64);
      return timingSafeEqual(actual, Buffer.from(expected, 'hex')) && row?.status === 'active' ? get(row.id) : null;
    },
    async resetPassword(username, password) {
      validateAccount({ username, password });
      const hash = await hashPassword(password);
      const result = db.prepare('UPDATE host_users SET password_hash=?,auth_version=auth_version+1 WHERE username=?').run(hash, username);
      if (!result.changes) throw invalid('未找到该账户。');
    },
    setStatus(id, status, actorId) {
      const user = get(id);
      if (!user || !['active', 'disabled'].includes(status)) throw invalid('账户或状态无效。');
      if (user.id === actorId && status === 'disabled') throw invalid('不能停用当前登录的账户。');
      if (user.role === 'admin' && status === 'disabled' && db.prepare("SELECT count(*) AS n FROM host_users WHERE role='admin' AND status='active'").get().n <= 1) {
        throw invalid('请保留至少一个可用的管理员账户。');
      }
      db.prepare('UPDATE host_users SET status=?,auth_version=auth_version+1 WHERE id=?').run(status, id);
    },
    consumeLogin(ip) {
      const now = Date.now();
      db.prepare('DELETE FROM host_auth_attempts WHERE expires<=?').run(now);
      db.prepare('INSERT INTO host_auth_attempts(ip,count,expires) VALUES (?,1,?) ON CONFLICT(ip) DO UPDATE SET count=count+1').run(ip, now + 10 * 60_000);
      return db.prepare('SELECT count FROM host_auth_attempts WHERE ip=?').get(ip).count <= 20;
    },
  };
}

class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    const prune = () => db.prepare('DELETE FROM host_sessions WHERE expires<=?').run(Date.now());
    prune();
    this.timer = setInterval(prune, 60 * 60_000);
    this.timer.unref();
  }
  get(sid, callback) {
    try {
      const row = this.db.prepare('SELECT data FROM host_sessions WHERE sid=? AND expires>?').get(sid, Date.now());
      callback(null, row ? JSON.parse(row.data) : null);
    } catch (error) { callback(error); }
  }
  set(sid, value, callback = () => {}) {
    try {
      this.db.prepare('INSERT INTO host_sessions(sid,data,expires) VALUES (?,?,?) ON CONFLICT(sid) DO UPDATE SET data=excluded.data,expires=excluded.expires')
        .run(sid, JSON.stringify(value), new Date(value.cookie.expires).getTime());
      callback();
    } catch (error) { callback(error); }
  }
  touch(sid, value, callback = () => {}) {
    try {
      this.db.prepare('UPDATE host_sessions SET expires=? WHERE sid=?').run(new Date(value.cookie.expires).getTime(), sid);
      callback();
    } catch (error) { callback(error); }
  }
  destroy(sid, callback = () => {}) {
    try { this.db.prepare('DELETE FROM host_sessions WHERE sid=?').run(sid); callback(); }
    catch (error) { callback(error); }
  }
  close() { clearInterval(this.timer); }
}

function createSecurity(accounts) {
  const wantsJson = (req) => req.originalUrl.startsWith('/jslab-cloud/api/') || String(req.headers.accept || '').includes('application/json');
  const fail = (req, res, status, error, message) => wantsJson(req) ? res.status(status).json({ error, message }) : res.status(status).send(message);
  const current = (req) => {
    const user = req.session?.userId ? accounts.get(req.session.userId) : null;
    return user?.status === 'active' && user.auth_version === req.session.userVersion ? user : null;
  };
  const requireAuth = (req, res, next) => {
    if (current(req)) return next();
    if (wantsJson(req)) return fail(req, res, 401, 'auth_required', '请先登录。');
    req.session.returnTo = localReturnTo(req.originalUrl);
    res.redirect('/auth');
  };
  const requireAdmin = (req, res, next) => requireAuth(req, res, () => current(req).role === 'admin' ? next() : fail(req, res, 403, 'admin_required', '此页面仅供管理员使用。'));
  const csrfToken = (req) => req.session.csrf || (req.session.csrf = randomBytes(32).toString('hex'));
  const csrfProtection = (req, res, next) => {
    const supplied = req.get('X-CSRF-Token') || req.body?._csrf;
    const expected = req.session?.csrf;
    if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) || !expected || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      return fail(req, res, 403, 'csrf_invalid', '页面验证已失效，请刷新页面后重试。');
    }
    next();
  };
  return { users: { get: accounts.get, current, requireAuth, requireAdmin }, security: { csrfToken, csrfProtection } };
}

function localReturnTo(value) {
  return typeof value === 'string' && /^\/(?!\/)/.test(value) && !/[\\\r\n]/.test(value) ? value : '/jslab-cloud/workspace';
}

module.exports = { createAccounts, createSecurity, SqliteSessionStore, localReturnTo };

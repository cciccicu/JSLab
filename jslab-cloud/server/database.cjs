'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

function openDatabase(options) {
  fs.mkdirSync(options.dataDir, { recursive: true, mode: 0o700 });
  const raw = new DatabaseSync(path.join(options.dataDir, 'jslab.sqlite'));
  raw.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS host_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
      auth_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS host_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS host_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS host_sessions (sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS host_sessions_expires ON host_sessions(expires);
    CREATE TABLE IF NOT EXISTS host_auth_attempts (ip TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
  `);
  raw.prepare('INSERT OR IGNORE INTO host_meta(key,value) VALUES (?,?)')
    .run('session_secret', randomBytes(48).toString('hex'));
  let savepoint = 0;
  const db = {
    raw,
    table(name) {
      if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('Invalid table name');
      return `jslab_${name}`;
    },
    prepare: (sql) => raw.prepare(sql),
    exec: (sql) => raw.exec(sql),
    transaction(fn) {
      return (...args) => {
        const name = `bridge_${++savepoint}`;
        raw.exec(`SAVEPOINT ${name}`);
        try {
          const value = fn(...args);
          raw.exec(`RELEASE ${name}`);
          return value;
        } catch (error) {
          raw.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
          throw error;
        }
      };
    },
    close: () => raw.close(),
  };
  const metadata = new Map();
  const config = {
    metadata,
    register(spec) {
      spec = { ...spec };
      if (spec.key === 'downloadsDirectory') spec.defaultValue = path.join(options.dataDir, 'downloads');
      if (spec.key === 'pairingPublicOrigin') {
        spec.defaultValue = options.publicOrigin;
        spec.description = '扫码配对时使用的站点地址。设置 JSLAB_PUBLIC_ORIGIN 后，以该环境变量为准；其余情况留空使用当前请求地址。';
      }
      metadata.set(spec.key, spec);
      raw.prepare('INSERT OR IGNORE INTO host_config(key,value) VALUES (?,?)').run(spec.key, JSON.stringify(spec.defaultValue ?? null));
    },
    get(key) {
      if (key === 'pairingPublicOrigin' && options.publicOrigin) return options.publicOrigin;
      const row = raw.prepare('SELECT value FROM host_config WHERE key=?').get(key);
      return row ? JSON.parse(row.value) : undefined;
    },
    set(key, value) {
      if (!metadata.has(key)) throw new Error('Unknown configuration key');
      raw.prepare('UPDATE host_config SET value=? WHERE key=?').run(JSON.stringify(value), key);
    },
    all: () => Object.fromEntries([...metadata.keys()].map((key) => [key, config.get(key)])),
  };
  return { db, config, sessionSecret: raw.prepare("SELECT value FROM host_meta WHERE key='session_secret'").get().value };
}

module.exports = { openDatabase };

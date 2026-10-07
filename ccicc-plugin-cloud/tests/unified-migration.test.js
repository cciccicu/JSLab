// Real SQLite migration verification, no routes/provider/device mocks.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { migrateUnifiedScripts } = require('../jslab-cloud/lib/unified-migration');
test('legacy script data, indexes and deleted high-water IDs survive first and repeated migration', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE old_scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL,
      source TEXT NOT NULL,hash TEXT NOT NULL,checksum TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(user_id,name));
      CREATE INDEX old_scripts_updated ON old_scripts(updated_at);
      CREATE TABLE old_market_scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,owner_user_id INTEGER NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',tags TEXT NOT NULL DEFAULT '[]',source TEXT NOT NULL,hash TEXT NOT NULL,
      checksum TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',pending_name TEXT,pending_type TEXT,
      pending_description TEXT,pending_tags TEXT,pending_source TEXT,pending_hash TEXT,pending_checksum TEXT,pending_status TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO old_scripts (id,user_id,name,type,source,hash,checksum) VALUES (3,7,'历史.ui.js','ui','console.log(1); ui.render([])','hash-old','checksum-old'),(100,8,'removed.js','console','old','h','c');
      DELETE FROM old_scripts WHERE id=100;
      INSERT INTO old_market_scripts (id,owner_user_id,name,type,source,hash,checksum,status,pending_name,pending_type,pending_description,pending_tags,pending_source,pending_hash,pending_checksum,pending_status)
      VALUES (4,7,'历史.ui.js','ui','ui.render([])','published-hash','published-checksum','published','更新.ui.js','console','说明','["game"]','console.log(2)','pending-hash','pending-checksum','pending');
      INSERT INTO old_market_scripts (id,owner_user_id,name,type,source,hash,checksum) VALUES (90,7,'removed.js','console','old','h','c');
      DELETE FROM old_market_scripts WHERE id=90;`);
    const rows = table => JSON.parse(JSON.stringify(db.prepare(`SELECT * FROM old_${table}`).all())).map(({type,pending_type,...rest})=>rest);
    const before = {scripts:rows('scripts'),market:rows('market_scripts')};
    const sequences = () => JSON.stringify(db.prepare('SELECT * FROM sqlite_sequence ORDER BY name').all());
    const sequenceBefore = sequences();
    const ctx = {db:{table:name=>'old_'+name,prepare:sql=>db.prepare(sql),exec:sql=>db.exec(sql),transaction:fn=>()=>{
      db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}
    }}};
    migrateUnifiedScripts(ctx);migrateUnifiedScripts(ctx);
    assert.deepEqual({scripts:rows('scripts'),market:rows('market_scripts')},before);
    assert.equal(sequences(),sequenceBefore);
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='old_scripts_updated'").get());
    assert.throws(()=>db.prepare("INSERT INTO old_scripts(user_id,name,source,hash,checksum) VALUES(7,'历史.ui.js','x','h','c')").run(),/UNIQUE/);
    assert.equal(Number(db.prepare("INSERT INTO old_scripts(user_id,name,source,hash,checksum) VALUES(7,'next.js','x','h','c')").run().lastInsertRowid),101);
    assert.equal(Number(db.prepare("INSERT INTO old_market_scripts(owner_user_id,name,source,hash,checksum) VALUES(7,'next.js','x','h','c')").run().lastInsertRowid),91);
    for(const table of ['scripts','market_scripts'])assert.ok(db.prepare(`PRAGMA table_info(old_${table})`).all().every(column=>!['type','pending_type'].includes(column.name)));
  } finally { db.close(); }
});

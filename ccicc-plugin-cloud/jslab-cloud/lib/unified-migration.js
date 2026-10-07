'use strict';

// SQLite's native column removal retains IDs, indexes, constraints and sequence.
// No source/name/hash/time data is rewritten. Each invocation is idempotent.
function migrateUnifiedScripts(ctx) {
  ctx.db.transaction(() => {
    for (const [name, removed] of [['scripts', ['type']], ['market_scripts', ['type', 'pending_type']]]) {
      const table = ctx.db.table(name);
      const columns = ctx.db.prepare(`PRAGMA table_info(${table})`).all();
      for (const column of removed) {
        if (columns.some(item => item.name === column)) ctx.db.exec(`ALTER TABLE ${table} DROP COLUMN "${column}"`);
      }
    }
    const reviews = ctx.db.table('moderation_reviews');
    const reviewColumns = ctx.db.prepare(`PRAGMA table_info(${reviews})`).all();
    if (reviewColumns.length && !reviewColumns.some(column => column.name === 'content_hash')) ctx.db.exec(`ALTER TABLE ${reviews} ADD COLUMN content_hash TEXT`);
  })();
}
module.exports = { migrateUnifiedScripts };

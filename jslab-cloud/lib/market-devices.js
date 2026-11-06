'use strict';

const DEVICE_IDS = ['pro', 'rw'];
function normalizeSupportedDevices(value) {
  if (value == null || value === '' || Array.isArray(value) && value.length === 0) return ['pro'];
  const values = Array.isArray(value) ? value : [value];
  if (values.some(item => typeof item !== 'string' || !DEVICE_IDS.includes(item))) throw new Error('invalid_supported_devices');
  return DEVICE_IDS.filter(id => values.includes(id));
}
function storedSupportedDevices(value) {
  try { return normalizeSupportedDevices(typeof value === 'string' ? JSON.parse(value) : value); }
  catch (_) { return ['pro']; }
}
function deviceLabels(value) { return storedSupportedDevices(value).map(id => id === 'rw' ? 'RW' : 'Pro').join(' / '); }
function migrateMarketDevices(ctx) {
  const table = ctx.db.table('market_scripts');
  ctx.db.transaction(() => {
    const columns = ctx.db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some(column => column.name === 'supported_devices')) ctx.db.exec(`ALTER TABLE ${table} ADD COLUMN supported_devices TEXT NOT NULL DEFAULT '["pro"]'`);
    if (!columns.some(column => column.name === 'pending_supported_devices')) ctx.db.exec(`ALTER TABLE ${table} ADD COLUMN pending_supported_devices TEXT`);
  })();
}
module.exports = { normalizeSupportedDevices, storedSupportedDevices, deviceLabels, migrateMarketDevices };

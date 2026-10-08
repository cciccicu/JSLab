const { registerStaticFiles, assetVersion } = require('./lib/static-files');
const { registerBrowserPages } = require('./lib/browser-pages');
const { ensurePersistentState } = require('./lib/persistent-state');
const { migrateUnifiedScripts } = require('./lib/unified-migration');
const { createServerContext } = require('./lib/server-context');
const { createActivationService } = require('./lib/activation-service');
const { recoverAiReservations, createAiService } = require('./lib/ai-service');
const { createMarketService } = require('./lib/market-service');
const { createCloudFiles } = require('./lib/cloud-files');
const { registerBrowserApi } = require('./lib/browser-api');
const { registerDeviceApi } = require('./lib/device-api');
const { registerAdminPages } = require('./lib/admin-pages');

const escapeHtml = (value) => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const formatCredit = (cents) => (Math.max(0, Number(cents) || 0) / 100).toFixed(2);

module.exports = {
  install(ctx) { ensurePersistentState(ctx); },

  boot(ctx) {
    ensurePersistentState(ctx);
    migrateUnifiedScripts(ctx);
    const state = createServerContext(ctx);
    const assetsVersion = assetVersion(ctx);
    recoverAiReservations(state);

    // Route registration is rebuilt on every process start, including plugin updates.
    ctx.caddy.registerSubdomain('jslab-api');
    registerStaticFiles(ctx, { '/assets': 'assets' });
    ctx.navigation.register({ category: '工具', name: 'JSLab Cloud', path: '/jslab-cloud', surface: 'frontend', icon: 'cloud', sortOrder: 40 });
    ctx.navigation.register({ category: '插件', name: 'JSLab Cloud 管理', path: '/admin/jslab-cloud', surface: 'admin', private: true, icon: 'cloud', sortOrder: 40 });

    const activation = createActivationService(state);
    const ai = createAiService(state);
    const market = createMarketService(state);
    const cloudFiles = createCloudFiles(state);
    const services = { activation, ai, market, cloudFiles };

    registerBrowserApi(state, services);
    registerDeviceApi(state, services);
    registerBrowserPages(ctx, {
      assetsVersion, scripts: state.scripts, marketScripts: state.marketScripts,
      devices: state.devices, pairings: state.pairings, entitlementFor: state.entitlementFor,
      currentUser: state.currentUser, escapeHtml, formatCredit,
      writeScript: (req, res) => cloudFiles.writeScript(req, res, state.currentUser(req), true),
      deleteScript: (req, res) => cloudFiles.deleteScript(req, res, state.currentUser(req), true),
      redeemActivationCode: activation.redeemActivationCode, hash: state.hash, log: state.log
    });
    registerAdminPages({ ...state, assetsVersion, escapeHtml, formatCredit }, services);
  },

  uninstall(ctx, { purgeData }) {
    if (purgeData) ['ai_reservations','ai_usage','activation_codes','user_entitlements','market_reports','moderation_reviews','audit_log','pairing_codes','devices','market_scripts','scripts']
      .forEach((name) => ctx.db.exec(`DROP TABLE IF EXISTS ${ctx.db.table(name)}`));
  }
};

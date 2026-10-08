const { createBrowserView } = require('./browser-view');
const { registerWorkspacePages } = require('./browser-workspace-pages');
const { registerMarketPages } = require('./browser-market-pages');
const { registerDevicePages } = require('./browser-device-pages');

function registerBrowserPages(ctx, options) {
  const view = createBrowserView(ctx, options);
  registerWorkspacePages(ctx, options, view);
  registerMarketPages(ctx, options, view);
  registerDevicePages(ctx, options, view);
}

module.exports = { registerBrowserPages };

const { createBrowserView } = require('./browser-view');
const { registerWorkspacePages } = require('./browser-workspace-pages');
const { registerMarketPages } = require('./browser-market-pages');
const { registerDevicePages } = require('./browser-device-pages');
const { registerDocsPages } = require('./browser-docs-pages');
const { registerDownloadPage } = require('./browser-downloads');
const { registerHomePage } = require('./browser-home-page');

function registerBrowserPages(ctx, options) {
  const view = createBrowserView(ctx, options);
  registerHomePage(ctx, options, view);
  registerDownloadPage(ctx, options, view);
  registerDocsPages(ctx, options, view);
  registerWorkspacePages(ctx, options, view);
  registerMarketPages(ctx, options, view);
  registerDevicePages(ctx, options, view);
}

module.exports = { registerBrowserPages };

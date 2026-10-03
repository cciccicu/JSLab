const fs = require('node:fs');
const path = require('node:path');

/** @typedef {import('../../ccicc-plugin-api').PluginContext} PluginContext */

/**
 * @param {PluginContext} ctx
 * @param {Record<string, string>} mounts
 */
function registerStaticFiles(ctx, mounts) {
  for (const [urlPrefix, relativeRoot] of Object.entries(mounts)) {
    const root = path.resolve(ctx.rootDir, relativeRoot);
    ctx.routes.frontend.get(`${urlPrefix}/*file`, (req, res) => {
      const raw = req.params.file;
      const parts = Array.isArray(raw) ? raw : [String(raw || '')];
      const filePath = path.resolve(root, ...parts.filter(Boolean));
      const relative = path.relative(root, filePath);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
        res.sendStatus(404);
        return;
      }
      res.sendFile(filePath);
    });
  }
}

module.exports = { registerStaticFiles };

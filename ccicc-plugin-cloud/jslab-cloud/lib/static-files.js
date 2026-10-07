const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// One boot-time hash makes same-version replacements visible to browser caches.
function assetVersion(ctx) {
  const hash = crypto.createHash('sha256');
  const root = ctx.rootDir || path.resolve(__dirname, '..');
  for (const name of ['jslab-cloud.css', 'jslab-cloud.js']) hash.update(fs.readFileSync(path.join(root, 'assets', name)));
  return encodeURIComponent(`${ctx.manifest.version}-${hash.digest('hex').slice(0, 16)}`);
}

function registerStaticFiles(ctx, mounts) {
  if (!ctx.rootDir) return;
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

module.exports = { registerStaticFiles, assetVersion };

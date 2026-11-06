'use strict';

const path = require('node:path');

function readOptions(env = process.env) {
  const rootDir = path.resolve(__dirname, '..');
  const port = Number(env.JSLAB_PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('JSLAB_PORT 必须在 1–65535 之间。');
  let publicOrigin = '';
  if (env.JSLAB_PUBLIC_ORIGIN) {
    const url = new URL(env.JSLAB_PUBLIC_ORIGIN);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('JSLAB_PUBLIC_ORIGIN 应为完整的 HTTP(S) 站点地址，不含路径。');
    }
    publicOrigin = url.origin;
  }
  return {
    rootDir, port, host: env.JSLAB_HOST || '127.0.0.1', publicOrigin,
    dataDir: path.resolve(rootDir, env.JSLAB_DATA_DIR || 'data'),
    registration: env.JSLAB_REGISTRATION === 'true',
    trustProxy: env.JSLAB_TRUST_PROXY || false,
    bodyLimit: env.JSLAB_BODY_LIMIT || '64mb',
  };
}

module.exports = { readOptions };

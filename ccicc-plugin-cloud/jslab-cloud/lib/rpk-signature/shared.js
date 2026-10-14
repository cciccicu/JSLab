const crypto = require('node:crypto');
exports.CommonUtil = { calcDataDigest(buffer) { return crypto.createHash('sha256').update(buffer).digest(); } };
exports.ColorConsole = {
  error(message) { throw new Error(message); },
  throw(message) { throw new Error(message); }
};

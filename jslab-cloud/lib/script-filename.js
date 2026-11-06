'use strict';

// Market names are display titles. Only explicit exports derive a file name;
// stored names, source and hashes keep their original identity.
function scriptFilename(name) {
  const stem = String(name || 'script').replace(/\.js$/i, '').replace(/[\x00-\x1f\x7f/\\";]/g, '_').replace(/\.{2,}/g, '_').trim().replace(/^\./, '_') || 'script';
  let result = '';
  for (const character of stem) {
    if (result.length + character.length > 121 || Buffer.byteLength(result + character, 'utf8') > 125) break;
    result += character;
  }
  return (result || 'script') + '.js';
}
function validScriptName(name, existing = false) {
  return typeof name === 'string' && name.length > 0 && name.length <= 128 && /\.js$/i.test(name)
    && !name.includes('..') && !/[\x00-\x1f\x7f/\\]/.test(name)
    && (existing || Buffer.byteLength(name, 'utf8') <= 128);
}
module.exports = { scriptFilename, validScriptName };

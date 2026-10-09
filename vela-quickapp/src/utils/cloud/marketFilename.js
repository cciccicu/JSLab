import { utf8ByteLength } from '../files/textEncoding.js';

export function suggestMarketFilename(name) {
  const stem = String(name || 'script').replace(/\.js$/i, '').replace(/[\x00-\x1f\x7f/\\";]/g, '_')
    .replace(/\.{2,}/g, '_').trim().replace(/^\./, '_') || 'script';
  let result = '';
  for (const character of stem) {
    if (result.length + character.length > 121 || utf8ByteLength(result + character) > 125) break;
    result += character;
  }
  return (result || 'script') + '.js';
}

export function normalizeMarketSaveName(value) {
  let name = String(value || '').trim();
  if (!name) throw new Error('文件名不能为空');
  if (!/\.js$/i.test(name)) name += '.js';
  if (name.length > 128 || utf8ByteLength(name) > 128) throw new Error('文件名含扩展名不能超过 128 个 UTF-8 字节');
  if (name.indexOf('..') !== -1 || /[\x00-\x1f\x7f/\\]/.test(name)) throw new Error('文件名不能包含路径或连续句点');
  return name;
}

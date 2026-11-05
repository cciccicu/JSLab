function utf8Unit(value, index) {
  const code = value.charCodeAt(index);
  if (code < 0x80) return { bytes: 1, units: 1 };
  if (code < 0x800) return { bytes: 2, units: 1 };
  if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
    const next = value.charCodeAt(index + 1);
    if (next >= 0xdc00 && next <= 0xdfff) return { bytes: 4, units: 2 };
  }
  return { bytes: 3, units: 1 };
}

export function utf8ByteLength(value) {
  const text = String(value == null ? '' : value);
  let bytes = 0;
  for (let index = 0; index < text.length;) {
    const unit = utf8Unit(text, index);
    bytes += unit.bytes;
    index += unit.units;
  }
  return bytes;
}

export function sliceUtf8Chunk(value, offset, maximumBytes) {
  const text = String(value == null ? '' : value);
  const requestedOffset = Number(offset);
  if (!isFinite(requestedOffset) || requestedOffset < 0 || Math.floor(requestedOffset) !== requestedOffset) {
    throw new Error('读取偏移必须是非负整数字节数');
  }
  const startOffset = requestedOffset;
  const requestedLimit = Number(maximumBytes);
  if (!isFinite(requestedLimit) || Math.floor(requestedLimit) < 1) throw new Error('读取分块大小必须至少为 1 字节');
  const limit = Math.floor(requestedLimit);
  const total = utf8ByteLength(text);
  if (startOffset > total) throw new Error('读取偏移超过文件大小');

  let index = 0;
  let bytes = 0;
  while (index < text.length && bytes < startOffset) {
    const unit = utf8Unit(text, index);
    if (bytes + unit.bytes > startOffset) throw new Error('读取偏移不是有效的 UTF-8 字符边界');
    bytes += unit.bytes;
    index += unit.units;
  }
  if (bytes !== startOffset) throw new Error('读取偏移不是有效的 UTF-8 字符边界');

  const startIndex = index;
  while (index < text.length) {
    const unit = utf8Unit(text, index);
    if (bytes - startOffset + unit.bytes > limit) break;
    bytes += unit.bytes;
    index += unit.units;
  }

  if (index === startIndex && startOffset < total) throw new Error('读取分块大小不足以容纳下一个 UTF-8 字符');

  return {
    content: text.slice(startIndex, index),
    nextOffset: bytes,
    size: total,
    done: bytes >= total
  };
}

export function decodeBase64(value) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  if (typeof value !== 'string' || value.length % 4 !== 0) throw new Error('Base64 编码无效');
  let output = '';
  for (let index = 0; index < value.length; index += 4) {
    const a = chars.indexOf(value.charAt(index));
    const b = chars.indexOf(value.charAt(index + 1));
    const cChar = value.charAt(index + 2);
    const dChar = value.charAt(index + 3);
    const c = cChar === '=' ? 0 : chars.indexOf(cChar);
    const d = dChar === '=' ? 0 : chars.indexOf(dChar);
    if (a < 0 || b < 0 || c < 0 || d < 0 || (cChar === '=' && dChar !== '=') ||
        ((cChar === '=' || dChar === '=') && index + 4 !== value.length) ||
        (cChar === '=' && (b & 15) !== 0) || (dChar === '=' && cChar !== '=' && (c & 3) !== 0)) throw new Error('Base64 编码无效');
    output += String.fromCharCode((a << 2) | (b >> 4));
    if (cChar !== '=') output += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (dChar !== '=') output += String.fromCharCode(((c & 3) << 6) | d);
  }
  return output;
}

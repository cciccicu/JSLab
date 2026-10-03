function normalizeNumber(value) {
  const number = Number(value);
  return isFinite(number) && number > 0 ? number : 0;
}

function pad2(value) {
  return value < 10 ? '0' + value : String(value);
}

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
  const text = String(value || '');
  let bytes = 0;
  for (let index = 0; index < text.length;) {
    const unit = utf8Unit(text, index);
    bytes += unit.bytes;
    index += unit.units;
  }
  return bytes;
}

export function sliceUtf8Chunk(value, offset, maximumBytes) {
  const text = String(value || '');
  const requestedOffset = Number(offset);
  const startOffset = isFinite(requestedOffset) && requestedOffset > 0 ? Math.floor(requestedOffset) : 0;
  const requestedLimit = Number(maximumBytes);
  const limit = isFinite(requestedLimit) && requestedLimit > 0 ? Math.floor(requestedLimit) : 1;
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

  return {
    content: text.slice(startIndex, index),
    nextOffset: bytes,
    size: total,
    done: bytes >= total
  };
}

export function formatFileSize(value) {
  return String(Math.round(normalizeNumber(value))) + ' B';
}

export function formatModifiedDate(value) {
  const timestamp = normalizeNumber(value);
  if (!timestamp) return '未知';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '未知';
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
    ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

export function sortFilesNewestFirst(files) {
  return (files || []).slice().sort((left, right) => {
    const timeDifference = normalizeNumber(right.lastModifiedTime) - normalizeNumber(left.lastModifiedTime);
    if (timeDifference) return timeDifference;
    const leftName = String(left.name || '');
    const rightName = String(right.name || '');
    if (leftName === rightName) return 0;
    return leftName < rightName ? -1 : 1;
  });
}

export default {
  formatFileSize,
  formatModifiedDate,
  utf8ByteLength,
  sliceUtf8Chunk,
  sortFilesNewestFirst
};

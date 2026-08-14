function normalizeNumber(value) {
  const number = Number(value);
  return isFinite(number) && number > 0 ? number : 0;
}

function pad2(value) {
  return value < 10 ? '0' + value : String(value);
}

export function utf8ByteLength(value) {
  const text = String(value || '');
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) { bytes += 4; index += 1; }
    else bytes += 3;
  }
  return bytes;
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
  sortFilesNewestFirst
};

'use strict';

// Read only android:versionName from the binary AndroidManifest.xml.
// Format: AOSP libs/androidfw/include/androidfw/ResourceTypes.h.
function readAndroidVersion(bytes) {
  if (bytes.length < 8 || bytes.readUInt16LE(0) !== 3 || bytes.readUInt32LE(4) !== bytes.length) return '';
  let stringAt = () => '';
  for (let offset = bytes.readUInt16LE(2); offset + 8 <= bytes.length;) {
    const type = bytes.readUInt16LE(offset), headerSize = bytes.readUInt16LE(offset + 2), size = bytes.readUInt32LE(offset + 4);
    if (headerSize < 8 || size < headerSize || offset + size > bytes.length) return '';
    const chunk = bytes.subarray(offset, offset + size);
    if (type === 1) {
      const count = chunk.readUInt32LE(8), utf8 = (chunk.readUInt32LE(16) & 0x100) !== 0, start = chunk.readUInt32LE(20);
      if (headerSize + count * 4 > size || start > size) return '';
      stringAt = index => {
        if (index >= count) return '';
        let cursor = start + chunk.readUInt32LE(headerSize + index * 4);
        function length() {
          if (utf8) {
            const first = chunk.readUInt8(cursor++);
            return first & 0x80 ? ((first & 0x7f) << 8) | chunk.readUInt8(cursor++) : first;
          }
          const first = chunk.readUInt16LE(cursor); cursor += 2;
          if (!(first & 0x8000)) return first;
          const second = chunk.readUInt16LE(cursor); cursor += 2;
          return (first & 0x7fff) * 65536 + second;
        }
        const characters = length(), byteLength = utf8 ? length() : characters * 2;
        if (cursor + byteLength > size) return '';
        return chunk.toString(utf8 ? 'utf8' : 'utf16le', cursor, cursor + byteLength);
      };
    } else if (type === 0x102) {
      if (stringAt(chunk.readUInt32LE(headerSize + 4)) !== 'manifest') return '';
      const start = headerSize + chunk.readUInt16LE(headerSize + 8);
      const stride = chunk.readUInt16LE(headerSize + 10), count = chunk.readUInt16LE(headerSize + 12);
      if (stride < 20 || start + stride * count > size) return '';
      for (let index = 0; index < count; index++) {
        const attribute = start + index * stride;
        if (stringAt(chunk.readUInt32LE(attribute)) !== 'http://schemas.android.com/apk/res/android' ||
            stringAt(chunk.readUInt32LE(attribute + 4)) !== 'versionName') continue;
        const raw = chunk.readUInt32LE(attribute + 8);
        return raw !== 0xffffffff ? stringAt(raw) : chunk.readUInt8(attribute + 15) === 3 ? stringAt(chunk.readUInt32LE(attribute + 16)) : '';
      }
      return '';
    }
    offset += size;
  }
  return '';
}

module.exports = { readAndroidVersion };

// Image bytes only: no page state or file I/O. PNG uses RGBA8, filter 0 and
// stored DEFLATE blocks, keeping the encoder small and its memory predictable.
import { decodeBase64 } from '../files/textEncoding.js';
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[n] = value >>> 0;
}

export function imageFormat(value) {
  const format = String(value || '').toLowerCase();
  if (format === 'png') return 'png';
  if (format === 'jpg' || format === 'jpeg') return 'jpg';
  throw new Error('图片 format 目前支持 png、jpg；其他格式可能需要更新 JSLab');
}

export function decodeImage(source, format) {
  const binary = decodeBase64(source);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const png = bytes.length >= 24 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 &&
    bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
  const jpg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!(format === 'png' ? png : jpg)) throw new Error('图片内容与声明的 ' + format + ' 格式不符');
  return bytes;
}

export function encodePng(width, height, pixels) {
  const stride = width * 4 + 1;
  const length = stride * height;
  const compressedLength = 2 + length + Math.ceil(length / 65535) * 5 + 4;
  const output = new Uint8Array(57 + compressedLength);
  output.set([137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8;
  function u32(value) {
    output[offset++] = value >>> 24; output[offset++] = value >>> 16;
    output[offset++] = value >>> 8; output[offset++] = value;
  }
  function checksum(crc, start, end) {
    for (let i = start; i < end; i += 1) crc = crcTable[(crc ^ output[i]) & 255] ^ (crc >>> 8);
    return crc;
  }
  function chunk(type, size, write) {
    u32(size);
    const start = offset;
    for (let i = 0; i < 4; i += 1) output[offset++] = type.charCodeAt(i);
    const crc = write(checksum(0xffffffff, start, offset));
    u32((crc ^ 0xffffffff) >>> 0);
  }
  chunk('IHDR', 13, crc => {
    const start = offset;
    u32(width); u32(height); output.set([8, 6, 0, 0, 0], offset); offset += 5;
    return checksum(crc, start, offset);
  });
  chunk('IDAT', compressedLength, crc => {
    const start = offset;
    output[offset++] = 0x78; output[offset++] = 0x01;
    crc = checksum(crc, start, offset);
    let position = 0, pixel = 0, rowRemaining = 0, a = 1, b = 0;
    while (position < length) {
      const size = Math.min(65535, length - position);
      const header = offset;
      output[offset++] = position + size === length ? 1 : 0;
      output[offset++] = size; output[offset++] = size >>> 8;
      output[offset++] = ~size; output[offset++] = (~size) >>> 8;
      crc = checksum(crc, header, offset);
      let remaining = size;
      while (remaining) {
        if (!rowRemaining) {
          output[offset++] = 0;
          crc = crcTable[crc & 255] ^ (crc >>> 8);
          b += a;
          rowRemaining = width * 4; position += 1; remaining -= 1;
        }
        const count = Math.min(rowRemaining, remaining), end = pixel + count;
        // Copy, Adler and CRC share one pass. A run is at most 65535 bytes;
        // its Adler sums stay exact in JS numbers, so reduce once per run.
        for (; pixel < end; pixel += 1) {
          const value = pixels[pixel];
          output[offset++] = value;
          a += value; b += a;
          crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
        }
        rowRemaining -= count; position += count; remaining -= count;
        a %= 65521; b %= 65521;
      }
    }
    const tail = offset;
    u32(((b << 16) | a) >>> 0);
    return checksum(crc, tail, offset);
  });
  chunk('IEND', 0, crc => crc);
  return output;
}

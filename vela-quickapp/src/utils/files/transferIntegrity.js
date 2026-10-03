const ADLER_MODULUS = 65521;

export function updateAdler32(binary, previousA, previousB) {
  const value = String(binary == null ? '' : binary);
  let a = typeof previousA === 'number' ? previousA : 1;
  let b = typeof previousB === 'number' ? previousB : 0;

  for (let index = 0; index < value.length; index += 1) {
    a = (a + (value.charCodeAt(index) & 0xff)) % ADLER_MODULUS;
    b = (b + a) % ADLER_MODULUS;
  }
  return { a, b };
}

export function formatAdler32(a, b) {
  let hex = ((b * 65536 + a) >>> 0).toString(16);
  while (hex.length < 8) hex = '0' + hex;
  return hex;
}

export function adler32(binary) {
  const state = updateAdler32(binary, 1, 0);
  return formatAdler32(state.a, state.b);
}

export function adler32Utf8(text) {
  const value = String(text == null ? '' : text);
  let a = 1;
  let b = 0;

  function updateByte(byte) {
    a = (a + byte) % ADLER_MODULUS;
    b = (b + a) % ADLER_MODULUS;
  }

  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index);
    if (code < 0x80) {
      updateByte(code);
    } else if (code < 0x800) {
      updateByte(0xc0 | (code >> 6));
      updateByte(0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length &&
        value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      code = 0x10000 + ((code - 0xd800) << 10) + (value.charCodeAt(++index) - 0xdc00);
      updateByte(0xf0 | (code >> 18));
      updateByte(0x80 | ((code >> 12) & 0x3f));
      updateByte(0x80 | ((code >> 6) & 0x3f));
      updateByte(0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdfff) {
      updateByte(0xef);
      updateByte(0xbf);
      updateByte(0xbd);
    } else {
      updateByte(0xe0 | (code >> 12));
      updateByte(0x80 | ((code >> 6) & 0x3f));
      updateByte(0x80 | (code & 0x3f));
    }
  }
  return formatAdler32(a, b);
}

export default { updateAdler32, formatAdler32, adler32, adler32Utf8 };

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

export default { updateAdler32, formatAdler32, adler32 };

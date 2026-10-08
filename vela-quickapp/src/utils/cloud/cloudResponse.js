import { adler32Utf8 } from '../files/transferIntegrity.js';

export function scriptList(result) {
  if (!Array.isArray(result.scripts) || result.scripts.some(script =>
    !script || typeof script !== 'object' || typeof script.name !== 'string' || script.id == null)) {
    throw new Error('cloud_invalid_response');
  }
  return result.scripts;
}

export function verifySourceChecksum(source, checksum) {
  if (checksum != null && (typeof checksum !== 'string' || !/^[0-9a-f]{8}$/.test(checksum) ||
    adler32Utf8(source) !== checksum)) throw new Error('checksum_mismatch');
}

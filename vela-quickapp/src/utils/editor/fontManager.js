import file from '@system.file';
import { validateFontProfile } from './fontProfile.js';
import { decodeBase64 } from '../files/textEncoding.js';
import { formatAdler32, updateAdler32 } from '../files/transferIntegrity.js';

const FONT_DIRECTORY_URI = 'internal://files/fonts/';
const PENDING_FONT_URI = FONT_DIRECTORY_URI + 'pending.ttf';
const PENDING_DATA_URI = FONT_DIRECTORY_URI + 'pending.json';
const PENDING_STATE_URI = FONT_DIRECTORY_URI + 'pending.state.json';
const PENDING_PARTS_URI = FONT_DIRECTORY_URI + 'pending.parts/';
const INSTALL_REQUEST_URI = FONT_DIRECTORY_URI + 'install.request.json';
const INSTALL_RESULT_URI = FONT_DIRECTORY_URI + 'install.result.json';
const HELPER_HEARTBEAT_URI = FONT_DIRECTORY_URI + 'helper.heartbeat.json';
const HELPER_HEARTBEAT_TIMEOUT_SECONDS = 15;
export const MAX_FONT_BYTES = 2 * 1024 * 1024;
let installRequestSequence = 0;

function ensureFontDirectory() {
  return ensureDirectory(FONT_DIRECTORY_URI, '无法创建字体目录');
}

function ensureDirectory(uri, message) {
  return new Promise((resolve, reject) => {
    file.access({
      uri,
      success: resolve,
      fail: () => file.mkdir({
        uri,
        recursive: true,
        success: resolve,
        fail: (data, code) => reject(new Error(message + ': ' + code))
      })
    });
  });
}

function deleteIfPresent(uri) {
  return new Promise((resolve, reject) => {
    file.access({
      uri,
      success: () => file.delete({
        uri,
        success: resolve,
        fail: (data, code) => reject(new Error('无法清理旧字体数据: ' + code))
      }),
      fail: resolve
    });
  });
}

function readJson(uri) {
  return new Promise((resolve) => {
    file.readText({
      uri,
      success: (data) => {
        try { resolve(JSON.parse(data.text)); } catch (error) { resolve(null); }
      },
      fail: () => resolve(null)
    });
  });
}

function writeJson(uri, value, message) {
  return new Promise((resolve, reject) => {
    file.writeText({
      uri,
      text: JSON.stringify(value),
      success: resolve,
      fail: (data, code) => reject(new Error(message + ': ' + code))
    });
  });
}

function listPendingParts() {
  return new Promise((resolve, reject) => {
    file.list({
      uri: PENDING_PARTS_URI,
      success: data => resolve((data.fileList || []).filter(info => /\/part-\d{6}\.b64$/.test(info.uri))),
      fail: (data, code) => reject(new Error('无法读取字体分块: ' + code))
    });
  });
}

function clearPendingParts() {
  return listPendingParts()
    .then(parts => parts.reduce(
      (promise, part) => promise.then(() => deleteIfPresent(part.uri)),
      Promise.resolve()
    ))
    .then(() => deleteIfPresent(PENDING_STATE_URI))
    .then(() => deleteIfPresent(PENDING_DATA_URI))
    .then(() => deleteIfPresent(PENDING_FONT_URI));
}

function clearLegacyBinaryParts() {
  return new Promise((resolve, reject) => {
    file.list({
      uri: PENDING_PARTS_URI,
      success: data => resolve((data.fileList || []).filter(info => /\/part-\d{6}\.bin$/.test(info.uri))),
      fail: (data, code) => reject(new Error('无法读取旧字体分块: ' + code))
    });
  }).then(parts => parts.reduce(
    (promise, part) => promise.then(() => deleteIfPresent(part.uri)),
    Promise.resolve()
  ));
}

function partUri(index) {
  let value = String(index);
  while (value.length < 6) value = '0' + value;
  return PENDING_PARTS_URI + 'part-' + value + '.b64';
}

function encodedPartLength(byteLength) {
  return Math.ceil(byteLength / 3) * 4;
}

function validResumeState(state, profile, expectedBytes, chunkBytes, fingerprint, checksum) {
  if (!state || state.version !== 2 || state.expectedBytes !== expectedBytes ||
    state.chunkBytes !== chunkBytes || state.fingerprint !== fingerprint ||
    state.checksum !== checksum || state.checksumAlgorithm !== 'adler32' ||
    typeof state.nextIndex !== 'number' || !isFinite(state.nextIndex) ||
    Math.floor(state.nextIndex) !== state.nextIndex || state.nextIndex < 0 ||
    typeof state.bytes !== 'number' || !isFinite(state.bytes) ||
    Math.floor(state.bytes) !== state.bytes || state.bytes < 0 ||
    state.nextIndex > Math.ceil(expectedBytes / chunkBytes) ||
    typeof state.adlerA !== 'number' || typeof state.adlerB !== 'number' ||
    !isFinite(state.adlerA) || !isFinite(state.adlerB) ||
    state.adlerA < 0 || state.adlerA >= 65521 || Math.floor(state.adlerA) !== state.adlerA ||
    state.adlerB < 0 || state.adlerB >= 65521 || Math.floor(state.adlerB) !== state.adlerB ||
    state.bytes > expectedBytes) return false;
  if (state.bytes !== Math.min(state.nextIndex * chunkBytes, expectedBytes)) return false;
  return JSON.stringify(state.profile) === JSON.stringify(profile);
}

function hasCompleteResumeParts(state) {
  return listPendingParts().then((parts) => {
    if (parts.length !== state.nextIndex) return false;
    const lengths = {};
    parts.forEach((part) => {
      lengths[part.uri.substring(part.uri.lastIndexOf('/') + 1)] = Number(part.length) || 0;
    });
    for (let index = 0; index < state.nextIndex; index += 1) {
      const expectedBytes = Math.min(state.chunkBytes, state.expectedBytes - index * state.chunkBytes);
      const expectedLength = encodedPartLength(expectedBytes);
      const name = partUri(index).substring(partUri(index).lastIndexOf('/') + 1);
      if (lengths[name] !== expectedLength) return false;
    }
    return true;
  });
}

export function preparePendingPackage(profile, expectedBytes, chunkBytes, fingerprint, checksum) {
  let normalized;
  try { normalized = validateFontProfile(profile); } catch (error) { return Promise.reject(error); }
  const size = Number(expectedBytes);
  const chunkSize = Number(chunkBytes);
  if (!isFinite(size) || Math.floor(size) !== size || size < 1 || size > MAX_FONT_BYTES ||
    !isFinite(chunkSize) || Math.floor(chunkSize) !== chunkSize || chunkSize < 1 || chunkSize > 16 * 1024) {
    return Promise.reject(new Error('字体上传参数无效'));
  }
  if (typeof fingerprint !== 'string' || !/^[0-9a-f]{16}$/.test(fingerprint)) {
    return Promise.reject(new Error('字体内容指纹无效'));
  }
  if (typeof checksum !== 'string' || !/^[0-9a-f]{8}$/.test(checksum)) {
    return Promise.reject(new Error('字体内容校验值无效'));
  }
  return ensureFontDirectory()
    .then(() => ensureDirectory(PENDING_PARTS_URI, '无法创建字体分块目录'))
    .then(() => readJson(PENDING_STATE_URI))
    .then((state) => {
      if (validResumeState(state, normalized, size, chunkSize, fingerprint, checksum)) {
        return hasCompleteResumeParts(state).then((available) => {
          if (available) return state;
          return clearPendingParts().then(() => null);
        });
      }
      return clearPendingParts().then(clearLegacyBinaryParts).then(() => null);
    })
    .then((state) => {
      if (state) return state;
      const initial = {
        version: 2,
        expectedBytes: size,
        chunkBytes: chunkSize,
        fingerprint,
        checksumAlgorithm: 'adler32',
        checksum,
        nextIndex: 0,
        bytes: 0,
        adlerA: 1,
        adlerB: 0,
        profile: normalized
      };
      return writeJson(PENDING_STATE_URI, initial, '初始化字体上传状态失败').then(() => initial);
    });
}

export function writePendingPart(index, encoded, state) {
  let binary;
  try { binary = decodeBase64(encoded); } catch (error) { return Promise.reject(new Error('字体分块编码无效')); }
  if (typeof binary !== 'string' || !binary.length || !state || index !== state.nextIndex) {
    return Promise.reject(new Error('字体分块状态无效'));
  }
  const expectedLength = Math.min(state.chunkBytes, state.expectedBytes - state.bytes);
  if (binary.length !== expectedLength) return Promise.reject(new Error('字体分块长度无效'));
  const nextBytes = state.bytes + binary.length;
  if (nextBytes > state.expectedBytes || nextBytes > MAX_FONT_BYTES) {
    return Promise.reject(new Error('字体不能超过 2 MiB'));
  }
  if (typeof encoded !== 'string' || encoded.length !== encodedPartLength(binary.length)) {
    return Promise.reject(new Error('字体分块编码无效'));
  }
  const integrity = updateAdler32(binary, state.adlerA, state.adlerB);
  const nextState = Object.assign({}, state, {
    nextIndex: state.nextIndex + 1,
    bytes: nextBytes,
    adlerA: integrity.a,
    adlerB: integrity.b
  });
  return new Promise((resolve, reject) => {
    file.writeText({
      uri: partUri(index),
      text: encoded,
      success: resolve,
      fail: (data, code) => reject(new Error('写入字体分块失败: ' + code))
    });
  }).then(() => writeJson(PENDING_STATE_URI, nextState, '保存字体上传进度失败'))
    .then(() => nextState);
}

export function finishPendingPackage(state) {
  if (!state || state.bytes !== state.expectedBytes || state.bytes > MAX_FONT_BYTES) {
    return Promise.reject(new Error('字体上传不完整，请继续上传'));
  }
  return hasCompleteResumeParts(state).then((complete) => {
    if (!complete) throw new Error('字体分片不完整，请重新上传');
    if (formatAdler32(state.adlerA, state.adlerB) !== state.checksum) {
      throw new Error('字体内容校验失败，请重新上传');
    }
    const metadata = Object.assign({}, state.profile, {
      storage: 'parts-base64-v2',
      partEncoding: 'base64',
      size: state.expectedBytes,
      chunkBytes: state.chunkBytes,
      partCount: state.nextIndex,
      checksumAlgorithm: state.checksumAlgorithm,
      checksum: state.checksum,
      fingerprint: state.fingerprint
    });
    return writeJson(PENDING_DATA_URI, metadata, '写入字体数据失败')
      .then(() => ({ profile: state.profile, size: state.expectedBytes, partCount: state.nextIndex }));
  });
}

function installationRequestId() {
  installRequestSequence += 1;
  return 'font-' + Date.now() + '-' + installRequestSequence;
}

function validPendingMetadata(metadata) {
  return metadata && metadata.version === 1 && metadata.storage === 'parts-base64-v2' &&
    metadata.partEncoding === 'base64' &&
    typeof metadata.size === 'number' && Math.floor(metadata.size) === metadata.size &&
    metadata.size > 0 && metadata.size <= MAX_FONT_BYTES &&
    typeof metadata.chunkBytes === 'number' && Math.floor(metadata.chunkBytes) === metadata.chunkBytes &&
    metadata.chunkBytes > 0 && metadata.chunkBytes <= 16 * 1024 &&
    metadata.partCount === Math.ceil(metadata.size / metadata.chunkBytes) &&
    typeof metadata.sourceName === 'string' && typeof metadata.checksum === 'string' &&
    /^[0-9a-f]{8}$/.test(metadata.checksum) && metadata.checksumAlgorithm === 'adler32';
}

export function requestInstallation() {
  return readJson(PENDING_DATA_URI).then((metadata) => {
    if (!validPendingMetadata(metadata)) {
      throw new Error('没有完整的待安装字体包，请先在 AstroBox 上传字体');
    }
    const request = {
      version: 1,
      type: 'font_install_request',
      id: installationRequestId(),
      action: 'install',
      createdAt: Date.now(),
      sourceName: metadata.sourceName,
      size: Number(metadata.size),
      checksumAlgorithm: metadata.checksumAlgorithm,
      checksum: metadata.checksum
    };
    return writeJson(INSTALL_REQUEST_URI, request, '发起字体安装失败').then(() => request);
  });
}

export function getInstallationResult() {
  return readJson(INSTALL_RESULT_URI).then((result) => {
    if (!result || result.version !== 1 || result.type !== 'font_install_result' ||
      typeof result.id !== 'string' || !result.id) return null;
    return result;
  });
}

export function getInstallationRequest() {
  return readJson(INSTALL_REQUEST_URI).then((request) => {
    if (!request || request.version !== 1 || request.type !== 'font_install_request' ||
      request.action !== 'install' || typeof request.id !== 'string' || !request.id) return null;
    return request;
  });
}

export function getHelperHeartbeat() {
  return readJson(HELPER_HEARTBEAT_URI).then((heartbeat) => {
    const updatedAt = heartbeat && Number(heartbeat.updatedAt);
    const valid = heartbeat && heartbeat.version === 1 &&
      heartbeat.type === 'jslab_helper_heartbeat' &&
      isFinite(updatedAt) && updatedAt > 0;
    const age = valid ? Math.max(0, Date.now() / 1000 - updatedAt) : Infinity;
    return {
      online: age <= HELPER_HEARTBEAT_TIMEOUT_SECONDS,
      ageSeconds: isFinite(age) ? age : null,
      updatedAt: valid ? updatedAt : null
    };
  });
}

export function getPendingInstallationInfo() {
  return readJson(PENDING_DATA_URI).then((metadata) => {
    if (!validPendingMetadata(metadata)) return null;
    return {
      sourceName: metadata.sourceName,
      size: Number(metadata.size),
      checksum: metadata.checksum
    };
  });
}

export default {
  preparePendingPackage,
  writePendingPart,
  finishPendingPackage,
  requestInstallation,
  getInstallationResult,
  getInstallationRequest,
  getHelperHeartbeat,
  getPendingInstallationInfo,
  MAX_FONT_BYTES
};

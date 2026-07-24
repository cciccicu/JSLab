import configManager from './configManager.js';
import file from '@system.file';

const FONT_DIRECTORY_URI = 'internal://files/fonts/';
export const MAX_FONT_BYTES = 2 * 1024 * 1024;
export const MAX_TOTAL_FONT_BYTES = 4 * 1024 * 1024;

export const DEFAULT_FONT_PROFILE = {
  family: 'UbuntuMono',
  lineHeightRatio: 1,
  lineHeightOffset: 0,
  asciiWidthRatio: 0.5,
  wideWidthRatio: 1
};

const LIMITS = {
  lineHeightRatio: [0.8, 2.5],
  lineHeightOffset: [-8, 12],
  asciiWidthRatio: [0.3, 1.2],
  wideWidthRatio: [0.5, 2.5]
};

function numberInRange(value, range, fallback) {
  const number = Number(value);
  if (isNaN(number)) return fallback;
  return Math.min(range[1], Math.max(range[0], number));
}

export function normalizeFontProfile(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    family: 'UbuntuMono',
    lineHeightRatio: numberInRange(source.lineHeightRatio, LIMITS.lineHeightRatio, DEFAULT_FONT_PROFILE.lineHeightRatio),
    lineHeightOffset: numberInRange(source.lineHeightOffset, LIMITS.lineHeightOffset, DEFAULT_FONT_PROFILE.lineHeightOffset),
    asciiWidthRatio: numberInRange(source.asciiWidthRatio, LIMITS.asciiWidthRatio, DEFAULT_FONT_PROFILE.asciiWidthRatio),
    wideWidthRatio: numberInRange(source.wideWidthRatio, LIMITS.wideWidthRatio, DEFAULT_FONT_PROFILE.wideWidthRatio)
  };
}

export function getProfile() {
  return configManager.get('editor.font.profile', DEFAULT_FONT_PROFILE)
    .then(normalizeFontProfile);
}

export function setProfile(profile) {
  return configManager.set('editor.font.profile', normalizeFontProfile(profile));
}

function validateFontName(name) {
  if (typeof name !== 'string' || !name || name.length > 128 ||
    !/\.(ttf|otf)$/i.test(name) || name.indexOf('..') !== -1 || /[\x00-\x1f\x7f/\\]/.test(name)) {
    throw new Error('只允许不含路径的 .ttf 或 .otf 文件名');
  }
  return name;
}

function ensureFontDirectory() {
  return new Promise((resolve, reject) => {
    file.access({
      uri: FONT_DIRECTORY_URI,
      success: resolve,
      fail: () => file.mkdir({
        uri: FONT_DIRECTORY_URI,
        recursive: true,
        success: resolve,
        fail: (data, code) => reject(new Error('无法创建字体目录: ' + code))
      })
    });
  });
}

function listFonts() {
  return ensureFontDirectory().then(() => new Promise((resolve, reject) => {
    file.list({
      uri: FONT_DIRECTORY_URI,
      success: (data) => resolve((data.fileList || [])
        .filter(item => /\.(ttf|otf)$/i.test(item.uri || ''))
        .map(item => ({
          name: item.uri.substring(item.uri.lastIndexOf('/') + 1),
          size: Number(item.length) || 0
        }))),
      fail: (data, code) => reject(new Error('无法读取字体列表: ' + code))
    });
  }));
}

function binaryStringToBuffer(binary) {
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index) & 0xff;
  return buffer;
}

function writeFont(name, binary, overwrite) {
  let safeName;
  try {
    safeName = validateFontName(name);
  } catch (error) {
    return Promise.reject(error);
  }
  if (typeof binary !== 'string' || binary.length > MAX_FONT_BYTES) {
    return Promise.reject(new Error('字体不能超过 2 MiB'));
  }
  return listFonts().then((fonts) => {
    const existing = fonts.find(item => item.name === safeName);
    const total = fonts.reduce((sum, item) => sum + item.size, 0) - (existing ? existing.size : 0) + binary.length;
    if (total > MAX_TOTAL_FONT_BYTES) throw new Error('字体总大小不能超过 4 MiB');
    if (existing && !overwrite) throw new Error('字体已存在，需要确认覆盖');
    return new Promise((resolve, reject) => {
      file.writeArrayBuffer({
        uri: FONT_DIRECTORY_URI + safeName,
        buffer: binaryStringToBuffer(binary),
        success: () => resolve({ name: safeName, size: binary.length }),
        fail: (data, code) => reject(new Error('写入字体失败: ' + code))
      });
    });
  });
}

function removeFont(name) {
  let safeName;
  try {
    safeName = validateFontName(name);
  } catch (error) {
    return Promise.reject(error);
  }
  return ensureFontDirectory().then(() => new Promise((resolve, reject) => {
    file.delete({
      uri: FONT_DIRECTORY_URI + safeName,
      success: () => resolve({ name: safeName }),
      fail: (data, code) => reject(new Error('删除字体失败: ' + code))
    });
  }));
}

export default {
  getProfile, setProfile, normalizeFontProfile, DEFAULT_FONT_PROFILE,
  listFonts, writeFont, removeFont, MAX_FONT_BYTES, MAX_TOTAL_FONT_BYTES
};

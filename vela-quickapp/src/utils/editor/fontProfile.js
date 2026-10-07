import file from '@system.file';

const ACTIVE_DATA_URI = '/common/fonts/active.json';

export const DEFAULT_FONT_PROFILE = {
  version: 1,
  name: 'Ubuntu Mono',
  sourceName: 'UbuntuMono-MiSans-Editor-v4.ttf',
  format: 'ttf',
  family: 'JSLabActive',
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

function cleanText(value, fallback, maximum) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > maximum || /[\x00-\x1f\x7f]/.test(text)) return fallback;
  return text;
}

function validateSourceName(name) {
  if (typeof name !== 'string' || !name || name.length > 128 ||
    !/\.(ttf|otf)$/i.test(name) || name.indexOf('..') !== -1 || /[\x00-\x1f\x7f/\\]/.test(name)) {
    throw new Error('只允许不含路径的 .ttf 或 .otf 文件名');
  }
  return name;
}

export function normalizeFontProfile(value) {
  const source = value && typeof value === 'object' ? value : {};
  let sourceName = DEFAULT_FONT_PROFILE.sourceName;
  try { sourceName = validateSourceName(source.sourceName); } catch (error) { sourceName = DEFAULT_FONT_PROFILE.sourceName; }
  const format = /\.otf$/i.test(sourceName) ? 'otf' : 'ttf';
  return {
    version: 1,
    name: cleanText(source.name, DEFAULT_FONT_PROFILE.name, 64),
    sourceName,
    format,
    family: 'JSLabActive',
    lineHeightRatio: numberInRange(source.lineHeightRatio, LIMITS.lineHeightRatio, DEFAULT_FONT_PROFILE.lineHeightRatio),
    lineHeightOffset: numberInRange(source.lineHeightOffset, LIMITS.lineHeightOffset, DEFAULT_FONT_PROFILE.lineHeightOffset),
    asciiWidthRatio: numberInRange(source.asciiWidthRatio, LIMITS.asciiWidthRatio, DEFAULT_FONT_PROFILE.asciiWidthRatio),
    wideWidthRatio: numberInRange(source.wideWidthRatio, LIMITS.wideWidthRatio, DEFAULT_FONT_PROFILE.wideWidthRatio)
  };
}

export function validateFontProfile(value) {
  if (!value || typeof value !== 'object') throw new Error('缺少字体数据');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 64 ||
    /[\x00-\x1f\x7f"\\]/.test(value.name)) {
    throw new Error('字体名称无效');
  }
  validateSourceName(value.sourceName);
  Object.keys(LIMITS).forEach((key) => {
    const number = Number(value[key]);
    const range = LIMITS[key];
    if (isNaN(number) || number < range[0] || number > range[1]) throw new Error('字体参数无效: ' + key);
  });
  return normalizeFontProfile(value);
}

export function readActiveFontProfile() {
  return new Promise((resolve) => {
    file.readText({
      uri: ACTIVE_DATA_URI,
      success: (data) => {
        try { resolve(normalizeFontProfile(JSON.parse(data.text))); }
        catch (error) { resolve(normalizeFontProfile(null)); }
      },
      fail: () => resolve(normalizeFontProfile(null))
    });
  });
}

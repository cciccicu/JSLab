// Match the full-width Chinese punctuation metrics in the editor font.
const WIDE_CHARACTER = /[\u2014\u2018\u2019\u201c\u201d\u2026\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uff60\uffe0-\uffe6]/;
const CODE_WIDTH_SAFETY_RATIO = 1.15;
const CODE_WIDTH_PADDING = 48;

export function getLineHeight(fontProfile, fontSize) {
  const profile = fontProfile || {};
  return Math.max(1, fontSize * (Number(profile.lineHeightRatio) || 1) + (Number(profile.lineHeightOffset) || 0));
}

export function getCharacterWidth(character, fontProfile, fontSize) {
  const profile = fontProfile || {};
  const ratio = WIDE_CHARACTER.test(character)
    ? (Number(profile.wideWidthRatio) || 1)
    : (Number(profile.asciiWidthRatio) || 0.5);
  return fontSize * ratio;
}

export function isWideCharacter(text, index) {
  return text.charCodeAt(index) >= 0x2014 && WIDE_CHARACTER.test(text[index]);
}

export function countWideCharacters(text, start = 0, end = text.length) {
  let count = 0;
  for (let index = start; index < end; index += 1) {
    if (isWideCharacter(text, index)) count += 1;
  }
  return count;
}

export function getCodeWidth(maxLineWidth) {
  const required = Math.ceil(maxLineWidth * CODE_WIDTH_SAFETY_RATIO) + CODE_WIDTH_PADDING;
  // Reserve a little horizontal space instead of resizing every row per key.
  return 336 + Math.max(0, Math.ceil((required - 336) / 64)) * 64;
}

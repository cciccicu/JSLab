import { SCREEN } from '../core/screen.js';

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
  if (profile.zeroWidthCharacters && profile.zeroWidthCharacters.indexOf(character) !== -1) return 0;
  const ratio = isWideCharacter(character, 0, profile) || (profile.emojiCatalog && character.length === 2)
    ? (Number(profile.wideWidthRatio) || 1)
    : (Number(profile.asciiWidthRatio) || 0.5);
  return fontSize * ratio;
}

export function isWideCharacter(text, index, profile) {
  if (text.charCodeAt(index) < 0xA0) return false;
  return WIDE_CHARACTER.test(text[index]) || !!(profile && profile.fullWidthCharacters &&
    profile.fullWidthCharacters.indexOf(text[index]) !== -1);
}

export function characterWidthAdjustment(text, index, profile) {
  if (text.charCodeAt(index) < 0xA0) return 0;
  if (profile && profile.zeroWidthCharacters && profile.zeroWidthCharacters.indexOf(text[index]) !== -1) return -1;
  return isWideCharacter(text, index, profile) ? 1 : 0;
}

export function countWideCharacters(text, start = 0, end = text.length, profile) {
  let count = 0;
  for (let index = start; index < end; index += 1) {
    count += characterWidthAdjustment(text, index, profile);
  }
  return count;
}

// The bundled font uses one full cell per supplementary icon and zero advance
// for selectors. Keep UTF-16 source offsets while moving over complete icons.
export function nextCharacterEnd(text, start, profile) {
  let end = start + 1;
  if (!profile || !profile.emojiCatalog) return end;
  if (/[\uD800-\uDBFF]/.test(text[start]) && /[\uDC00-\uDFFF]/.test(text[end])) end += 1;
  while (end < text.length && profile.zeroWidthCharacters && profile.zeroWidthCharacters.indexOf(text[end]) !== -1) end += 1;
  return end;
}

export function previousCharacterStart(text, end, profile) {
  let start = end - 1;
  if (!profile || !profile.emojiCatalog) return start;
  while (start > 0 && profile.zeroWidthCharacters && profile.zeroWidthCharacters.indexOf(text[start]) !== -1) start -= 1;
  if (start > 0 && /[\uDC00-\uDFFF]/.test(text[start]) && /[\uD800-\uDBFF]/.test(text[start - 1])) start -= 1;
  return start;
}

export function getCodeWidth(maxLineWidth) {
  const required = Math.ceil(maxLineWidth * CODE_WIDTH_SAFETY_RATIO) + CODE_WIDTH_PADDING;
  // Reserve a little horizontal space instead of resizing every row per key.
  return SCREEN.width + Math.max(0, Math.ceil((required - SCREEN.width) / 64)) * 64;
}

const WIDE_CHARACTER = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;

export function getLineHeight(fontProfile, fontSize) {
  const profile = fontProfile || {};
  return fontSize * (Number(profile.lineHeightRatio) || 1) + (Number(profile.lineHeightOffset) || 0);
}

export function getCharacterWidth(character, fontProfile, fontSize) {
  const profile = fontProfile || {};
  const ratio = WIDE_CHARACTER.test(character)
    ? (Number(profile.wideWidthRatio) || 1)
    : (Number(profile.asciiWidthRatio) || 0.5);
  return fontSize * ratio;
}

export function getTextWidth(text, fontProfile, fontSize) {
  const source = String(text || '');
  let maxWidth = 0;
  let lineWidth = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) {
      if (lineWidth > maxWidth) maxWidth = lineWidth;
      lineWidth = 0;
    } else {
      lineWidth += getCharacterWidth(source[index], fontProfile, fontSize);
    }
  }
  if (lineWidth > maxWidth) maxWidth = lineWidth;
  return Math.ceil(maxWidth);
}

export function getCursorPosition(before, fontProfile, fontSize) {
  const source = String(before || '');
  const lineStart = source.lastIndexOf('\n') + 1;
  let line = 0;
  let x = 0;

  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) line += 1;
  }
  for (let index = lineStart; index < source.length; index += 1) {
    x += getCharacterWidth(source[index], fontProfile, fontSize);
  }

  const height = getLineHeight(fontProfile, fontSize);
  return { x, y: line * height, line, height };
}

function findLineBounds(text, targetLine) {
  let line = 0;
  let start = 0;
  for (let index = 0; index < text.length && line < targetLine; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
      start = index + 1;
    }
  }
  const newline = text.indexOf('\n', start);
  return { start, end: newline === -1 ? text.length : newline };
}

export function moveCursorToPoint(text, x, y, fontProfile, fontSize) {
  const source = String(text || '');
  const lineHeight = getLineHeight(fontProfile, fontSize);
  const targetLine = Math.max(0, Math.floor(y / lineHeight));
  const bounds = findLineBounds(source, targetLine);
  let lineWidth = 0;
  let offset = bounds.start;

  while (offset < bounds.end) {
    const characterWidth = getCharacterWidth(source[offset], fontProfile, fontSize);
    if (lineWidth + characterWidth / 2 > x) break;
    lineWidth += characterWidth;
    offset += 1;
  }
  return { before: source.slice(0, offset), after: source.slice(offset) };
}

export function moveCursorVertically(before, after, direction) {
  const left = String(before || '');
  const source = left + String(after || '');
  const currentStart = left.lastIndexOf('\n') + 1;
  const column = left.length - currentStart;
  let targetStart;
  let targetEnd;

  if (direction < 0) {
    if (currentStart === 0) return null;
    targetEnd = currentStart - 1;
    targetStart = source.lastIndexOf('\n', targetEnd - 1) + 1;
  } else {
    const currentEnd = source.indexOf('\n', left.length);
    if (currentEnd === -1) return null;
    targetStart = currentEnd + 1;
    const nextEnd = source.indexOf('\n', targetStart);
    targetEnd = nextEnd === -1 ? source.length : nextEnd;
  }

  const offset = Math.min(targetStart + column, targetEnd);
  return { before: source.slice(0, offset), after: source.slice(offset) };
}

export default {
  getLineHeight,
  getTextWidth,
  getCursorPosition,
  moveCursorToPoint,
  moveCursorVertically
};

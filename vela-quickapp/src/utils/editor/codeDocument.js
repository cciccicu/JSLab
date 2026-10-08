import { countWideCharacters, getCharacterWidth, getCodeWidth, getLineHeight, isWideCharacter } from './codeEditor.js';

// Plain JS state, never a page data object. Widths derive from integer counts so
// insert/delete round trips cannot accumulate floating point cursor drift.
function widthOf(document, length, wideCount) {
  return (length - wideCount) * document.asciiWidth + wideCount * document.wideWidth;
}

function addWidth(document, width) {
  if (width > document.maxLineWidth) {
    document.maxLineWidth = width;
    document.maxWidthCount = 1;
  } else if (width === document.maxLineWidth) {
    document.maxWidthCount += 1;
  }
}

function removeWidth(document, width) {
  if (width === document.maxLineWidth) document.maxWidthCount -= 1;
}

function finishLayout(document, changedLine) {
  if (!document.maxWidthCount) {
    // Repeated backspaces on the same longest line reuse the other lines' max.
    let remainder = document.widthRemainder;
    if (!remainder || remainder.line !== changedLine) {
      remainder = { line: changedLine, width: -1, count: 0 };
      for (let index = 0; index < document.lines.length; index += 1) {
        const line = document.lines[index];
        if (line === changedLine) continue;
        if (line.width > remainder.width) { remainder.width = line.width; remainder.count = 1; }
        else if (line.width === remainder.width) remainder.count += 1;
      }
    }
    document.widthRemainder = changedLine ? remainder : null;
    document.maxLineWidth = remainder.width;
    document.maxWidthCount = remainder.count;
    if (changedLine) addWidth(document, changedLine.width);
  }
  document.width = getCodeWidth(document.maxLineWidth);
  const cursor = document.cursor;
  cursor.x = widthOf(document, cursor.column, cursor.wideCount);
  cursor.y = cursor.line * cursor.height;
}

function createLine(document, text, wideCount) {
  const line = { id: document.nextLineId++, text, wideCount, width: widthOf(document, text.length, wideCount) };
  addWidth(document, line.width);
  return line;
}

function updateLine(document, line, text, wideCount) {
  removeWidth(document, line.width);
  line.text = text;
  line.wideCount = wideCount;
  line.width = widthOf(document, text.length, wideCount);
  addWidth(document, line.width);
}

function clamp(value, maximum) {
  return Math.max(0, Math.min(maximum, Math.floor(Number(value) || 0)));
}

export function createCodeDocument(source, fontProfile, fontSize, cursorOffset = 0) {
  const code = String(source || '');
  const document = {
    lines: [],
    sourceLength: code.length,
    nextLineId: 0,
    asciiWidth: getCharacterWidth('a', fontProfile, fontSize),
    wideWidth: getCharacterWidth('中', fontProfile, fontSize),
    maxLineWidth: -1,
    maxWidthCount: 0,
    widthRemainder: null,
    width: 336,
    preferredX: null,
    cursor: { offset: clamp(cursorOffset, code.length), line: 0, column: 0,
      wideCount: 0, x: 0, y: 0, height: getLineHeight(fontProfile, fontSize) }
  };
  const texts = code.split('\n');
  let start = 0;
  for (let index = 0; index < texts.length; index += 1) {
    const text = texts[index];
    const wideCount = countWideCharacters(text);
    document.lines.push(createLine(document, text, wideCount));
    if (document.cursor.offset >= start && document.cursor.offset <= start + text.length) {
      document.cursor.line = index;
      document.cursor.column = document.cursor.offset - start;
      document.cursor.wideCount = document.cursor.column === text.length ? wideCount :
        countWideCharacters(text, 0, document.cursor.column);
    }
    start += text.length + 1;
  }
  finishLayout(document);
  return document;
}

export function insertCodeText(document, value) {
  const text = String(value || '');
  if (!text) return null;
  const cursor = document.cursor;
  const startLine = cursor.line;
  const line = document.lines[startLine];
  if (document.widthRemainder && document.widthRemainder.line !== line) document.widthRemainder = null;
  const before = line.text.slice(0, cursor.column);
  const after = line.text.slice(cursor.column);
  const addedLines = [];
  if (text.indexOf('\n') === -1) {
    const wideCount = countWideCharacters(text);
    updateLine(document, line, before + text + after, line.wideCount + wideCount);
    cursor.column += text.length;
    cursor.wideCount += wideCount;
  } else {
    document.widthRemainder = null;
    const parts = text.split('\n');
    const suffixWideCount = line.wideCount - cursor.wideCount;
    updateLine(document, line, before + parts[0], cursor.wideCount + countWideCharacters(parts[0]));
    for (let index = 1; index < parts.length; index += 1) {
      const part = parts[index];
      const wideCount = countWideCharacters(part);
      const last = index === parts.length - 1;
      addedLines.push(createLine(document, last ? part + after : part,
        wideCount + (last ? suffixWideCount : 0)));
      if (last) {
        cursor.column = part.length;
        cursor.wideCount = wideCount;
      }
    }
    // Newlines can shift line records; ordinary typing never copies this array.
    document.lines = document.lines.slice(0, startLine + 1).concat(addedLines, document.lines.slice(startLine + 1));
    cursor.line += addedLines.length;
  }
  cursor.offset += text.length;
  document.sourceLength += text.length;
  document.preferredX = null;
  finishLayout(document, addedLines.length ? null : line);
  return { startLine, removedLines: [], addedLines };
}

export function deleteCodeBackward(document) {
  const cursor = document.cursor;
  if (!cursor.offset) return null;
  const line = document.lines[cursor.line];
  if (document.widthRemainder && document.widthRemainder.line !== line) document.widthRemainder = null;
  const removedLines = [];
  if (cursor.column) {
    const wideCount = isWideCharacter(line.text, cursor.column - 1) ? 1 : 0;
    updateLine(document, line, line.text.slice(0, cursor.column - 1) + line.text.slice(cursor.column),
      line.wideCount - wideCount);
    cursor.column -= 1;
    cursor.wideCount -= wideCount;
  } else {
    document.widthRemainder = null;
    const previous = document.lines[cursor.line - 1];
    cursor.column = previous.text.length;
    cursor.wideCount = previous.wideCount;
    removeWidth(document, line.width);
    updateLine(document, previous, previous.text + line.text, previous.wideCount + line.wideCount);
    document.lines.splice(cursor.line, 1);
    removedLines.push(line);
    cursor.line -= 1;
  }
  cursor.offset -= 1;
  document.sourceLength -= 1;
  document.preferredX = null;
  finishLayout(document, removedLines.length ? null : line);
  return { startLine: cursor.line, removedLines, addedLines: [] };
}

function positionInLine(document, line, x) {
  const text = line.text;
  const target = Math.max(0, Math.min(line.width, Number(x) || 0));
  if (!line.wideCount || line.wideCount === text.length) {
    const width = line.wideCount ? document.wideWidth : document.asciiWidth;
    const column = clamp(target / width + 0.5, text.length);
    return { column, wideCount: line.wideCount ? column : 0 };
  }
  // A click near either edge need not measure the entire mixed-width line.
  let column = target < line.width / 2 ? 0 : text.length;
  let wideCount = column ? line.wideCount : 0;
  let width = column ? line.width : 0;
  if (!column) {
    while (column < text.length) {
      const wide = isWideCharacter(text, column) ? 1 : 0;
      const nextWidth = widthOf(document, column + 1, wideCount + wide);
      if ((width + nextWidth) / 2 > target) break;
      column += 1;
      wideCount += wide;
      width = nextWidth;
    }
  } else {
    while (column) {
      const wide = isWideCharacter(text, column - 1) ? 1 : 0;
      const previousWidth = widthOf(document, column - 1, wideCount - wide);
      if ((width + previousWidth) / 2 <= target) break;
      column -= 1;
      wideCount -= wide;
      width = previousWidth;
    }
  }
  return { column, wideCount };
}

function positionCursor(document, targetLine, x) {
  const cursor = document.cursor;
  let start = cursor.offset - cursor.column;
  for (let index = cursor.line; index < targetLine; index += 1) start += document.lines[index].text.length + 1;
  for (let index = cursor.line; index > targetLine; index -= 1) start -= document.lines[index - 1].text.length + 1;
  const position = positionInLine(document, document.lines[targetLine], x);
  cursor.line = targetLine;
  cursor.column = position.column;
  cursor.wideCount = position.wideCount;
  cursor.offset = start + cursor.column;
  cursor.x = widthOf(document, cursor.column, cursor.wideCount);
  cursor.y = cursor.line * cursor.height;
}

export function moveCodeCursorToPoint(document, x, y) {
  const targetLine = clamp((Number(y) || 0) / document.cursor.height, document.lines.length - 1);
  positionCursor(document, targetLine, x);
  document.preferredX = null;
}

export function moveCodeCursor(document, direction) {
  const cursor = document.cursor;
  const line = document.lines[cursor.line];
  if (direction === 'up' || direction === 'down') {
    const targetLine = cursor.line + (direction === 'up' ? -1 : 1);
    if (targetLine < 0 || targetLine >= document.lines.length) return false;
    if (document.preferredX === null) document.preferredX = cursor.x;
    positionCursor(document, targetLine, document.preferredX);
    return true;
  }
  document.preferredX = null;
  if (direction === 'left' && cursor.offset) {
    if (cursor.column) {
      cursor.column -= 1;
      if (isWideCharacter(line.text, cursor.column)) cursor.wideCount -= 1;
    } else {
      cursor.line -= 1;
      const previous = document.lines[cursor.line];
      cursor.column = previous.text.length;
      cursor.wideCount = previous.wideCount;
    }
    cursor.offset -= 1;
  } else if (direction === 'right' && cursor.offset < document.sourceLength) {
    if (cursor.column < line.text.length) {
      if (isWideCharacter(line.text, cursor.column)) cursor.wideCount += 1;
      cursor.column += 1;
    } else {
      cursor.line += 1;
      cursor.column = 0;
      cursor.wideCount = 0;
    }
    cursor.offset += 1;
  } else {
    return false;
  }
  cursor.x = widthOf(document, cursor.column, cursor.wideCount);
  cursor.y = cursor.line * cursor.height;
  return true;
}

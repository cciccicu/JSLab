import { getPaletteColors } from './highlightPalette.js';
import { firstNonWhitespaceCode, INITIAL_LEXER_STATE, scanJavascriptLine } from './javascriptLexer.js';

const DEFAULT_MAX_HIGHLIGHT_TOKENS = 4096;
function tokenLimit(value) {
  return Math.min(DEFAULT_MAX_HIGHLIGHT_TOKENS,
    Math.max(1, Math.floor(Number(value) || DEFAULT_MAX_HIGHLIGHT_TOKENS)));
}

export function highlightJavascript(source, idPrefix, paletteId, maxTokens) {
  const code = String(source == null ? '' : source);
  const prefix = idPrefix || 'token';
  const colors = getPaletteColors(paletteId);
  const limit = tokenLimit(maxTokens);
  const texts = code.split('\n');
  const followingCodes = [];
  let nextCode = -1;
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    followingCodes[index] = nextCode;
    const first = firstNonWhitespaceCode(texts[index]);
    if (first !== -1) nextCode = first;
  }
  const tokens = [];
  let state = INITIAL_LEXER_STATE;
  function emit(type, text) {
    if (!text) return;
    const previous = tokens[tokens.length - 1];
    if (previous && previous.type === type) previous.text += text;
    else tokens.push({ id: prefix + '-' + tokens.length, type, text, color: colors[type] || colors.plain });
  }
  function plain() {
    return code ? [{ id: prefix + '-0', type: 'plain', text: code, color: colors.plain }] : [];
  }
  for (let index = 0; index < texts.length; index += 1) {
    const result = scanJavascriptLine(texts[index], state, index === 0, () => followingCodes[index], limit);
    if (!result) return plain();
    for (let tokenIndex = 0; tokenIndex < result.tokens.length; tokenIndex += 1) {
      const token = result.tokens[tokenIndex];
      emit(token.type, token.text);
      if (tokens.length > limit) return plain();
    }
    state = result.state;
    if (index < texts.length - 1) emit(result.newlineType, '\n');
    if (tokens.length > limit) return plain();
  }
  return tokens;
}

export function splitTokensIntoLines(tokens, idPrefix) {
  const prefix = idPrefix || 'code-line';
  const lines = [{ lineKey: prefix + '-0', index: 0, tokens: [] }];
  (tokens || []).forEach(token => {
    const parts = String(token.text == null ? '' : token.text).split('\n');
    for (let index = 0; index < parts.length; index += 1) {
      if (index) lines.push({ lineKey: prefix + '-' + lines.length, index: lines.length, tokens: [] });
      const line = lines[lines.length - 1];
      if (parts[index]) line.tokens.push({
        tokenKey: prefix + '-' + line.index + '-token-' + line.tokens.length,
        type: token.type, text: parts[index], color: token.color
      });
    }
  });
  return lines;
}

export function highlightJavascriptLines(source, idPrefix, paletteId, maxTokens) {
  const prefix = idPrefix || 'code-line';
  return splitTokensIntoLines(highlightJavascript(source, prefix + '-source', paletteId, maxTokens), prefix);
}

export function createHighlightState(paletteId, maxTokens) {
  return { paletteId, maxTokens, colors: getPaletteColors(paletteId), limit: tokenLimit(maxTokens),
    entries: new WeakMap(), document: null, tokenCount: 0 };
}

function firstCode(cache, line) {
  const entry = cache.entries.get(line);
  return entry && entry.text === line.text ? entry.firstCode : firstNonWhitespaceCode(line.text);
}
function followingCode(cache, lines, start) {
  for (let index = start; index < lines.length; index += 1) {
    const code = firstCode(cache, lines[index]);
    if (code !== -1) return code;
  }
  return -1;
}
function resetHighlight(cache) {
  cache.document = null;
  cache.entries = new WeakMap();
  cache.tokenCount = 0;
  return null;
}

// Propagate lexical state only as far as necessary. Go back to the preceding
// nonblank line too: its final identifier can become a call after a newline.
export function highlightCodeDocument(cache, document, change) {
  const initial = cache.document !== document;
  if (!initial && !change) return { initial: false, change: null, updates: [] };
  if (initial) resetHighlight(cache);
  const lines = document.lines;
  let start = initial ? 0 : change.startLine;
  const changedEnd = initial ? lines.length - 1 : change.startLine + change.addedLines.length;
  if (!initial) {
    for (let index = 0; index < change.removedLines.length; index += 1) {
      const removed = change.removedLines[index];
      const entry = cache.entries.get(removed);
      if (entry) cache.tokenCount -= entry.tokens.length;
      cache.entries.delete(removed);
    }
    let preceding = start - 1;
    while (preceding >= 0 && firstCode(cache, lines[preceding]) === -1) preceding -= 1;
    if (preceding >= 0) {
      const entry = cache.entries.get(lines[preceding]);
      if (entry.looksAhead && entry.followingIsCall !== (followingCode(cache, lines, preceding + 1) === 40)) start = preceding;
    }
  }
  let state = start ? cache.entries.get(lines[start - 1]).state : INITIAL_LEXER_STATE;
  const updates = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    const previous = cache.entries.get(line);
    if (index > changedEnd && previous && previous.startState === state &&
      previous.text === line.text && previous.firstLine === (index === 0)) break;
    const result = scanJavascriptLine(line.text, state, index === 0,
      () => followingCode(cache, lines, index + 1), cache.limit);
    if (!result) return resetHighlight(cache);
    const entry = { text: line.text, firstCode: firstNonWhitespaceCode(line.text),
      firstLine: index === 0, startState: state, state: result.state, tokens: result.tokens,
      looksAhead: result.looksAhead, followingIsCall: result.followingIsCall };
    cache.tokenCount += result.tokens.length - (previous ? previous.tokens.length : 0);
    if (initial && cache.tokenCount > cache.limit) return resetHighlight(cache);
    cache.entries.set(line, entry);
    updates.push({ index, lineKey: 'code-line-' + line.id, tokens: result.tokens });
    state = result.state;
  }
  // Bound rendered spans, including line fragments of multiline strings.
  if (cache.tokenCount > cache.limit) return resetHighlight(cache);
  cache.document = document;
  return { initial, change, updates, colors: cache.colors };
}

function viewToken(token, lineKey, index, colors) {
  return { tokenKey: lineKey + '-token-' + index, text: token.text, color: colors[token.type] || colors.plain };
}
function viewLine(update, colors) {
  return { lineKey: update.lineKey,
    tokens: update.tokens.map((token, index) => viewToken(token, update.lineKey, index, colors)) };
}
function spliceRows(target, start, removed, rows) {
  if (!rows.length) { target.splice(start, removed); return; }
  // Avoid argument-count/stack limits on large pasted text.
  for (let index = 0; index < rows.length; index += 64) {
    target.splice.apply(target, [start + index, index ? 0 : removed].concat(rows.slice(index, index + 64)));
  }
}

// Mutate leaf fields when the token count is unchanged, avoiding Vela list
// reconstruction on each keystroke. Cache records never enter the ViewModel.
export function commitHighlightedLines(previous, update) {
  if (update.initial) return update.updates.map(line => viewLine(line, update.colors));
  const change = update.change;
  if (!change) return previous;
  if (change.removedLines.length || change.addedLines.length) {
    const added = update.updates.filter(line => line.index > change.startLine &&
      line.index <= change.startLine + change.addedLines.length).map(line => viewLine(line, update.colors));
    spliceRows(previous, change.startLine + 1, change.removedLines.length, added);
  }
  for (let index = 0; index < update.updates.length; index += 1) {
    const next = update.updates[index];
    const line = previous[next.index];
    const common = Math.min(line.tokens.length, next.tokens.length);
    for (let tokenIndex = 0; tokenIndex < common; tokenIndex += 1) {
      const token = line.tokens[tokenIndex];
      const nextToken = next.tokens[tokenIndex];
      const color = update.colors[nextToken.type] || update.colors.plain;
      if (token.text !== nextToken.text) token.text = nextToken.text;
      if (token.color !== color) token.color = color;
    }
    if (line.tokens.length > next.tokens.length) line.tokens.splice(next.tokens.length);
    else if (line.tokens.length < next.tokens.length) {
      const added = next.tokens.slice(common).map((token, offset) => viewToken(token, line.lineKey, common + offset, update.colors));
      spliceRows(line.tokens, common, 0, added);
    }
  }
  return previous;
}

export default highlightJavascript;

const COLORS = {
  plain: '#F5F5F5',
  comment: '#6A9955',
  string: '#C3E88D',
  number: '#F78C6C',
  keyword: '#C792EA',
  literal: '#F78C6C',
  builtin: '#82AAFF',
  function: '#FFD866',
  operator: '#89DDFF'
};

const KEYWORDS = {
  break: true, case: true, catch: true, class: true, const: true, continue: true,
  debugger: true, default: true, delete: true, do: true, else: true, export: true,
  extends: true, finally: true, for: true, from: true, function: true, if: true,
  import: true, in: true, instanceof: true, let: true, new: true, of: true,
  return: true, static: true, super: true, switch: true, this: true, throw: true,
  try: true, typeof: true, var: true, void: true, while: true, with: true, yield: true
};

const LITERALS = { true: true, false: true, null: true, undefined: true };
const BUILTINS = {
  Array: true, Boolean: true, Date: true, Error: true, JSON: true, Math: true,
  Number: true, Object: true, Promise: true, RegExp: true, String: true,
  console: true, setInterval: true, setTimeout: true
};
const MAX_HIGHLIGHT_TOKENS = 220;

function stringQuoteForMode(mode) {
  if (mode === 'single-string') return '\'';
  if (mode === 'double-string') return '"';
  return '`';
}

function stringModeForQuote(quote) {
  if (quote === '\'') return 'single-string';
  if (quote === '"') return 'double-string';
  return 'template-string';
}

function isIdentifierStart(character) {
  return /[A-Za-z_$]/.test(character);
}

function isIdentifierCharacter(character) {
  return /[A-Za-z0-9_$]/.test(character);
}

function nextNonWhitespace(source, index) {
  while (index < source.length && /\s/.test(source[index])) index++;
  return source[index];
}

function addToken(tokens, type, text) {
  if (!text) return;
  const previous = tokens[tokens.length - 1];
  if (previous && previous.type === type) {
    previous.text += text;
    return;
  }
  tokens.push({ type, text, color: COLORS[type] });
}

function tokenizeJavascript(source, idPrefix) {
  const code = String(source || '');
  const prefix = idPrefix || 'token';
  const tokens = [];
  let index = 0;
  let mode = 'code';

  while (index < code.length) {
    const character = code[index];
    const nextCharacter = code[index + 1];

    if (mode === 'block-comment') {
      const end = code.indexOf('*/', index);
      const commentEnd = end === -1 ? code.length : end + 2;
      addToken(tokens, 'comment', code.slice(index, commentEnd));
      index = commentEnd;
      if (end !== -1) mode = 'code';
      continue;
    }

    if (mode !== 'code') {
      const quote = stringQuoteForMode(mode);
      const start = index;
      while (index < code.length) {
        if (code[index] === '\\') {
          index += Math.min(2, code.length - index);
          continue;
        }
        if (code[index] === quote) {
          index += 1;
          mode = 'code';
          break;
        }
        if (code[index] === '\n' && mode !== 'template-string') {
          index += 1;
          mode = 'code';
          break;
        }
        index += 1;
      }
      addToken(tokens, 'string', code.slice(start, index));
      continue;
    }

    if (character === '/' && nextCharacter === '/') {
      const end = code.indexOf('\n', index);
      const commentEnd = end === -1 ? code.length : end;
      addToken(tokens, 'comment', code.slice(index, commentEnd));
      index = commentEnd;
      continue;
    }

    if (character === '/' && nextCharacter === '*') {
      const end = code.indexOf('*/', index + 2);
      const commentEnd = end === -1 ? code.length : end + 2;
      addToken(tokens, 'comment', code.slice(index, commentEnd));
      index = commentEnd;
      if (end === -1) mode = 'block-comment';
      continue;
    }

    if (character === '\'' || character === '"' || character === '`') {
      mode = stringModeForQuote(character);
      const start = index;
      index += 1;
      while (index < code.length) {
        if (code[index] === '\\') {
          index += Math.min(2, code.length - index);
          continue;
        }
        if (code[index] === character) {
          index += 1;
          mode = 'code';
          break;
        }
        if (code[index] === '\n' && mode !== 'template-string') {
          index += 1;
          mode = 'code';
          break;
        }
        index += 1;
      }
      addToken(tokens, 'string', code.slice(start, index));
      continue;
    }

    if (/[0-9]/.test(character)) {
      const number = code.slice(index).match(/^(?:0[xX][\da-fA-F]+|\d*\.?\d+(?:[eE][+-]?\d+)?)/);
      addToken(tokens, 'number', number[0]);
      index += number[0].length;
      continue;
    }

    if (isIdentifierStart(character)) {
      let end = index + 1;
      while (end < code.length && isIdentifierCharacter(code[end])) end++;
      const identifier = code.slice(index, end);
      let type = 'plain';
      if (KEYWORDS[identifier]) type = 'keyword';
      else if (LITERALS[identifier]) type = 'literal';
      else if (BUILTINS[identifier]) type = 'builtin';
      else if (nextNonWhitespace(code, end) === '(') type = 'function';
      addToken(tokens, type, identifier);
      index = end;
      continue;
    }

    if (/[+\-*/%=!<>|&~?:]/.test(character)) {
      let end = index + 1;
      while (end < code.length && /[+\-*/%=!<>|&~?:]/.test(code[end])) end++;
      addToken(tokens, 'operator', code.slice(index, end));
      index = end;
      continue;
    }

    addToken(tokens, 'plain', character);
    index++;
  }

  const renderedTokens = tokens.length > MAX_HIGHLIGHT_TOKENS
    ? [{ type: 'plain', text: code, color: COLORS.plain }]
    : tokens;
  return renderedTokens.map((token, tokenIndex) => Object.assign({
      id: prefix + '-' + tokenIndex
    }, token));
}

export function highlightJavascript(source, idPrefix) {
  return tokenizeJavascript(source, idPrefix);
}

export default highlightJavascript;

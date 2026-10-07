import { getPaletteColors } from './highlightPalette.js';

const KEYWORDS = Object.assign(Object.create(null), {
  async: true, await: true, break: true, case: true, catch: true, class: true,
  const: true, continue: true, debugger: true, default: true, delete: true,
  do: true, else: true, enum: true, export: true, extends: true, finally: true,
  for: true, from: true, function: true, get: true, if: true, implements: true,
  import: true, in: true, instanceof: true, interface: true, let: true, new: true,
  of: true, package: true, private: true, protected: true, public: true,
  return: true, set: true, static: true, super: true, switch: true, this: true,
  throw: true, try: true, typeof: true, var: true, void: true, while: true,
  with: true, yield: true
});

const REGEX_PREFIX_KEYWORDS = Object.assign(Object.create(null), {
  await: true, case: true, delete: true, do: true, else: true, in: true,
  instanceof: true, new: true, of: true, return: true, throw: true,
  typeof: true, void: true, yield: true
});

const LITERALS = Object.assign(Object.create(null), {
  false: true, Infinity: true, NaN: true, null: true, true: true, undefined: true
});

const BUILTINS = Object.assign(Object.create(null), {
  Array: true, ArrayBuffer: true, BigInt: true, Boolean: true, Date: true,
  Error: true, Intl: true, JSON: true, Map: true, Math: true, Number: true,
  Object: true, Promise: true, Proxy: true, Reflect: true, RegExp: true,
  Set: true, String: true, Symbol: true, Uint8Array: true, WeakMap: true,
  WeakSet: true, clearInterval: true, clearTimeout: true, console: true,
  decodeURIComponent: true, encodeURIComponent: true, global: true, globalThis: true, ui: true, dialog: true, script: true, system: true,
  parseFloat: true, parseInt: true, setInterval: true, setTimeout: true
});

const DEFAULT_MAX_HIGHLIGHT_TOKENS = 4096;

function isDigitCode(code) {
  return code >= 48 && code <= 57;
}

function isHexCode(code) {
  return isDigitCode(code) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
}

function isIdentifierStartCode(code) {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) ||
    code === 36 || code === 95 || code >= 128;
}

function isIdentifierCode(code) {
  return isIdentifierStartCode(code) || isDigitCode(code);
}

function isWhitespaceCode(code) {
  return code === 9 || code === 10 || code === 11 || code === 12 ||
    code === 13 || code === 32 || code === 160 || code === 0x2028 || code === 0x2029;
}

function isOperatorCode(code) {
  return code === 33 || code === 37 || code === 38 || code === 42 ||
    code === 43 || code === 45 || code === 46 || code === 47 ||
    code === 58 || code === 60 || code === 61 || code === 62 ||
    code === 63 || code === 94 || code === 124 || code === 126;
}

function nextNonWhitespace(source, index) {
  while (index < source.length && isWhitespaceCode(source.charCodeAt(index))) index += 1;
  return source.charCodeAt(index);
}

function scanDigits(source, index, validDigit) {
  while (index < source.length) {
    const code = source.charCodeAt(index);
    if (code === 95 || validDigit(code)) index += 1;
    else break;
  }
  return index;
}

function scanNumber(source, start) {
  let index = start;
  const first = source.charCodeAt(index);
  const next = source.charCodeAt(index + 1);

  if (first === 48 && (next === 120 || next === 88)) {
    index = scanDigits(source, index + 2, isHexCode);
  } else if (first === 48 && (next === 98 || next === 66)) {
    index = scanDigits(source, index + 2, code => code === 48 || code === 49);
  } else if (first === 48 && (next === 111 || next === 79)) {
    index = scanDigits(source, index + 2, code => code >= 48 && code <= 55);
  } else {
    if (first === 46) index += 1;
    index = scanDigits(source, index, isDigitCode);
    if (source.charCodeAt(index) === 46) {
      index = scanDigits(source, index + 1, isDigitCode);
    }
    const exponent = source.charCodeAt(index);
    if (exponent === 69 || exponent === 101) {
      let exponentEnd = index + 1;
      const sign = source.charCodeAt(exponentEnd);
      if (sign === 43 || sign === 45) exponentEnd += 1;
      const digitStart = exponentEnd;
      exponentEnd = scanDigits(source, exponentEnd, isDigitCode);
      if (exponentEnd > digitStart) index = exponentEnd;
    }
  }

  if (source.charCodeAt(index) === 110) index += 1;
  return index;
}

function scanQuotedString(source, start, quoteCode, allowNewline) {
  let index = start + 1;
  while (index < source.length) {
    const code = source.charCodeAt(index);
    if (code === 92) {
      if (source.charCodeAt(index + 1) === 13 && source.charCodeAt(index + 2) === 10) index += 3;
      else index += Math.min(2, source.length - index);
    } else if (code === quoteCode) {
      return index + 1;
    } else if (!allowNewline && (code === 10 || code === 13 || code === 0x2028 || code === 0x2029)) {
      return index;
    } else {
      index += 1;
    }
  }
  return index;
}

function scanRegex(source, start) {
  let index = start + 1;
  let inCharacterClass = false;
  while (index < source.length) {
    const code = source.charCodeAt(index);
    if (code === 92) {
      index += Math.min(2, source.length - index);
    } else if (code === 10 || code === 13 || code === 0x2028 || code === 0x2029) {
      return start;
    } else if (code === 91) {
      inCharacterClass = true;
      index += 1;
    } else if (code === 93) {
      inCharacterClass = false;
      index += 1;
    } else if (code === 47 && !inCharacterClass) {
      index += 1;
      while (index < source.length && isIdentifierCode(source.charCodeAt(index))) index += 1;
      return index;
    } else {
      index += 1;
    }
  }
  return start;
}

function plainTokens(source, prefix, colors) {
  return source ? [{ id: prefix + '-0', type: 'plain', text: source, color: colors.plain }] : [];
}

function tokenizeJavascript(source, idPrefix, paletteId, maxTokens) {
  const code = String(source == null ? '' : source);
  const prefix = idPrefix || 'token';
  const colors = getPaletteColors(paletteId);
  const tokenLimit = Math.min(DEFAULT_MAX_HIGHLIGHT_TOKENS,
    Math.max(1, Math.floor(Number(maxTokens) || DEFAULT_MAX_HIGHLIGHT_TOKENS)));
  const tokens = [];
  let index = 0;
  let regexAllowed = true;

  function emit(type, start, end) {
    if (end <= start) return true;
    const previous = tokens[tokens.length - 1];
    if (previous && previous.type === type && previous.end === start) previous.end = end;
    else tokens.push({ type, start, end });
    return tokens.length <= tokenLimit;
  }

  while (index < code.length) {
    const start = index;
    const character = code.charCodeAt(index);
    const nextCharacter = code.charCodeAt(index + 1);

    if (index === 0 && character === 35 && nextCharacter === 33) {
      const end = code.indexOf('\n', index + 2);
      index = end === -1 ? code.length : end;
      if (!emit('comment', start, index)) return plainTokens(code, prefix, colors);
      continue;
    }

    if (isWhitespaceCode(character)) {
      index += 1;
      while (index < code.length && isWhitespaceCode(code.charCodeAt(index))) index += 1;
      if (!emit('plain', start, index)) return plainTokens(code, prefix, colors);
      continue;
    }

    if (character === 47 && nextCharacter === 47) {
      const end = code.indexOf('\n', index + 2);
      index = end === -1 ? code.length : end;
      if (!emit('comment', start, index)) return plainTokens(code, prefix, colors);
      continue;
    }

    if (character === 47 && nextCharacter === 42) {
      const end = code.indexOf('*/', index + 2);
      index = end === -1 ? code.length : end + 2;
      if (!emit('comment', start, index)) return plainTokens(code, prefix, colors);
      continue;
    }

    if (character === 39 || character === 34 || character === 96) {
      index = scanQuotedString(code, index, character, character === 96);
      if (!emit('string', start, index)) return plainTokens(code, prefix, colors);
      regexAllowed = false;
      continue;
    }

    if (isDigitCode(character) || (character === 46 && isDigitCode(nextCharacter))) {
      index = scanNumber(code, index);
      if (!emit('number', start, index)) return plainTokens(code, prefix, colors);
      regexAllowed = false;
      continue;
    }

    if (isIdentifierStartCode(character) && !isWhitespaceCode(character)) {
      index += 1;
      while (index < code.length && isIdentifierCode(code.charCodeAt(index)) &&
        !isWhitespaceCode(code.charCodeAt(index))) index += 1;
      const identifier = code.slice(start, index);
      let type = 'plain';
      if (KEYWORDS[identifier]) type = 'keyword';
      else if (LITERALS[identifier]) type = 'literal';
      else if (BUILTINS[identifier]) type = 'builtin';
      else if (nextNonWhitespace(code, index) === 40) type = 'function';
      if (!emit(type, start, index)) return plainTokens(code, prefix, colors);
      regexAllowed = !!REGEX_PREFIX_KEYWORDS[identifier];
      continue;
    }

    if (character === 47 && regexAllowed) {
      const regexEnd = scanRegex(code, index);
      if (regexEnd > index) {
        index = regexEnd;
        if (!emit('regex', start, index)) return plainTokens(code, prefix, colors);
        regexAllowed = false;
        continue;
      }
    }

    if (isOperatorCode(character)) {
      index += 1;
      while (index < code.length && isOperatorCode(code.charCodeAt(index))) {
        if (code.charCodeAt(index) === 47) break;
        index += 1;
      }
      const operator = code.slice(start, index);
      if (!emit('operator', start, index)) return plainTokens(code, prefix, colors);
      regexAllowed = operator !== '++' && operator !== '--';
      continue;
    }

    index += 1;
    if (!emit('plain', start, index)) return plainTokens(code, prefix, colors);
    if (character === 40 || character === 91 || character === 123 ||
      character === 44 || character === 59) regexAllowed = true;
    else if (character === 41 || character === 93 || character === 125) regexAllowed = false;
  }

  return tokens.map((token, tokenIndex) => ({
    id: prefix + '-' + tokenIndex,
    type: token.type,
    text: code.slice(token.start, token.end),
    color: colors[token.type] || colors.plain
  }));
}

export function highlightJavascript(source, idPrefix, paletteId, maxTokens) {
  return tokenizeJavascript(source, idPrefix, paletteId, maxTokens);
}

export function splitTokensIntoLines(tokens, idPrefix) {
  const prefix = idPrefix || 'code-line';
  const lines = [{ lineKey: prefix + '-0', index: 0, tokens: [] }];

  (tokens || []).forEach((token) => {
    const text = String(token.text == null ? '' : token.text);
    let fragmentStart = 0;
    let newline = text.indexOf('\n');
    while (newline !== -1) {
      if (newline > fragmentStart) {
        const line = lines[lines.length - 1];
        line.tokens.push({
          tokenKey: prefix + '-' + line.index + '-token-' + line.tokens.length,
          type: token.type,
          text: text.slice(fragmentStart, newline),
          color: token.color
        });
      }
      const lineIndex = lines.length;
      lines.push({ lineKey: prefix + '-' + lineIndex, index: lineIndex, tokens: [] });
      fragmentStart = newline + 1;
      newline = text.indexOf('\n', fragmentStart);
    }
    if (fragmentStart < text.length) {
      const line = lines[lines.length - 1];
      line.tokens.push({
        tokenKey: prefix + '-' + line.index + '-token-' + line.tokens.length,
        type: token.type,
        text: text.slice(fragmentStart),
        color: token.color
      });
    }
  });

  return lines;
}

export function highlightJavascriptLines(source, idPrefix, paletteId, maxTokens) {
  const prefix = idPrefix || 'code-line';
  return splitTokensIntoLines(tokenizeJavascript(source, prefix + '-source', paletteId, maxTokens), prefix);
}

export default highlightJavascript;

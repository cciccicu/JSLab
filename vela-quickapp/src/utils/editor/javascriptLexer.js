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
  decodeURIComponent: true, encodeURIComponent: true, global: true, globalThis: true,
  ui: true, dialog: true, script: true, system: true,
  parseFloat: true, parseInt: true, setInterval: true, setTimeout: true
});

// Low bit: a regex may follow. Remaining bits: 0 = code, 1 = block comment,
// otherwise the quote character of a continued string/template literal.
export const INITIAL_LEXER_STATE = 1;

function isDigit(code) { return code >= 48 && code <= 57; }
function isIdentifierStart(code) {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 36 || code === 95 || code >= 128;
}
function isIdentifier(code) { return isIdentifierStart(code) || isDigit(code); }
function isWhitespace(code) {
  return code === 9 || code === 10 || code === 11 || code === 12 ||
    code === 13 || code === 32 || code === 160 || code === 0x2028 || code === 0x2029;
}
function isLineBreak(code) { return code === 10 || code === 13 || code === 0x2028 || code === 0x2029; }
function isOperator(code) {
  return code === 33 || code === 37 || code === 38 || code === 42 ||
    code === 43 || code === 45 || code === 46 || code === 47 ||
    code === 58 || code === 60 || code === 61 || code === 62 ||
    code === 63 || code === 94 || code === 124 || code === 126;
}
export function firstNonWhitespaceCode(source, start = 0) {
  let index = start;
  while (index < source.length && isWhitespace(source.charCodeAt(index))) index += 1;
  return index < source.length ? source.charCodeAt(index) : -1;
}

function scanDigits(source, index, radix = 10) {
  const digitEnd = 48 + Math.min(radix, 10);
  while (index < source.length) {
    const code = source.charCodeAt(index);
    if (code === 95 || (code >= 48 && code < digitEnd) ||
      (radix === 16 && ((code >= 65 && code <= 70) || (code >= 97 && code <= 102)))) index += 1;
    else break;
  }
  return index;
}
function scanNumber(source, start) {
  let index = start;
  const first = source.charCodeAt(index);
  const next = source.charCodeAt(index + 1);
  if (first === 48 && (next === 120 || next === 88)) index = scanDigits(source, index + 2, 16);
  else if (first === 48 && (next === 98 || next === 66)) index = scanDigits(source, index + 2, 2);
  else if (first === 48 && (next === 111 || next === 79)) index = scanDigits(source, index + 2, 8);
  else {
    if (first === 46) index += 1;
    index = scanDigits(source, index);
    if (source.charCodeAt(index) === 46) index = scanDigits(source, index + 1);
    const exponent = source.charCodeAt(index);
    if (exponent === 69 || exponent === 101) {
      let end = index + 1;
      const sign = source.charCodeAt(end);
      if (sign === 43 || sign === 45) end += 1;
      const digitStart = end;
      end = scanDigits(source, end);
      if (end > digitStart) index = end;
    }
  }
  return source.charCodeAt(index) === 110 ? index + 1 : index;
}

function scanString(source, start, quote) {
  let index = start;
  while (index < source.length) {
    const code = source.charCodeAt(index);
    if (code === 92) {
      if (index + 1 === source.length ||
        (source.charCodeAt(index + 1) === 13 && index + 2 === source.length)) {
        return { end: source.length, mode: quote };
      }
      index += 2;
    } else if (code === quote) {
      return { end: index + 1, mode: 0 };
    } else if (quote !== 96 && isLineBreak(code)) {
      return { end: index, mode: 0 };
    } else {
      index += 1;
    }
  }
  return { end: index, mode: quote === 96 ? quote : 0 };
}
function scanRegex(source, start) {
  let index = start + 1;
  let inCharacterClass = false;
  while (index < source.length) {
    const code = source.charCodeAt(index);
    if (code === 92) {
      if (isLineBreak(source.charCodeAt(index + 1))) return start;
      index += Math.min(2, source.length - index);
    } else if (isLineBreak(code)) {
      return start;
    } else if (code === 91) {
      inCharacterClass = true;
      index += 1;
    } else if (code === 93) {
      inCharacterClass = false;
      index += 1;
    } else if (code === 47 && !inCharacterClass) {
      index += 1;
      while (index < source.length && isIdentifier(source.charCodeAt(index)) &&
        !isWhitespace(source.charCodeAt(index))) index += 1;
      return index;
    } else {
      index += 1;
    }
  }
  return start;
}

// Input is one physical line without LF. Templates retain the existing simple
// string coloring; this is a tolerant highlighter, not a JavaScript parser.
export function scanJavascriptLine(code, initialState, firstLine, followingCode, tokenLimit) {
  const tokens = [];
  let index = 0;
  let mode = initialState >> 1;
  let regexAllowed = !!(initialState & 1);
  let looksAhead = false;
  let followingIsCall = false;
  function emit(type, start, end) {
    if (end <= start) return true;
    const previous = tokens[tokens.length - 1];
    if (previous && previous.type === type) previous.end = end;
    else tokens.push({ type, start, end });
    return tokens.length <= tokenLimit;
  }
  // An empty continuation line can terminate an escaped single/double string.
  if (!code.length && mode > 1 && mode !== 96) mode = 0;
  while (index < code.length) {
    const start = index;
    const character = code.charCodeAt(index);
    const nextCharacter = code.charCodeAt(index + 1);
    if (mode === 1 || (character === 47 && nextCharacter === 42 && !mode)) {
      const end = code.indexOf('*/', index + (mode === 1 ? 0 : 2));
      index = end === -1 ? code.length : end + 2;
      mode = end === -1 ? 1 : 0;
      if (!emit('comment', start, index)) return null;
      continue;
    }
    if (mode > 1 || character === 39 || character === 34 || character === 96) {
      const result = scanString(code, mode ? index : index + 1, mode || character);
      index = result.end;
      mode = result.mode;
      regexAllowed = false;
      if (!emit('string', start, index)) return null;
      continue;
    }
    if ((firstLine && !index && character === 35 && nextCharacter === 33) ||
      (character === 47 && nextCharacter === 47)) {
      if (!emit('comment', start, code.length)) return null;
      index = code.length;
      continue;
    }
    if (isWhitespace(character)) {
      index += 1;
      while (index < code.length && isWhitespace(code.charCodeAt(index))) index += 1;
      if (!emit('plain', start, index)) return null;
      continue;
    }
    if (isDigit(character) || (character === 46 && isDigit(nextCharacter))) {
      index = scanNumber(code, index);
      if (!emit('number', start, index)) return null;
      regexAllowed = false;
      continue;
    }
    if (isIdentifierStart(character)) {
      index += 1;
      while (index < code.length && isIdentifier(code.charCodeAt(index)) && !isWhitespace(code.charCodeAt(index))) index += 1;
      const identifier = code.slice(start, index);
      let type = 'plain';
      if (KEYWORDS[identifier]) type = 'keyword';
      else if (LITERALS[identifier]) type = 'literal';
      else if (BUILTINS[identifier]) type = 'builtin';
      else {
        let next = firstNonWhitespaceCode(code, index);
        if (next === -1) {
          next = followingCode();
          looksAhead = true;
          followingIsCall = next === 40;
        }
        if (next === 40) type = 'function';
      }
      if (!emit(type, start, index)) return null;
      regexAllowed = !!REGEX_PREFIX_KEYWORDS[identifier];
      continue;
    }
    if (character === 47 && regexAllowed) {
      const end = scanRegex(code, index);
      if (end > index) {
        index = end;
        if (!emit('regex', start, index)) return null;
        regexAllowed = false;
        continue;
      }
    }
    if (isOperator(character)) {
      index += 1;
      while (index < code.length && isOperator(code.charCodeAt(index)) && code.charCodeAt(index) !== 47) index += 1;
      const operator = code.slice(start, index);
      if (!emit('operator', start, index)) return null;
      regexAllowed = operator !== '++' && operator !== '--';
      continue;
    }
    index += 1;
    if (!emit('plain', start, index)) return null;
    if (character === 40 || character === 91 || character === 123 || character === 44 || character === 59) regexAllowed = true;
    else if (character === 41 || character === 93 || character === 125) regexAllowed = false;
  }
  return {
    looksAhead,
    followingIsCall,
    state: (mode << 1) | (regexAllowed ? 1 : 0),
    newlineType: mode === 1 ? 'comment' : mode > 1 ? 'string' : 'plain',
    tokens: tokens.map(token => ({ type: token.type, text: code.slice(token.start, token.end) }))
  };
}

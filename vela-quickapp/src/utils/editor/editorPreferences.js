export const DEFAULT_FONT_SIZE = 16;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 48;
export const DEFAULT_HIGHLIGHT_ENABLED = false;
export const DEFAULT_HIGHLIGHT_CHAR_THRESHOLD = 2048;
export const DEFAULT_HIGHLIGHT_LINE_THRESHOLD = 80;
export const MIN_HIGHLIGHT_CHAR_THRESHOLD = 512;
export const MAX_HIGHLIGHT_CHAR_THRESHOLD = 100000;
export const MIN_HIGHLIGHT_LINE_THRESHOLD = 40;
export const MAX_HIGHLIGHT_LINE_THRESHOLD = 2000;

function parseFontSize(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return NaN;
  return Number(value);
}

export function normalizeFontSize(value, fallback = DEFAULT_FONT_SIZE) {
  let size = parseFontSize(value);
  if (!isFinite(size)) size = parseFontSize(fallback);
  if (!isFinite(size)) size = DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
}

function normalizeHighlightThreshold(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (isNaN(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

export function normalizeHighlightCharThreshold(value, fallback = DEFAULT_HIGHLIGHT_CHAR_THRESHOLD) {
  return normalizeHighlightThreshold(value, fallback, MIN_HIGHLIGHT_CHAR_THRESHOLD, MAX_HIGHLIGHT_CHAR_THRESHOLD);
}

export function normalizeHighlightLineThreshold(value, fallback = DEFAULT_HIGHLIGHT_LINE_THRESHOLD) {
  return normalizeHighlightThreshold(value, fallback, MIN_HIGHLIGHT_LINE_THRESHOLD, MAX_HIGHLIGHT_LINE_THRESHOLD);
}

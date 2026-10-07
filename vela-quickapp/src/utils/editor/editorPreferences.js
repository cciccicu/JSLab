import configManager from '../core/configManager.js';

export const DEFAULT_FONT_SIZE = 16;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 48;

export const EDITOR_VERSIONS = [
  { id: 'v0', label: 'v0 · 1.1.2', route: 'editorV0', supportsFontSize: false, supportsHighlight: false, supportsCustomFont: false },
  { id: 'v1', label: 'v1 · 1.2.3', route: 'editorV1', supportsFontSize: true, supportsHighlight: false, supportsCustomFont: false },
  { id: 'v2', label: 'v2 · 当前版本', route: 'editor', supportsFontSize: true, supportsHighlight: true, supportsCustomFont: true }
];
const DEFAULT_EDITOR_INFO = EDITOR_VERSIONS[2];
export const DEFAULT_EDITOR_VERSION = DEFAULT_EDITOR_INFO.id;

export function getEditorVersionInfo(value) {
  for (let index = 0; index < EDITOR_VERSIONS.length; index += 1) {
    if (EDITOR_VERSIONS[index].id === value) return EDITOR_VERSIONS[index];
  }
  return DEFAULT_EDITOR_INFO;
}

export function getEditorRoute(version) {
  return getEditorVersionInfo(version).route;
}

export function getConfiguredEditorRoute() {
  return configManager.get('editor.version', DEFAULT_EDITOR_VERSION).then(getEditorRoute);
}

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

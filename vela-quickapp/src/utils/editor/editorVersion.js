import configManager from '../core/configManager.js';

export const DEFAULT_EDITOR_VERSION = 'v2';

export function normalizeEditorVersion(value) {
  return value === 'v0' || value === 'v1' || value === 'v2' ? value : DEFAULT_EDITOR_VERSION;
}

export function getEditorRoute(version) {
  const normalized = normalizeEditorVersion(version);
  if (normalized === 'v0') return 'editorV0';
  if (normalized === 'v1') return 'editorV1';
  return 'editor';
}

export function getConfiguredEditorRoute() {
  return configManager.get('editor.version', DEFAULT_EDITOR_VERSION)
    .then(value => getEditorRoute(value));
}

export default { DEFAULT_EDITOR_VERSION, normalizeEditorVersion, getEditorRoute, getConfiguredEditorRoute };

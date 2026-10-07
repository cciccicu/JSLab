import router from '@system.router';

// Canonical route names. Physical src/pages directories are implementation details.
const ROUTES = {
  index: '/',
  editor: '/workspace/editor',
  editorV0: '/workspace/editor/v0',
  editorV1: '/workspace/editor/v1',
  aiGenerate: '/workspace/ai-generate',
  run: '/workspace/run',
  newFile: '/workspace/new',
  settings: '/settings',
  settingsEditor: '/settings/editor',
  settingsFonts: '/settings/editor/fonts',
  settingsHighlight: '/settings/editor/highlight',
  settingsAbout: '/settings/about',
  settingsHelp: '/settings/help',
  settingsCloud: '/settings/cloud',
  settingsCloudFiles: '/settings/cloud/files',
  toolsMarket: '/tools/market',
  toolsMarketUpload: '/tools/market/upload',
  toolsMoney: '/tools/money',
  overlayConfirm: '/overlay/confirm',
  overlaySelect: '/overlay/select',
  overlayNumberInput: '/overlay/number-input',
  overlayTextInput: '/overlay/text-input'
};

function normalizePath(route) {
  const value = route.trim().replace(/\\/g, '/');
  if (!value || value === '/') return '/';
  if (value.indexOf('://') !== -1) return value;
  const path = ((value.charAt(0) === '/' ? value : '/' + value).replace(/\/+/g, '/').replace(/\/+$/, '')) || '/';
  if (path === '/') return ROUTES.index;
  if (path.split('/').some(segment => segment === '..' || segment === '.')) {
    throw new Error('非法页面路径：' + route);
  }
  if (!/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path)) {
    throw new Error('页面 slug 只能包含字母、数字、下划线和连字符：' + route);
  }
  return path;
}

export function resolveRoute(route) {
  if (typeof route !== 'string') return ROUTES.index;
  const key = route.trim();
  if (Object.prototype.hasOwnProperty.call(ROUTES, key)) return ROUTES[key];
  return normalizePath(key);
}

export function push(route, params) {
  const options = { uri: resolveRoute(route) };
  if (params) options.params = params;
  router.push(options);
}

export function back() {
  router.back();
}

export function replace(route, params) {
  const options = { uri: resolveRoute(route) };
  if (params) options.params = params;
  router.replace(options);
}

export default {
  resolveRoute,
  push,
  replace,
  back
};

import router from '@system.router';

// Canonical route names. Physical src/pages directories are implementation details.
const ROUTES = {
  index: '/',
  editor: '/workspace/editor',
  runConsole: '/workspace/run-console',
  runUi: '/workspace/run-ui',
  newFile: '/workspace/new',
  settings: '/settings',
  settingsAbout: '/settings/about',
  settingsHelp: '/settings/help',
  toolsMarket: '/tools/market',
  toolsMoney: '/tools/money',
  overlayConfirm: '/overlay/confirm',
  overlaySelect: '/overlay/select',
  overlayNumberInput: '/overlay/number-input'
};

function normalizePath(route) {
  const value = route.trim().replace(/\\/g, '/');
  if (!value || value === '/') return '/';
  if (value.indexOf('://') !== -1) return value;
  const path = value.charAt(0) === '/' ? value : '/' + value;
  if (path.split('/').some(segment => segment === '..' || segment === '.')) {
    throw new Error('非法页面路径：' + route);
  }
  if (!/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path)) {
    throw new Error('页面 slug 只能包含字母、数字、下划线和连字符：' + route);
  }
  return path.replace(/\/+/g, '/');
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

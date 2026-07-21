import router from '@system.router';

// Keep page names in one place. Existing callers may use either a page key or
// a complete Vela URI, which makes route refactors possible without UI edits.
const ROUTES = {
  home: '/pages/index',
  index: '/pages/index',
  add: '/pages/add',
  edit: '/pages/edit',
  run: '/pages/run',
  setting: '/pages/setting',
  about: '/pages/about',
  help: '/pages/help',
  market: '/pages/market',
  money: '/pages/money',
  confirm: '/pages/confirm',
  select: '/pages/select',
  numberInput: '/pages/number-input'
};

export function resolveRoute(route) {
  if (typeof route !== 'string') return ROUTES.home;
  return ROUTES[route] || route;
}

export function push(route, params) {
  const options = { uri: resolveRoute(route) };
  if (params) options.params = params;
  router.push(options);
}

export function back() {
  router.back();
}

export default {
  resolveRoute,
  push,
  back
};

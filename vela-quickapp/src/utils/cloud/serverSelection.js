import { IS_COMMUNITY_EDITION } from '../core/edition.js';
import { back } from '../core/routeManager.js';
import { showToast } from '../core/uiFeedback.js';

export const OFFICIAL_ORIGIN = 'http://jslab-api.ccicc.icu';
const PREVIOUS_OFFICIAL_ORIGIN = 'https://jslab-api.ccicc.icu';

function normalizeOfficialOrigin(url) {
  return url === PREVIOUS_OFFICIAL_ORIGIN ? OFFICIAL_ORIGIN : url;
}

export function normalizeServerUrl(value) {
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/?#@]+(?:\/[^\s?#]*)?$/i.test(url)) return '';
  return url;
}

export function selectedServer(owner) {
  const configManager = owner.$app.$def.getConfigManager();
  if (!IS_COMMUNITY_EDITION) return configManager.get('cloud.origin', OFFICIAL_ORIGIN);
  return Promise.all([
    configManager.get('cloud.communityServerChosen', false),
    configManager.get('cloud.origin', '')
  ]).then(values => values[0] ? normalizeOfficialOrigin(values[1]) : '');
}

function saveServer(owner, url) {
  const configManager = owner.$app.$def.getConfigManager();
  return configManager.get('cloud.origin', '').then(previous => {
    const oldUrl = normalizeOfficialOrigin(previous || OFFICIAL_ORIGIN);
    const clearToken = oldUrl !== url ? configManager.set('cloud.token', '') : Promise.resolve();
    return clearToken.then(() => configManager.set('cloud.origin', url))
      .then(() => configManager.set('cloud.communityServerChosen', true));
  });
}

export function chooseServer(owner, force) {
  if (!IS_COMMUNITY_EDITION) return Promise.resolve(true);
  return selectedServer(owner).then(current => {
    if (current && !force) return true;
    return owner.$app.$def.openDialog('select', {
      title: '选择服务器',
      message: 'JS 市场、云空间和 AI 将使用同一服务器。',
      items: [
        { label: '官方服务器', value: 'official' },
        { label: '第三方服务器', value: 'custom' }
      ],
      value: current === OFFICIAL_ORIGIN ? 'official' : undefined
    }, owner).then(choice => {
      if (choice.action !== 'confirm') return false;
      if (choice.value === 'official') return saveServer(owner, OFFICIAL_ORIGIN).then(() => true);
      return owner.$app.$def.openDialog('text', {
        title: '服务器地址',
        message: '第三方服务器会处理脚本与账户数据，请输入可信的 HTTPS 地址。',
        value: current && current !== OFFICIAL_ORIGIN ? current : 'https://',
        maxLength: 256,
        required: true
      }, owner).then(result => {
        if (result.action !== 'confirm') return false;
        const url = normalizeServerUrl(result.value);
        if (!url) {
          return owner.$app.$def.openDialog('alert', {
            title: '地址无效',
            message: '请输入完整的 HTTPS 地址，例如 https://example.com/jslab-cloud。',
            confirmText: '知道了'
          }, owner).then(() => false);
        }
        return saveServer(owner, url).then(() => true);
      });
    });
  });
}

export function enterNetworkPage(owner, continueToPage) {
  chooseServer(owner).then(selected => {
    if (!owner.pageActive) return;
    if (selected) continueToPage();
    else back();
  }).catch(error => {
    if (!owner.pageActive) return;
    showToast(error && error.message ? error.message : '无法保存服务器地址');
    back();
  });
}

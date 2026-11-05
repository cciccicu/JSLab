import { SCREEN } from '../core/screen.js';

export const MARKET_DEVICES = [{ label: 'Pro', value: 'pro' }, { label: 'RW', value: 'rw' }];
export function marketDevices(value) {
  if (value == null || value === '') return ['pro'];
  let values = value;
  if (typeof values === 'string') {
    try { values = JSON.parse(values); } catch (_) { return []; }
  }
  return Array.isArray(values) ? MARKET_DEVICES.filter(item => values.indexOf(item.value) >= 0).map(item => item.value) : [];
}
export function marketDeviceLabel(value) {
  return marketDevices(value).map(id => id === 'rw' ? 'RW' : 'Pro').join(' / ');
}
export function confirmMarketDownload(page, script) {
  const current = SCREEN.id === 'bandpro' ? 'pro' : 'rw';
  if (marketDevices(script.supportedDevices).indexOf(current) >= 0) return Promise.resolve(true);
  return page.$app.$def.openDialog('confirm', {
    title: '设备适配提醒',
    message: '作者声明适配：' + (marketDeviceLabel(script.supportedDevices) || '未知') + '。当前设备为 ' + (current === 'rw' ? 'RW' : 'Pro') + '，可能无法正常运行，仍要下载吗？',
    confirmText: '继续下载', cancelText: '取消'
  }, page).then(result => page.pageActive && result.action === 'confirm');
}

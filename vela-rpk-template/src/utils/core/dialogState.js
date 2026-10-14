import { push, back } from './routeManager.js';
import { DIALOG_LIMITS } from '../runtime/runtimeContract.js';

// Import only from app.ux: each native page bundle has its own module instance.
// Pages access these functions through this.$app.$def, keeping one app-owned
// request and keeping functions/ownership outside Vela's reactive page data.
let current = null;
let sequence = 0;
const routes = { alert: 'overlayConfirm', confirm: 'overlayConfirm', text: 'overlayTextInput', number: 'overlayNumberInput', select: 'overlaySelect' };
function failure(code, message) { const error = new Error(message); error.code = code; return error; }
function validValue(value) { return typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && isFinite(value)); }
function integer(value, fallback, max) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !isFinite(value) || value < 0 || value > max || Math.floor(value) !== value) throw failure('DIALOG_INVALID', '数量参数无效');
  return value;
}
function normalize(type, source) {
  if (!routes[type] || (source != null && (typeof source !== 'object' || Array.isArray(source)))) throw failure('DIALOG_INVALID', '对话框参数无效');
  const o = source || {};
  const data = { id: 'dialog-' + (++sequence), type,
    title: String(o.title || ({ alert: '提示', confirm: '确认', text: '文本输入', number: '数字输入', select: '选择' })[type]).slice(0, 80),
    message: String(o.message || '').slice(0, 4000), confirmText: String(o.confirmText || '确认').slice(0, 16),
    cancelText: String(o.cancelText || '取消').slice(0, 16), secondaryText: type === 'confirm' ? String(o.secondaryText || '').slice(0, 16) : '', required: o.required === true };
  if (type === 'text') {
    data.value = o.value == null ? '' : String(o.value);
    data.placeholder = String(o.placeholder || '请输入内容').slice(0, 80);
    data.language = o.language === 'cn' ? 'cn' : 'en';
    data.maxLength = integer(o.maxLength, 64, DIALOG_LIMITS.textCharacters);
    data.minLength = integer(o.minLength, data.required ? 1 : 0, data.maxLength);
    if (data.minLength > data.maxLength) throw failure('DIALOG_INVALID', '最小长度超过最大长度');
    if (data.value.length > data.maxLength) throw failure('DIALOG_INVALID', '初始文本超过最大长度');
  }
  if (type === 'number') {
    ['min', 'max'].forEach(key => { if (o[key] !== undefined) { if (typeof o[key] !== 'number' || !isFinite(o[key])) throw failure('DIALOG_INVALID', '数值范围无效'); data[key] = o[key]; } });
    if (data.min !== undefined && data.max !== undefined && data.min > data.max) throw failure('DIALOG_INVALID', '数值范围无效');
    data.decimals = integer(o.decimals, 6, 10);
    if (o.value != null && (typeof o.value !== 'number' || !isFinite(o.value) || Math.abs(o.value) >= 1e15)) throw failure('DIALOG_INVALID', '初始数字无效');
    data.value = o.value == null ? '' : String(o.value);
    // Expand JS's exponent notation without rounding the initial number.
    if (data.value && /e/i.test(data.value)) {
      const parts = data.value.toLowerCase().split('e');
      const negative = parts[0].charAt(0) === '-';
      const mantissa = parts[0].replace('-', '');
      const digits = mantissa.replace('.', '');
      const point = (mantissa.indexOf('.') < 0 ? mantissa.length : mantissa.indexOf('.')) + Number(parts[1]);
      if (point <= -10 || point > 15) throw failure('DIALOG_INVALID', '初始数字超过精度限制');
      data.value = (negative ? '-' : '') + (point <= 0 ? '0.' + new Array(1 - point).join('0') + digits : point >= digits.length ? digits + new Array(point - digits.length + 1).join('0') : digits.slice(0, point) + '.' + digits.slice(point));
    }
    if ((data.value.split('.')[1] || '').length > data.decimals || (o.value != null && ((data.min !== undefined && o.value < data.min) || (data.max !== undefined && o.value > data.max)))) throw failure('DIALOG_INVALID', '初始数字超出范围或精度');
  }
  if (type === 'select') {
    if (!Array.isArray(o.items) || o.items.length > DIALOG_LIMITS.items) throw failure('DIALOG_INVALID', '选项必须是数组，最多 100 项');
    const values = [];
    data.items = o.items.map((item, index) => {
      if (!item || typeof item !== 'object' || !validValue(item.value) || values.indexOf(item.value) >= 0 || typeof item.label !== 'string' || !item.label) throw failure('DIALOG_INVALID', '选项需要唯一有效值和标签');
      values.push(item.value);
      return { id: 'item-' + index, label: item.label.slice(0, 80), value: item.value, description: String(item.description || '').slice(0, 240), disabled: item.disabled === true };
    });
    data.multiple = o.multiple === true;
    data.minSelected = integer(o.minSelected, data.multiple ? 0 : 1, DIALOG_LIMITS.items);
    data.maxSelected = integer(o.maxSelected, data.multiple ? DIALOG_LIMITS.items : 1, DIALOG_LIMITS.items);
    if (data.minSelected > data.maxSelected || (!data.multiple && (data.minSelected !== 1 || data.maxSelected !== 1))) throw failure('DIALOG_INVALID', '选择数量范围无效');
    data.value = data.multiple ? (o.value === undefined ? [] : o.value) : o.value;
    const selected = data.multiple ? data.value : (data.value === undefined ? [] : [data.value]);
    if (!Array.isArray(selected) || selected.some((v, i) => selected.indexOf(v) !== i || !data.items.some(item => item.value === v && !item.disabled))) throw failure('DIALOG_INVALID', '初始选择无效');
    if (selected.length > data.maxSelected) throw failure('DIALOG_INVALID', '初始选择数量超过上限');
  }
  return data;
}
export function openDialog(type, options, owner) {
  return new Promise((resolve, reject) => {
    if (current) { reject(failure('DIALOG_BUSY', '已有对话框正在显示')); return; }
    let data;
    try { data = normalize(type, options); } catch (error) { reject(error); return; }
    current = { data, owner, resolve, result: null };
    try { push(routes[type], { dialogId: data.id }); } catch (_) { current = null; reject(failure('DIALOG_OPEN_FAILED', '无法打开对话框')); }
  });
}
export function getDialog(type, id) {
  return current && current.data.id === id && (current.data.type === type || (type === 'confirm' && current.data.type === 'alert')) ? current.data : null;
}
export function settleDialog(data, action, value) {
  if (!current || current.data.id !== data.id || current.result) return false;
  current.result = { action, value: action !== 'confirm' || data.type === 'confirm' || data.type === 'alert' ? null : value };
  return true;
}
export function deliverDialog(owner) {
  if (!current || current.owner !== owner || !current.result) return false;
  const request = current; current = null; request.resolve(request.result);
  return true;
}
export function cancelOwnedDialog(owner) {
  if (!current || current.owner !== owner) return;
  const request = current; current = null; request.resolve({ action: 'cancel', value: null });
}
export function closeOwnedDialog(owner) {
  if (!current || current.owner !== owner) return false;
  if (!current.result) {
    current.result = { action: 'cancel', value: null };
    try { back(); } catch (error) { current.result = null; throw error; }
  }
  return true;
}
export function dialogDestroyed(data) {
  if (current && current.data.id === data.id && !current.result) current.result = { action: 'cancel', value: null };
}

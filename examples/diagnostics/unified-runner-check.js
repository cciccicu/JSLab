// Run on the physical device as an ordinary .js file. No auto exit/reload.
const instance = Math.floor(Math.random() * 1000000);
const count = ui.signal(0);
const full = ui.signal(false);
console.log('统一运行器实机检查，实例', instance);
ui.setTitle('实机检查');

async function dialogs() {
  console.log('开始连续对话框，实例', instance);
  const number = await dialog.number({ title: '负数与小数', message: '初值必须保持 -2.5', value: -2.5, min: -20, max: 50, decimals: 1 });
  console.log('数字', number.action, number.value);
  const choices = await dialog.select({ title: '多选', multiple: true, minSelected: 1, maxSelected: 2,
    items: [{ label: '零', value: 0 }, { label: '否', value: false }, { label: '文本', value: 'text' }, { label: '禁用', value: 'disabled', disabled: true, description: '不能选择' }] });
  console.log('多选', choices.action, choices.value);
  const single = await dialog.select({ title: '单选原始值', value: false,
    items: [{ label: '数字零', value: 0 }, { label: '布尔否', value: false }] });
  console.log('单选', single.action, single.value, typeof single.value);
  const text = await dialog.text({ title: '长文本', message: '可移动编辑位置，字数应为 4000', value: new Array(1001).join('长文本。'), maxLength: 8000, language: 'cn' });
  console.log('文本', text.action, text.value === null ? null : text.value.length);
  const save = await dialog.confirm({ title: '保存修改？', message: '检查三个独立动作', confirmText: '保存', secondaryText: '不保存', cancelText: '继续编辑' });
  console.log('确认', save.action, save.value);
  const info = await dialog.alert({ title: '检查完成', message: '关闭后仍是同一个实例：' + instance });
  console.log('提示', info.action);
  ui.hide();
}
function hideAndUpdate() {
  ui.hide();
  console.log('已隐藏。稍后轻点日志，应显示更新后的计数，实例仍为', instance);
  setTimeout(() => { count.update(n => n + 1); console.log('隐藏期间已更新', count.get()); }, 1000);
}
function fullscreen() { full.set(!full.get()); ui.showHeader(!full.get()); }
function navigateFromDialog(action) {
  console.log('将在对话框期间执行', action, '实例', instance);
  setTimeout(() => action === 'reload' ? script.reload() : script.exit(), 2000);
  return dialog.alert({ title: '对话框中导航', message: '保持本框打开，两秒后执行 ' + action + '，检查没有遗留旧运行页。' });
}
ui.render(() => [
  ui.text('实例 ' + instance + ' · 计数 ' + count.get(), { lines: 1, size: 23 }),
  ui.button('增加并记录日志', () => { count.update(n => n + 1); console.log('计数', count.get()); }, { id: 'add' }),
  ui.button('隐藏期间更新', hideAndUpdate, { id: 'hide' }),
  ui.button('连续对话框', dialogs, { id: 'dialogs' }),
  ui.button(full.get() ? '恢复顶栏' : '全屏', fullscreen, { id: 'fullscreen' }),
  ui.button('此按钮禁用', () => console.error('错误：禁用回调被触发'), { id: 'disabled', disabled: true }),
  ui.button('完整重载', () => script.reload(), { id: 'reload' }),
  ui.button('弹窗中重载', () => navigateFromDialog('reload'), { id: 'dialog-reload' }),
  ui.button('弹窗中退出', () => navigateFromDialog('exit'), { id: 'dialog-exit' }),
  ui.button('退出', () => script.exit(), { id: 'exit', tone: 'neutral' })
]);

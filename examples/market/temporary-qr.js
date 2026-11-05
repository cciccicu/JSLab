const content = ui.signal('https://ccicc.icu');

async function edit() {
  const answer = await dialog.text({ title: '二维码内容', message: '链接或短文字',
    value: content.get(), required: true, maxLength: 128 });
  if (answer.action !== 'confirm') return;
  const value = answer.value.trim();
  if (!value) {
    script.toast('内容不能为空');
    return;
  }
  content.set(value);
}

ui.showHeader(false);
ui.render(() => ui.column([
  ui.heading('临时二维码', { id: 'title', size: 28, lines: 1 }),
  ui.text('让手机扫描屏幕', { id: 'hint', size: 19, lines: 1, color: '#b9c8cf' }),
  ui.row([ui.qrcode(content.get(), { id: 'qr', size: 208, width: 208 })],
    { id: 'qr-row', justify: 'center' }),
  ui.text(content.get(), { id: 'value', size: 17, lines: 2, height: 54,
    color: '#c1cbd1', align: 'center' }),
  ui.row([
    ui.button('更换内容', edit, { id: 'edit', height: 54, lines: 1, background: '#1976a3' }),
    ui.button('退出', () => script.exit(), { id: 'exit', height: 54, lines: 1, background: '#34373d' })
  ], { id: 'actions', gap: 8 })
], { id: 'tool', gap: 10 }));

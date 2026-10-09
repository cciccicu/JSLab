const bill = ui.signal({ amount: 100, people: 2, fee: 0 });

async function change(field, title, min, max, decimals) {
  const current = bill.get();
  const answer = await dialog.number({ title, value: current[field], required: true,
    min, max, decimals });
  if (answer.action !== 'confirm') return;
  bill.set(Object.assign({}, bill.get(), { [field]: answer.value }));
}

function money(cents) {
  return (cents / 100).toFixed(2);
}

ui.showHeader(false);
ui.render(() => {
  const current = bill.get();
  const totalCents = Math.round(current.amount * (1 + current.fee / 100) * 100);
  const eachCents = Math.round(totalCents / current.people);
  return ui.column([
    ui.heading('AA 分账器', { id: 'title', size: 29, lines: 1 }),
    ui.text('每人应付', { id: 'label', size: 20, lines: 1, color: '#b9c8cf' }),
    ui.text('¥ ' + money(eachCents),
      { id: 'each', size: 36, lines: 1, color: '#6fd4a3' }),
    ui.text('总计 ¥ ' + money(totalCents),
      { id: 'total', size: 19, lines: 1, color: '#c1cbd1' }),
    ui.button('账单金额  ¥ ' + current.amount.toFixed(2),
      () => change('amount', '账单金额', 0, 100000, 2),
      { id: 'amount', height: 58, size: 18, lines: 1, background: '#1976a3' }),
    ui.row([
      ui.button('人数 ' + current.people,
        () => change('people', '分账人数', 1, 100, 0),
        { id: 'people', height: 58, size: 19, lines: 1, background: '#2f647c' }),
      ui.button('服务费 ' + current.fee + '%',
        () => change('fee', '服务费比例 %', 0, 100, 1),
        { id: 'fee', height: 58, size: 17, lines: 1, background: '#2f647c' })
    ], { id: 'inputs', gap: 8 }),
    ui.text('按分四舍五入；合计可能相差几分',
      { id: 'note', size: 16, lines: 1, color: '#899aa3' }),
    ui.button('退出', () => script.exit(),
      { id: 'exit', height: 54, lines: 1, background: '#34373d' })
  ], { id: 'tool', gap: 11 });
});

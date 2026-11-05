const state = ui.signal({ options: ['吃面', '吃饭', '吃粉'], choice: '', draws: 0 });

async function editOptions() {
  const answer = await dialog.text({ title: '编辑备选项', message: '用逗号隔开',
    value: state.get().options.join('，'), required: true, maxLength: 200 });
  if (answer.action !== 'confirm') return;
  const options = answer.value.split(/[,，、\n]/).map(value => value.trim()).filter(Boolean);
  if (options.length < 2) {
    script.toast('请至少填写两项');
    return;
  }
  if (options.length > 20) {
    script.toast('最多保留 20 项');
    return;
  }
  state.set({ options, choice: '', draws: 0 });
}

function draw() {
  const old = state.get();
  let index = Math.floor(Math.random() * old.options.length);
  if (old.options.length > 1 && old.options[index] === old.choice) {
    index = (index + 1 + Math.floor(Math.random() * (old.options.length - 1))) % old.options.length;
  }
  state.set({ options: old.options, choice: old.options[index], draws: old.draws + 1 });
}

ui.showHeader(false);
ui.render(() => {
  const current = state.get();
  return ui.column([
    ui.heading('随机决策器', { id: 'title', size: 28, lines: 1 }),
    ui.text(current.choice ? '这次选：' : '备选 ' + current.options.length + ' 项',
      { id: 'label', size: 20, lines: 1, color: '#aebdc6' }),
    ui.text(current.choice || '点“抽一个”开始',
      { id: 'choice', size: 32, lines: 2, height: 86, color: '#6fd4a3', align: 'center' }),
    ui.text(current.options.join(' / '),
      { id: 'options', size: 18, lines: 3, height: 92, color: '#c1cbd1' }),
    ui.button('抽一个', draw,
      { id: 'draw', height: 60, lines: 1, background: '#16845b' }),
    ui.row([
      ui.button('编辑选项', editOptions,
        { id: 'edit', height: 54, lines: 1, background: '#1976a3' }),
      ui.button('退出', () => script.exit(),
        { id: 'exit', height: 54, lines: 1, background: '#34373d' })
    ], { id: 'actions', gap: 8 })
  ], { id: 'tool', gap: 11 });
});

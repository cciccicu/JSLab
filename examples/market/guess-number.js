function newGame() {
  return { target: 1 + Math.floor(Math.random() * 100), tries: 0,
    message: '我想好了一个 1 到 100 的数字', history: [], won: false };
}

const game = ui.signal(newGame());
async function guess() {
  const current = game.get();
  if (current.won) return;
  const answer = await dialog.number({ title: '猜一个数字', message: '范围 1 到 100',
    required: true, min: 1, max: 100, decimals: 0 });
  if (answer.action !== 'confirm') return;
  const value = answer.value;
  const latest = game.get();
  if (latest.won) return;
  const result = value === latest.target ? '答对了！' : value < latest.target ? '偏小，再猜' : '偏大，再猜';
  game.set({ target: latest.target, tries: latest.tries + 1, message: result,
    history: [value + (value === latest.target ? ' ✓' : value < latest.target ? ' ↑' : ' ↓')]
      .concat(latest.history).slice(0, 5), won: value === latest.target });
}

ui.showHeader(false);
ui.render(() => {
  const state = game.get();
  return ui.column([
    ui.heading('猜数字', { id: 'title', size: 30, lines: 1 }),
    ui.text(state.message, { id: 'hint', size: 24, lines: 2, height: 72,
      color: state.won ? '#6fd4a3' : '#e8eff3' }),
    ui.text('已猜 ' + state.tries + ' 次', { id: 'tries', size: 20, lines: 1, color: '#aebdc6' }),
    ui.text(state.history.length ? state.history.join('   ') : ' ',
      { id: 'history', size: 20, lines: 3, height: 95, color: '#9dc9dd' }),
    ui.button(state.won ? '再玩一局' : '输入数字', state.won ? () => game.set(newGame()) : guess,
      { id: 'main', height: 60, lines: 1, background: '#16845b' }),
    ui.button('退出', () => script.exit(),
      { id: 'exit', height: 52, lines: 1, background: '#34373d' })
  ], { id: 'game', gap: 12 });
});

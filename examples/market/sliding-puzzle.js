const solved = [1, 2, 3, 4, 5, 6, 7, 8, 0];

function neighbors(index) {
  const row = Math.floor(index / 3);
  const col = index % 3;
  const result = [];
  if (row > 0) result.push(index - 3);
  if (row < 2) result.push(index + 3);
  if (col > 0) result.push(index - 1);
  if (col < 2) result.push(index + 1);
  return result;
}

function shuffled() {
  const board = solved.slice();
  let blank = 8;
  let previous = -1;
  for (let i = 0; i < 40; i++) {
    const choices = neighbors(blank).filter(index => index !== previous);
    const next = choices[Math.floor(Math.random() * choices.length)];
    board[blank] = board[next];
    board[next] = 0;
    previous = blank;
    blank = next;
  }
  if (board.every((value, index) => value === solved[index])) return shuffled();
  return { board, moves: 0, done: false };
}

const game = ui.signal(shuffled());
function move(index) {
  const old = game.get();
  if (old.done) return;
  const blank = old.board.indexOf(0);
  if (neighbors(blank).indexOf(index) < 0) return;
  const board = old.board.slice();
  board[blank] = board[index];
  board[index] = 0;
  game.set({ board, moves: old.moves + 1,
    done: board.every((value, position) => value === solved[position]) });
}

ui.showHeader(false);
ui.render(() => {
  const state = game.get();
  const rows = [];
  for (let row = 0; row < 3; row++) {
    const buttons = [];
    for (let col = 0; col < 3; col++) {
      const index = row * 3 + col;
      const number = state.board[index];
      buttons.push(ui.button(number ? String(number) : ' ', () => move(index), {
        id: 'tile-' + index, height: 76, size: 31, lines: 1,
        background: number ? '#1d6e91' : '#171b1e'
      }));
    }
    rows.push(ui.row(buttons, { id: 'row-' + row, gap: 6 }));
  }
  return ui.column([
    ui.heading('数字华容道', { id: 'title', size: 29, lines: 1 }),
    ui.text(state.done ? '完成！用了 ' + state.moves + ' 步' : '移动数字，还原 1 到 8',
      { id: 'status', size: 20, lines: 1, color: state.done ? '#6fd4a3' : '#c1cbd1' }),
    ui.column(rows, { id: 'board', gap: 6 }),
    ui.text('步数 ' + state.moves, { id: 'moves', size: 19, lines: 1, color: '#aebdc6' }),
    ui.row([
      ui.button('重新打乱', () => game.set(shuffled()),
        { id: 'restart', height: 54, lines: 1, background: '#16845b' }),
      ui.button('退出', () => script.exit(),
        { id: 'exit', height: 54, lines: 1, background: '#34373d' })
    ], { id: 'actions', gap: 8 })
  ], { id: 'game', gap: 9 });
});

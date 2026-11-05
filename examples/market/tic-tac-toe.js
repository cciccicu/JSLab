const lines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function winner(board) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (board[line[0]] && board[line[0]] === board[line[1]] && board[line[1]] === board[line[2]]) {
      return board[line[0]];
    }
  }
  return board.indexOf('') < 0 ? 'draw' : '';
}

function finishingMove(board, mark) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let count = 0;
    let empty = -1;
    for (let j = 0; j < 3; j++) {
      if (board[line[j]] === mark) count++;
      if (board[line[j]] === '') empty = line[j];
    }
    if (count === 2 && empty >= 0) return empty;
  }
  return -1;
}

function computerMove(board) {
  let move = finishingMove(board, 'O');
  if (move < 0) move = finishingMove(board, 'X');
  if (move < 0 && board[4] === '') move = 4;
  if (move < 0) {
    const choices = [0, 2, 6, 8, 1, 3, 5, 7].filter(index => board[index] === '');
    move = choices[Math.floor(Math.random() * choices.length)];
  }
  board[move] = 'O';
}

function fresh(score) {
  return { board: ['', '', '', '', '', '', '', '', ''], result: '', score: score || [0, 0, 0] };
}

const game = ui.signal(fresh());
function play(index) {
  const old = game.get();
  if (old.result || old.board[index]) return;
  const board = old.board.slice();
  const score = old.score.slice();
  board[index] = 'X';
  let result = winner(board);
  if (!result) {
    computerMove(board);
    result = winner(board);
  }
  if (result === 'X') score[0]++;
  else if (result === 'O') score[1]++;
  else if (result === 'draw') score[2]++;
  game.set({ board, result, score });
}

ui.showHeader(false);
ui.render(() => {
  const state = game.get();
  const cells = [];
  for (let row = 0; row < 3; row++) {
    const buttons = [];
    for (let col = 0; col < 3; col++) {
      const index = row * 3 + col;
      const mark = state.board[index];
      buttons.push(ui.button(mark || ' ', () => play(index), {
        id: 'cell-' + index, height: 76, size: 34, lines: 1,
        background: mark === 'X' ? '#1976a3' : mark === 'O' ? '#b65d4b' : '#2a3036'
      }));
    }
    cells.push(ui.row(buttons, { id: 'row-' + row, gap: 6 }));
  }
  const message = state.result === 'X' ? '你赢了！' : state.result === 'O' ? '电脑赢了' :
    state.result === 'draw' ? '平局' : '你执 X，先走';
  return ui.column([
    ui.heading('井字棋', { id: 'title', size: 29, lines: 1 }),
    ui.text(message, { id: 'message', size: 22, lines: 1, color: '#e8eff3' }),
    ui.column(cells, { id: 'board', gap: 6 }),
    ui.text('你 ' + state.score[0] + '  电脑 ' + state.score[1] + '  平局 ' + state.score[2],
      { id: 'score', size: 18, lines: 1, color: '#aebdc6' }),
    ui.row([
      ui.button('再来一局', () => game.set(fresh(game.get().score)),
        { id: 'again', height: 54, lines: 1, background: '#16845b' }),
      ui.button('退出', () => script.exit(),
        { id: 'exit', height: 54, lines: 1, background: '#34373d' })
    ], { id: 'actions', gap: 8 })
  ], { id: 'game', gap: 9 });
});

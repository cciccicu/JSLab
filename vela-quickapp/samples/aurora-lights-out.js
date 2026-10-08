// 极光熄灯：点一格会翻转它和上下左右，关掉全部灯即可获胜。
// 每局从全灭状态打乱，因此一定有解；黄色问号会指出可行的一步。
const SIDE = 4;
const CELL_COUNT = SIDE * SIDE;
const FLIPS = [];

for (let i = 0; i < CELL_COUNT; i++) {
  const row = Math.floor(i / SIDE);
  const column = i % SIDE;
  let mask = 1 << i;
  if (row > 0) mask |= 1 << (i - SIDE);
  if (row < SIDE - 1) mask |= 1 << (i + SIDE);
  if (column > 0) mask |= 1 << (i - 1);
  if (column < SIDE - 1) mask |= 1 << (i + 1);
  FLIPS.push(mask);
}

function countLights(board) {
  let count = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (board & (1 << i)) count++;
  }
  return count;
}

function newGame() {
  let board = 0;
  let answer = 0;
  while (board === 0) {
    board = 0;
    answer = 0;
    const order = [];
    for (let i = 0; i < CELL_COUNT; i++) order.push(i);
    for (let i = CELL_COUNT - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const previous = order[i];
      order[i] = order[j];
      order[j] = previous;
    }
    for (let i = 0; i < 7; i++) {
      const cell = order[i];
      board ^= FLIPS[cell];
      answer ^= 1 << cell;
    }
  }
  return { board: board, answer: answer, moves: 0, hint: -1, won: false };
}

const game = ui.signal(newGame());

function press(cell) {
  const current = game.get();
  if (current.won) return;
  const board = current.board ^ FLIPS[cell];
  const moves = current.moves + 1;
  if (board === 0) console.log('极光熄灯：' + moves + ' 步通关');
  game.set({
    board: board,
    answer: current.answer ^ (1 << cell),
    moves: moves,
    hint: -1,
    won: board === 0
  });
}

function showHint() {
  const current = game.get();
  if (current.won) return;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (current.answer & (1 << i)) {
      game.set({
        board: current.board,
        answer: current.answer,
        moves: current.moves,
        hint: i,
        won: false
      });
      return;
    }
  }
}

function restart() {
  game.set(newGame());
}

const cellActions = [];
for (let i = 0; i < CELL_COUNT; i++) {
  cellActions.push(() => press(i));
}

ui.showHeader(false);
ui.render(() => {
  const state = game.get();
  const cells = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const lit = !!(state.board & (1 << i));
    const hinted = state.hint === i;
    cells.push(ui.button(hinted ? '?' : lit ? '●' : '·', cellActions[i], {
      id: 'light-' + i,
      x: (i % SIDE) * 81,
      y: Math.floor(i / SIDE) * 62,
      width: 76,
      height: 56,
      lines: 1,
      disabled: state.won,
      background: hinted ? '#ffcc70' : lit ? '#36c8aa' : '#263747',
      color: hinted ? '#26313d' : lit ? '#103830' : '#829aab'
    }));
  }

  const message = state.won
    ? '全部熄灭！用了 ' + state.moves + ' 步'
    : state.hint >= 0 ? '黄色问号是可行的一步' : '点一格，翻转它和上下左右';

  return ui.column([
    ui.heading('极光熄灯', { size: 28, lines: 1, color: '#e8f6ff' }),
    ui.text('还亮 ' + countLights(state.board) + ' 格  ·  已走 ' + state.moves + ' 步', {
      size: 18, lines: 1, color: '#a9c4d1'
    }),
    ui.stack(cells, { id: 'board', width: 324, height: 242 }),
    ui.text(message, { size: 18, lines: 1, color: state.won ? '#72dfbd' : '#c0d1db' }),
    ui.row([
      ui.button('提示', showHint, { id: 'hint', height: 52, background: '#675339', color: '#fff3d7' }),
      ui.button('新局', restart, { id: 'restart', height: 52, background: '#207c78', color: '#ffffff' }),
      ui.button('退出', () => script.exit(), { id: 'exit', height: 52, background: '#384657', color: '#ffffff' })
    ], { gap: 6 })
  ], { gap: 6 });
});

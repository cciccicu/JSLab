export default `// @jslab-mode ui
const SIZE = 4;

function emptyBoard() {
  return [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0
  ];
}

function addTile(board) {
  const empty = [];
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === 0) empty.push(i);
  }
  if (empty.length === 0) return board;
  const next = board.slice();
  const target = empty[Math.floor(Math.random() * empty.length)];
  next[target] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function newGame() {
  return {
    board: addTile(addTile(emptyBoard())),
    score: 0,
    message: ''
  };
}

function lineIndices(direction, line) {
  const indices = [];
  for (let offset = 0; offset < SIZE; offset += 1) {
    if (direction === 'left') indices.push(line * SIZE + offset);
    if (direction === 'right') indices.push(line * SIZE + (SIZE - 1 - offset));
    if (direction === 'up') indices.push(offset * SIZE + line);
    if (direction === 'down') indices.push((SIZE - 1 - offset) * SIZE + line);
  }
  return indices;
}

function mergeLine(values) {
  const packed = values.filter(value => value !== 0);
  const merged = [];
  let gained = 0;
  for (let i = 0; i < packed.length; i += 1) {
    if (i + 1 < packed.length && packed[i] === packed[i + 1]) {
      const value = packed[i] * 2;
      merged.push(value);
      gained += value;
      i += 1;
    } else {
      merged.push(packed[i]);
    }
  }
  while (merged.length < SIZE) merged.push(0);
  return { values: merged, gained };
}

function canMove(board) {
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === 0) return true;
    const row = Math.floor(i / SIZE);
    const column = i % SIZE;
    if (column + 1 < SIZE && board[i] === board[i + 1]) return true;
    if (row + 1 < SIZE && board[i] === board[i + SIZE]) return true;
  }
  return false;
}

function tileTone(value) {
  if (value === 0) return 'neutral';
  if (value <= 4) return 'primary';
  if (value <= 16) return 'success';
  if (value <= 128) return 'warning';
  return 'danger';
}

const game = ui.signal(newGame());

function move(direction) {
  const current = game.get();
  const board = current.board.slice();
  let gained = 0;
  let changed = false;

  for (let line = 0; line < SIZE; line += 1) {
    const indices = lineIndices(direction, line);
    const values = indices.map(index => board[index]);
    const result = mergeLine(values);
    gained += result.gained;
    for (let i = 0; i < SIZE; i += 1) {
      if (board[indices[i]] !== result.values[i]) changed = true;
      board[indices[i]] = result.values[i];
    }
  }

  if (!changed) {
    game.set({
      board: current.board,
      score: current.score,
      message: canMove(current.board) ? '这个方向不能移动' : '游戏结束'
    });
    return;
  }

  const nextBoard = addTile(board);
  game.set({
    board: nextBoard,
    score: current.score + gained,
    message: canMove(nextBoard) ? '' : '游戏结束'
  });
}

function reset() {
  game.set(newGame());
}

ui.fullscreen(true);
ui.render(() => {
  const state = game.get();
  const cells = state.board.map((value, index) => ({
    id: 'tile-' + index,
    text: value === 0 ? '' : String(value),
    tone: tileTone(value),
    size: value >= 1024 ? 18 : value >= 128 ? 21 : 25
  }));

  return [
    ui.text('2048　分数 ' + state.score, {
      id: 'score',
      size: 27,
      color: '#ffffff'
    }),
    ui.grid(cells, {
      id: 'board',
      columns: 4,
      cellHeight: 50
    }),
    ui.text(state.message || '合并相同数字，得到 2048', {
      id: 'message',
      size: 18,
      color: state.message === '游戏结束' ? '#f48771' : '#9ca3af',
      align: 'center'
    }),
    ui.buttonRow([
      ui.button('新局', reset, { id: 'reset', tone: 'danger' }),
      ui.button('↑', () => move('up'), { id: 'up' }),
      ui.button('返回', () => ui.back(), { id: 'back', tone: 'neutral' })
    ], { id: 'page-controls' }),
    ui.buttonRow([
      ui.button('←', () => move('left'), { id: 'left' }),
      ui.button('↓', () => move('down'), { id: 'down' }),
      ui.button('→', () => move('right'), { id: 'right' })
    ], { id: 'move-controls' })
  ];
});`;

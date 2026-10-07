export default `
const SIZE = 4;
// Classic 2048 tiles, with a dark empty cell for the watch's black background.
const TILE_BACKGROUNDS = {
  0: '#3d3630',
  2: '#eee4da',
  4: '#ede0c8',
  8: '#f2b179',
  16: '#f59563',
  32: '#f67c5f',
  64: '#f65e3b',
  128: '#edcf72',
  256: '#edcc61',
  512: '#edc850',
  1024: '#edc53f',
  2048: '#edc22e'
};
const BUTTON_BACKGROUND = '#8f7a66';
const LIGHT_TEXT = '#f9f6f2';

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

function tileColor(value) {
  if (value <= 4) return '#776e65';
  // Dark digits stay readable on the bright gold tiles.
  if (value >= 128 && value <= 2048) return '#51473d';
  return LIGHT_TEXT;
}

const game = ui.signal(newGame());
console.log('2048 已开始；系统返回查看日志，轻点日志恢复游戏');

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
  console.log('2048', direction, '分数', current.score + gained);
  game.set({
    board: nextBoard,
    score: current.score + gained,
    message: canMove(nextBoard) ? '' : '游戏结束'
  });
}

function reset() {
  console.log('2048 新局');
  game.set(newGame());
}

// Coordinates are relative to this 324 x 156 control area.
// The four arrows form a cross; utility actions occupy the bottom corners.
const controls = ui.stack([
  ui.button('↑', () => move('up'), {
    id: 'up', x: 122, y: 0, width: 80, height: 50, lines: 1,
    background: BUTTON_BACKGROUND, color: LIGHT_TEXT
  }),
  ui.button('←', () => move('left'), {
    id: 'left', x: 36, y: 53, width: 80, height: 50, lines: 1,
    background: BUTTON_BACKGROUND, color: LIGHT_TEXT
  }),
  ui.button('→', () => move('right'), {
    id: 'right', x: 208, y: 53, width: 80, height: 50, lines: 1,
    background: BUTTON_BACKGROUND, color: LIGHT_TEXT
  }),
  ui.button('↓', () => move('down'), {
    id: 'down', x: 122, y: 106, width: 80, height: 50, lines: 1,
    background: BUTTON_BACKGROUND, color: LIGHT_TEXT
  }),
  ui.button('新局', reset, {
    id: 'reset', x: 0, y: 106, width: 100, height: 50, lines: 1,
    background: '#a47745', color: LIGHT_TEXT
  }),
  ui.button('退出', () => script.exit(), {
    id: 'exit', x: 224, y: 106, width: 100, height: 50, lines: 1,
    background: '#4d443b', color: LIGHT_TEXT
  })
], { id: 'controls', height: 156 });

ui.showHeader(false);
ui.render(() => {
  const state = game.get();
  const cells = state.board.map((value, index) => ({
    id: 'tile-' + index,
    text: value === 0 ? '' : String(value),
    background: TILE_BACKGROUNDS[value] || '#3c3a32',
    color: tileColor(value),
    size: value >= 1024 ? 18 : value >= 128 ? 21 : 25
  }));

  return ui.column([
    ui.text('2048　分数 ' + state.score, {
      id: 'score',
      size: 27,
      lines: 1,
      color: LIGHT_TEXT
    }),
    ui.grid(cells, {
      id: 'board',
      columns: 4,
      cellHeight: 50
    }),
    ui.text(state.message || '合并相同数字，得到 2048', {
      id: 'message',
      size: 18,
      lineHeight: 22,
      lines: 1,
      color: state.message === '游戏结束' ? '#f67c5f' : '#b9ada1',
      align: 'center'
    }),
    controls
  ], { id: 'game', gap: 4 });
});`;

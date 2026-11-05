// JSLab image + Canvas: import this file as a script on a client with both APIs.
const icon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP438DwHwAGgAJ/4jyYEwAAAABJRU5ErkJggg==';
const canvas = ui.canvas({ id: 'drawing', pixelWidth: 160, pixelHeight: 96, width: '100%', radius: 12 });
let alternate = false;

async function draw() {
  alternate = !alternate;
  canvas.clear('#181818');
  canvas.rect(8, 8, 52, 32, { color: alternate ? '#ff8000' : '#00aaff' });
  canvas.circle(canvas.pixelWidth - 30, 28, 16, { color: '#ffffff', fill: false, lineWidth: 3 });
  canvas.line(8, 58, canvas.pixelWidth - 8, 82, { color: '#7dd3fc', lineWidth: 2 });
  canvas.setPixel(8, 90, '#ffffff');
  await canvas.submit();
  ui.refresh();
}

ui.setTitle('图片与画布');
ui.render(ui.column([
  ui.row([
    ui.image(icon, { id: 'icon', width: 24, height: 24 }),
    ui.text('Base64 图标与内存绘图', { size: 20, lines: 1 })
  ], { align: 'center' }),
  canvas,
  ui.button('重新绘制', draw, { id: 'redraw' })
]));
return draw();

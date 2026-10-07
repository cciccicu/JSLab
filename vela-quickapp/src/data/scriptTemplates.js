import ui2048Example from './examples/ui2048Example.js';

const LOG_TEMPLATES = [
  {
    label: '空白脚本',
    content: ''
  },
  {
    label: 'Console Hello World',
    content: `console.log('Hello World!');`
  },
  {
    label: 'JS 引擎 Benchmark',
    content: `const WARMUP_MS = 150;
const SAMPLE_MS = 1000;
const BATCH_SIZE = 500;

function runBenchmark(durationMs) {
  let checksum = 0x12345678;
  let operations = 0;
  const startedAt = Date.now();
  let elapsed = 0;

  do {
    for (let index = 0; index < BATCH_SIZE; index += 1) {
      checksum = (checksum * 1664525 + 1013904223) >>> 0;
      checksum = (checksum ^ (checksum >>> 16)) >>> 0;
    }
    operations += BATCH_SIZE;
    elapsed = Date.now() - startedAt;
  } while (elapsed < durationMs);

  return { operations, elapsed, checksum };
}

function formatInteger(value) {
  let source = String(value);
  let formatted = '';
  while (source.length > 3) {
    formatted = ',' + source.slice(-3) + formatted;
    source = source.slice(0, -3);
  }
  return source + formatted;
}

runBenchmark(WARMUP_MS);
const result = runBenchmark(SAMPLE_MS);
const operationsPerSecond = Math.round(
  result.operations * 1000 / result.elapsed
);

console.log('JS 引擎 Benchmark');
console.log('每秒运算次数:', formatInteger(operationsPerSecond), 'ops/s');
console.log('实际采样时间:', result.elapsed + ' ms');
console.log('校验值:', result.checksum);`
  },
  {
    label: 'Toast 提示',
    content: `script.toast('Hello World!');`
  },
  {
    label: '用户输入',
    content: `return dialog.text({ title: '用户输入', message: '请输入你的名字', maxLength: 20 })
  .then(result => console.log(result.action === 'cancel' ? '已取消' : '你好，' + result.value + '！'))
  .catch(error => console.error(error.message));`
  },
  {
    label: '网络请求',
    content: `system.http.request({
  url: 'https://example.com',
  responseType: 'text',
  success: (response) => {
    console.log('状态码:', response.code);
    console.log('响应数据:', response.data);
  },
  fail: (data, code) => {
    console.error('请求失败:', code, data);
  }
});`
  }
];

const UI_TEMPLATES = [
  {
    label: 'UI Hello World',
    content: `ui.render([
  ui.text('Hello World!')
]);`
  },
  {
    label: 'UI 交互组件',
    content: `const count = ui.signal(0);
const enabled = ui.signal(true);
const level = ui.signal(35);

ui.setTitle('UI 示例');
ui.render(() => [
  ui.heading('交互组件', { id: 'title' }),
  ui.text('计数：' + count.get(), {
    id: 'summary',
    color: '#9cdcfe'
  }),
  ui.button('计数 +1', () => count.update(value => value + 1), {
    id: 'add-button'
  }),
  ui.switch('示例开关', enabled.get(), value => enabled.set(value), {
    id: 'feature-switch'
  }),
  ui.slider('强度', level.get(), value => level.set(value), {
    id: 'level-slider',
    min: 0,
    max: 100,
    step: 5
  }),
  ui.progress('当前强度', level.get(), {
    id: 'level-progress'
  }),
  ui.button('重置', () => {
    count.set(0);
    enabled.set(true);
    level.set(35);
  }, {
    id: 'reset-button',
    tone: 'danger'
  })
]);`
  },
  {
    label: '布局与二维码',
    content: `const count = ui.signal(0);
// 不变的组件可在渲染函数外构造。
const qr = ui.qrcode('https://ccicc.icu', { id: 'site-qr', size: 160 });
ui.setTitle('布局示例');
ui.render(() => ui.column([
  ui.row([
    ui.text('访问官网', { width: 140, lines: 1, bold: true }),
    ui.text('次数 ' + count.get(), { lines: 1, align: 'right', color: '#9cdcfe' })
  ], { gap: 8 }),
  ui.column([qr], { align: 'center' }),
  ui.row([
    ui.button('+1', () => count.update(value => value + 1), {
      id: 'add', background: '#176b45', color: '#ffffff'
    }),
    ui.button('日志', () => ui.hide(), { id: 'exit', background: '#34373d' })
  ], { gap: 8 })
], { padding: 12, gap: 12, background: '#20242a', radius: 24 }));`
  },
  {
    label: 'UI 2048 游戏',
    content: ui2048Example
  },
  { label: '对话框与日志', content: `async function main() {
  const number = await dialog.number({ title: '温度', value: -2.5, min: -20, max: 50, decimals: 1 });
  console.log(number.action, number.value);
  const choices = await dialog.select({ title: '多选', multiple: true, minSelected: 1,
    items: [{ label: '游戏', value: 'game' }, { label: '工具', value: 'tool' }] });
  console.log(choices.action, choices.value);
}
return main();` },
  { label: '界面与日志切换', content: `ui.setTitle('界面与日志');
ui.showHeader(false);
const count = ui.signal(0);
ui.render(() => [ui.heading('次数：' + count.get()),
  ui.button('增加', () => { count.update(n => n + 1); console.log('次数', count.get()); }),
  ui.button('查看日志', () => ui.hide()),
  ui.button('完整重载', () => script.reload()),
  ui.button('退出', () => script.exit())]);` }
];

export const SCRIPT_TEMPLATES = LOG_TEMPLATES.concat(UI_TEMPLATES);
export function getTemplates() { return SCRIPT_TEMPLATES; }

import ui2048Example from './examples/ui2048Example.js';

export const CONSOLE_TEMPLATES = [
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
    content: `dialog.text({ title: '用户输入', message: '请输入你的名字', maxLength: 20 })
  .then(name => console.log(name === null ? '已取消' : '你好，' + name + '！'))
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

export const UI_TEMPLATES = [
  {
    label: '空白脚本',
    content: ''
  },
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
    label: 'UI 2048 游戏',
    content: ui2048Example
  }
];

export function getTemplatesForMode(modeIndex) {
  return modeIndex === 1 ? UI_TEMPLATES : CONSOLE_TEMPLATES;
}

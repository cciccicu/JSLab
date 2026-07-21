const DEFAULT_LINE_COUNT = 500;

export function createLargeFileExample(lineCount) {
  const targetLineCount = lineCount || DEFAULT_LINE_COUNT;
  const dataLineCount = Math.max(0, targetLineCount - 4);
  const lines = [
    '// JSLab 连续文档与语法高亮性能测试',
    'const records = [];'
  ];

  for (let index = 1; index <= dataLineCount; index++) {
    lines.push('records.push({ id: ' + index + ', value: ' + index + ' * ' + index + ' });');
  }

  lines.push('const total = records.reduce((sum, item) => sum + item.value, 0);');
  lines.push("console.log('records:', records.length, 'total:', total);");
  return lines.join('\n');
}

export default createLargeFileExample;

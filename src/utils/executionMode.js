const MODE_DIRECTIVE = /^\s*\/\/\s*@jslab-mode\s+(console|ui)\s*$/i;

export function detectExecutionMode(source) {
  const lines = String(source || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let index = 0; index < Math.min(lines.length, 8); index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const match = MODE_DIRECTIVE.exec(line);
    return match ? match[1].toLowerCase() : 'console';
  }
  return 'console';
}

export function getExecutionRoute(source) {
  return detectExecutionMode(source) === 'ui' ? 'runUi' : 'runConsole';
}

export default { detectExecutionMode, getExecutionRoute };

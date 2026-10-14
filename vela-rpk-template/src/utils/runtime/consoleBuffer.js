import { LOG_LIMITS } from './runtimeContract.js';

export function formatError(error) {
  try {
    if (error && error.message !== undefined) return ((error.name ? String(error.name) + ': ' : '') + String(error.message)).slice(0, 512);
    return String(error).slice(0, 512);
  } catch (_) { return '无法显示错误'; }
}
function preview(value, budget, depth, seen) {
  if (budget.remaining <= 0) return '';
  let result;
  try {
    if (value === null || typeof value !== 'object') result = typeof value === 'function' ? '[Function]' : String(value);
    else if (value instanceof Error) result = formatError(value);
    else if (seen.indexOf(value) >= 0) result = '[Circular]';
    else if (depth >= 2) result = Array.isArray(value) ? '[Array]' : '[Object]';
    else {
      seen.push(value);
      const array = Array.isArray(value), parts = [];
      let count = 0;
      for (const key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        if (count >= 8 || budget.remaining < 8) { parts.push('…'); break; }
        count += 1;
        const label = array ? '' : String(key).slice(0, 40) + ': ';
        budget.remaining -= label.length + 2;
        let item;
        try { item = value[key]; } catch (_) { item = '[无法读取]'; }
        parts.push(label + preview(item, budget, depth + 1, seen));
      }
      seen.pop();
      return (array ? '[' : '{') + parts.join(', ') + (array ? ']' : '}');
    }
  } catch (_) { result = '[无法显示]'; }
  const available = Math.max(0, budget.remaining);
  const clipped = result.length > available ? result.slice(0, Math.max(0, available - 1)) + '…' : result;
  budget.remaining -= clipped.length;
  return clipped;
}
export function createConsoleBuffer(changed) {
  let entries = [], characters = 0, omitted = 0, active = true;
  function write(level, args) {
    if (!active) return;
    const budget = { remaining: LOG_LIMITS.entryCharacters - 16 }, parts = [];
    for (let i = 0; i < args.length && budget.remaining > 0; i += 1) {
      parts.push(preview(args[i], budget, 0, [])); budget.remaining -= 1;
    }
    const entry = (level === 'log' ? '' : '[' + level + '] ') + parts.join(' ');
    entries.push(entry); characters += entry.length + 1;
    while (entries.length > LOG_LIMITS.entries || characters > LOG_LIMITS.characters) {
      characters -= entries.shift().length + 1; omitted += 1;
    }
    changed();
  }
  return {
    console: {
      log(...args) { write('log', args); }, info(...args) { write('info', args); },
      warn(...args) { write('warn', args); }, error(...args) { write('error', args); },
      clear() { if (!active) return; entries = []; characters = 0; omitted = 0; changed(); }
    },
    read() { return (omitted ? '已省略 ' + omitted + ' 条较早日志\n' : '') + entries.join('\n'); },
    dispose() { active = false; entries = []; characters = 0; omitted = 0; }
  };
}

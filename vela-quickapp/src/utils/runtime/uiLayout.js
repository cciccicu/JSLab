// Layout groups are JS-only. Only painted leaves/backgrounds reach the ViewModel.
// Guidance for watch-sized screens, not limits enforced by the compiler.
export const UI_PERFORMANCE_GUIDE = { declarations: 40, paintedNodes: 160, depth: 4, qrcodes: 2 };

export function number(value, min, max, fallback) {
  if (value === undefined || value === null) return fallback;
  const result = Number(value);
  return isFinite(result) ? Math.min(max, Math.max(min, result)) : fallback;
}

export function text(value) {
  return String(value == null ? '' : value).slice(0, 1024);
}

export function color(value, fallback) {
  if (value == null) return fallback;
  const source = String(value).trim();
  if (/^#[0-9a-f]{6}$/i.test(source)) return source;
  if (/^#[0-9a-f]{3}$/i.test(source)) return '#' + source.slice(1).split('').map(c => c + c).join('');
  const match = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(source);
  if (match && match.slice(1).every(part => Number(part) <= 255)) return source;
  // Keep v1 rgba colors for existing scripts; no opacity or compositing effects.
  const rgba = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|1|0?\.\d+)\s*\)$/.exec(source);
  return rgba && rgba.slice(1, 4).every(part => Number(part) <= 255) ? source : fallback;
}

function widthOf(value, available, fallback) {
  const percent = typeof value === 'string' && /^(\d+(?:\.\d+)?)%$/.exec(value);
  return Math.round(percent ? number(Number(percent[1]) * available / 100, 1, available, fallback)
    : number(value, 1, available, fallback));
}

function list(value) { return Array.isArray(value) ? value : value == null || value === false ? [] : [value]; }
function offset(align, spare) { return align === 'center' ? spare / 2 : align === 'end' ? spare : 0; }
function background(raw, fallback) { return color(raw.background, fallback); }
const GRID_TONES = { primary: '#1769d2', success: '#16845b', warning: '#a55d16', danger: '#b93838' };
const BUTTON_TONES = { primary: '#0d6eff', neutral: '#34373d', danger: '#d94343' };
function tone(raw, grid) {
  const colors = grid ? GRID_TONES : BUTTON_TONES;
  const selected = colors[raw.tone];
  return background(raw, typeof selected === 'string' ? selected : grid ? '#292c31' : '#0d6eff');
}

// All emitted fields are primitives: cheap comparison, no JSON serialization or
// deep observation of callbacks, render factories, or the original layout tree.
export function sameNode(a, b) {
  if (!a || !b) return false;
  // Most painted changes are text or background. Reject them before allocating
  // two key arrays; all other fields still use the complete comparison below.
  if (a.text !== b.text || a.background !== b.background) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (let i = 0; i < keys.length; i += 1) if (a[keys[i]] !== b[keys[i]]) return false;
  return true;
}

export function compileUi(source, top, previous, cache) {
  const nodes = [];
  const handlers = Object.create(null);
  const ids = Object.create(null);
  let old = null;
  const nextCache = Object.create(null);
  let count = 0;

  // Stable trees find their previous nodes by position (or the leaf cache).
  // Build an ID index only when insertion, deletion or reordering needs it.
  function previousNode(id) {
    if (!old) {
      old = Object.create(null);
      (previous || []).forEach(node => { old[node.id] = node; });
    }
    return old[id];
  }

  function identity(raw, path) {
    const id = raw.id == null ? '$' + path : String(raw.id);
    if (raw.id != null && (!id || id.length > 56 || id.charAt(0) === '$')) throw new Error('UI id 需为 1–56 字符，不能以 $ 开头');
    if (ids[id]) throw new Error('UI id 重复：' + id);
    ids[id] = true;
    return id;
  }

  // A grid cell always has one line, a fixed box, centered bold text and a
  // generated ID. Avoid manufacturing a generic text descriptor and measuring
  // it on every refresh. Only the six supported dynamic inputs are compared;
  // callbacks and arbitrary user objects never enter this cache.
  function measureGridCell(cell, w, h, id) {
    if (ids[id]) throw new Error('UI id 重复：' + id);
    ids[id] = true;
    const entry = cache && cache[id];
    const cached = entry && entry.grid ? entry : null;
    const before = cached && cached.input;
    const value = cell.text;
    const sizeInput = cell.size;
    const lineInput = cell.lineHeight;
    const colorInput = cell.color;
    const bgInput = cell.background;
    const toneInput = cell.tone;
    if (before && cached.availableWidth === w && cached.height === h &&
        value === before.text && sizeInput === before.size && lineInput === before.lineHeight &&
        colorInput === before.color && bgInput === before.background && toneInput === before.tone) {
      nextCache[id] = cached;
      return { id, kind: 'text', w, h, node: cached.node, cached };
    }
    const input = { text: value, size: sizeInput, lineHeight: lineInput, color: colorInput, background: bgInput, tone: toneInput };
    const oldNode = cached && cached.node;
    const size = before && sizeInput === before.size ? oldNode.size : number(sizeInput, 16, 30, 24);
    const node = {
      id, kind: 'text', width: Math.round(w),
      background: before && bgInput === before.background && toneInput === before.tone ? oldNode.background : tone(input, true),
      radius: 12,
      text: before && value === before.text ? oldNode.text : text(value).slice(0, 8),
      color: before && colorInput === before.color ? oldNode.color : color(colorInput, '#ffffff'),
      size, align: 'center', bold: 'bold',
      lineHeight: before && lineInput === before.lineHeight && size === oldNode.size
        ? oldNode.lineHeight : number(lineInput, size, 64, Math.max(size + 4, 32)),
      lines: 1, x: oldNode && oldNode.x, y: oldNode && oldNode.y, height: Math.ceil(h)
    };
    let cacheable = true;
    for (const key in input) {
      if (input[key] !== null && (typeof input[key] === 'object' || typeof input[key] === 'function')) cacheable = false;
    }
    const next = { grid: true, availableWidth: w, width: w, height: h, input: cacheable ? input : null, node };
    nextCache[id] = next;
    return { id, kind: 'text', w, h, node, cached: next };
  }

  function finishLayout(box, layout) {
    const { raw, kind, padding, inner, gap, columns, cellHeight, horizontal, remaining, weight, children } = layout;
    let natural = 0;
    if (horizontal) box.children.forEach(child => { natural = Math.max(natural, child.h); });
    else if (kind === 'grid') natural = Math.ceil(children.length / columns) * (cellHeight + gap) - (children.length ? gap : 0);
    else if (kind === 'stack') box.children.forEach(child => { natural = Math.max(natural, child.h + number(child.raw.y, 0, 4096, 0)); });
    else box.children.forEach((child, i) => { natural += child.h + (i ? gap : 0); });
    box.h = Math.max(natural + padding * 2, number(raw.height, 0, 8192, natural + padding * 2));
    const extra = Math.max(0, box.h - padding * 2 - natural);
    let cursor = padding + (!horizontal && kind === 'column' ? offset(raw.justify, extra) : 0);
    const freeX = horizontal && !weight ? remaining : 0;
    if (horizontal) cursor += offset(raw.justify, freeX);
    const between = raw.justify === 'between' && children.length > 1 ? (horizontal ? freeX : extra) / (children.length - 1) : 0;
    box.children.forEach((child, i) => {
      child.x = horizontal ? cursor : padding + offset(raw.align, inner - child.w);
      child.y = horizontal ? padding + offset(raw.align, box.h - padding * 2 - child.h) : cursor;
      if (kind === 'grid') { child.x = padding + (i % columns) * (child.w + gap); child.y = padding + Math.floor(i / columns) * (child.h + gap); }
      if (kind === 'stack') { child.x = padding + number(child.raw.x, 0, Math.max(0, inner - child.w), 0); child.y = padding + number(child.raw.y, 0, 4096, 0); }
      cursor += (horizontal ? child.w : child.h) + gap + between;
    });
    box.radius = number(raw.radius, 0, 80, 0);
  }

  // Explicit enter/exit frames keep layout depth independent of the JS call stack.
  // Only ancestors are tracked: the same descriptor can be reused in siblings.
  function measure(input, available, path, forcedWidth, generated) {
    const active = new Set();
    const frames = [{ input, available, path, forcedWidth, generated, parent: null, index: 0 }];
    let rootBox = null;
    function attach(frame, box) {
      if (frame.parent) frame.parent.children[frame.index] = box;
      else rootBox = box;
    }
    while (frames.length) {
      const frame = frames.pop();
      if (frame.exit) {
        finishLayout(frame.box, frame.layout);
        active.delete(frame.raw);
        attach(frame, frame.box);
        continue;
      }
      const raw = frame.input && typeof frame.input === 'object' ? frame.input : { kind: 'text', text: frame.input };
      if (active.has(raw)) throw new Error('UI 布局不能循环引用');
      count += 1;
      const id = frame.generated || identity(raw, frame.path);
      if (frame.generated) {
        if (ids[id]) throw new Error('UI id 重复：' + id);
        ids[id] = true;
      }
      const kind = raw.kind || 'text';
      const w = frame.forcedWidth == null ? widthOf(raw.width, frame.available, frame.available) : frame.forcedWidth;
      const box = { id, kind, w, h: 0, raw };
      if (kind !== 'row' && kind !== 'column' && kind !== 'stack' && kind !== 'buttonRow' && kind !== 'grid') {
        attach(frame, measureLeaf(box, raw, id, kind, w));
        continue;
      }
      active.add(raw);
      box.background = background(raw, 'transparent');
      const padding = number(raw.padding, 0, Math.min(48, (w - 1) / 2), 0);
      const inner = w - padding * 2;
      const gap = number(raw.gap, 0, 48, kind === 'grid' || kind === 'buttonRow' ? 6 : 8);
      const children = list(kind === 'buttonRow' ? raw.buttons : kind === 'grid' ? raw.items : raw.children)
        .filter(child => child != null && child !== false);
      const columns = Math.round(number(raw.columns, 2, 4, 4));
      const cellHeight = kind === 'grid' ? number(raw.cellHeight, 44, 72, 52) : 0;
      const cellWidth = (inner - gap * (columns - 1)) / columns;
      if (kind === 'grid' && children.length && cellWidth < 1) throw new Error('grid 宽度不足：减小 columns、padding 或 gap');
      const horizontal = kind === 'row' || kind === 'buttonRow';
      let remaining = inner - gap * Math.max(0, (kind === 'grid' ? columns : children.length) - 1);
      let weight = 0;
      const widths = [];
      if (horizontal) {
        children.forEach((child, i) => {
          const item = child && typeof child === 'object' ? child : {};
          if (item.width != null) { widths[i] = widthOf(item.width, inner, inner); remaining -= widths[i]; }
          else { widths[i] = null; weight += number(item.flex, 0.1, 100, 1); }
        });
        if (remaining < 0 || (weight && remaining < children.length)) throw new Error('row 宽度不足：减小 width、padding 或 gap');
      }
      box.children = new Array(children.length);
      const layout = { raw, kind, padding, inner, gap, columns, cellHeight, horizontal, remaining, weight, children };
      frames.push({ exit: true, box, layout, raw, parent: frame.parent, index: frame.index });
      if (kind === 'grid') {
        children.forEach((child, i) => {
          const cell = child && typeof child === 'object' ? child : { text: child };
          box.children[i] = measureGridCell(cell, cellWidth, cellHeight, id + '/cell/' + i);
        });
        continue;
      }
      for (let i = children.length - 1; i >= 0; i -= 1) {
        const child = children[i];
        let item = child;
        let childWidth;
        let generatedId;
        if (horizontal) {
          childWidth = widths[i] == null ? remaining * number(child && child.flex, 0.1, 100, 1) / weight : widths[i];
          if (childWidth < 1) throw new Error('row 子项宽度不足：调整 flex、width、padding 或 gap');
        }
        if (kind === 'buttonRow') {
          const button = child && typeof child === 'object' ? child : { text: child };
          item = Object.assign({}, button, { kind: 'button', text: text(button.text).slice(0, 8), height: 60 });
          if (button.id == null) generatedId = id + '/button/' + i;
        }
        // Compact the path when deeply nested, without limiting nesting itself.
        const childPath = frame.path.length < 48 ? frame.path + '.' + i : '#' + count + '.' + i;
        frames.push({ input: item, available: inner, path: childPath, forcedWidth: childWidth,
          generated: generatedId, parent: box, index: i });
      }
    }
    return rootBox;
  }

  function measureLeaf(box, raw, id, kind, w) {
    if (kind === 'spacer') { box.h = number(raw.size, 0, 480, 12); return box; }
    if (kind === 'button' && raw.disabled !== true && typeof raw.onPress === 'function') handlers[id] = raw.onPress;
    if ((kind === 'switch' || kind === 'slider') && typeof raw.onChange === 'function') handlers[id] = raw.onChange;
    // Cache only leaf inputs, never factories or callbacks. The next cache is
    // bounded by this render, so disappearing IDs do not accumulate in memory.
    const cached = cache && cache[id];
    let matched = !!cached && !cached.grid && cached.input !== null && cached.availableWidth === w;
    let keyCount = 0;
    for (const key in raw) {
      if (key === 'onPress' || key === 'onChange') continue;
      keyCount += 1;
      if (matched && raw[key] !== cached.input[key]) matched = false;
    }
    if (matched && keyCount === cached.keyCount) {
      nextCache[id] = cached;
      box.w = cached.width; box.h = cached.height; box.node = cached.node; box.cached = cached;
      return box;
    }
    let inputCopy = {};
    // Check cache eligibility only on misses. Mutable coercible values must be
    // measured again, while ordinary primitive inputs keep the warm fast path.
    for (const key in raw) {
      if (key === 'onPress' || key === 'onChange') continue;
      const value = raw[key];
      if (value !== null && (typeof value === 'object' || typeof value === 'function')) { inputCopy = null; break; }
      inputCopy[key] = value;
    }
    const node = { id, kind, width: Math.round(w), background: background(raw, 'transparent'), radius: number(raw.radius, 0, 80, 0) };
    box.node = node;
    box.cached = { availableWidth: w, input: inputCopy, keyCount, node };
    nextCache[id] = box.cached;
    if (kind === 'divider') { box.h = number(raw.height, 1, 32, 2); node.background = color(raw.color, '#34373d'); return box; }
    if (kind === 'qrcode') {
      const value = String(raw.value == null ? '' : raw.value);
      if (!value || value.length > 256) throw new Error('二维码内容需为 1–256 字符');
      if (w < 96) throw new Error('二维码需要至少 96px 宽度');
      box.w = Math.min(w, number(raw.size, 96, 288, 160));
      box.h = box.w;
      node.width = Math.round(box.w);
      node.value = value;
      node.color = color(raw.color, '#000000');
      node.background = background(raw, '#ffffff');
      node.qrSize = Math.max(80, Math.round(box.w - 16));
      return box;
    }
    if (['heading', 'text', 'button', 'switch', 'slider', 'progress'].indexOf(kind) === -1) throw new Error('不支持的 UI 组件：' + kind);
    node.text = text(raw.text);
    node.color = color(raw.color, '#ffffff');
    node.size = number(raw.size, 16, 36, kind === 'heading' ? 30 : 24);
    node.align = ['left', 'center', 'right'].indexOf(raw.align) < 0 ? 'left' : raw.align;
    node.bold = kind === 'heading' || kind === 'button' || raw.bold === true ? 'bold' : 'normal';
    node.lineHeight = number(raw.lineHeight, node.size, 64, Math.max(node.size + 4, kind === 'heading' ? 40 : 32));
    // Conservative automatic line budget; explicit lines makes fixed panels
    // deterministic. Native text handles wrapping/ellipsis inside this budget.
    const before = cached ? cached.node : previousNode(id);
    node.lines = Math.round(number(raw.lines, 1, 64, 0));
    if (!node.lines) {
      if (before && before.kind === kind && before.text === node.text && before.width === node.width && before.size === node.size) node.lines = before.autoLines;
      if (!node.lines) {
        // Use the actual painted pixel width, including button text padding.
        const perLine = Math.max(1, Math.floor((node.width - (kind === 'button' ? 16 : 0)) / node.size));
        node.lines = node.text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0);
      }
      node.autoLines = node.lines;
    }
    box.h = number(raw.height, 1, 8192, node.lineHeight * node.lines);
    if (kind === 'button') {
      box.h = Math.max(48, number(raw.height, 48, 480, Math.max(64, node.lineHeight * node.lines + 16)));
      node.disabled = raw.disabled === true;
      node.background = node.disabled ? '#34373d' : tone(raw, false);
      if (node.disabled) node.color = '#999999';
      node.radius = number(raw.radius, 0, 80, 32);
    }
    if (kind === 'switch' || kind === 'slider' || kind === 'progress') {
      if (w < 160) throw new Error(kind + ' 需要至少 160px 宽度');
      node.background = background(raw, '#24262a');
      node.radius = number(raw.radius, 0, 80, 32);
      node.accent = color(raw.accent, kind === 'progress' ? color(raw.color, '#0d6eff') : '#0d6eff');
      node.trackColor = color(raw.trackColor, '#3b3e44');
      node.thumbColor = color(raw.thumbColor, '#ffffff');
      node.detail = text(raw.detail);
      node.detailColor = color(raw.detailColor, '#999999');
      node.copyWidth = Math.max(40, w - 110);
      node.checked = !!raw.checked;
      node.min = number(raw.min, -100000, 100000, 0);
      node.max = Math.max(node.min, number(raw.max, -100000, 100000, 100));
      node.step = number(raw.step, 0.01, 100000, 1);
      node.value = number(raw.value, node.min, node.max, node.min);
      node.percent = Math.round(number(raw.percent, 0, 100, 0));
      box.h = number(raw.height, kind === 'switch' && node.detail ? 94 : 80, 480, kind === 'slider' ? 100 : kind === 'progress' ? 90 : node.detail ? 94 : 80);
    }
    return box;
  }

  function emit(root, left, topPosition) {
    const frames = [{ box: root, left, topPosition }];
    while (frames.length) {
      const frame = frames.pop();
      const box = frame.box;
      const x = Math.round(frame.left);
      const y = Math.round(frame.topPosition);
      if (box.children) {
        if (box.background !== 'transparent') add({ id: box.id, kind: 'background', x, y, width: Math.round(box.w), height: Math.ceil(box.h), background: box.background, radius: box.radius });
        for (let i = box.children.length - 1; i >= 0; i -= 1) {
          const child = box.children[i];
          frames.push({ box: child, left: frame.left + child.x, topPosition: frame.topPosition + child.y });
        }
      } else if (box.kind !== 'spacer') {
        let node = box.node;
        if (node.x !== x || node.y !== y || node.height !== Math.ceil(box.h)) {
          // A fresh measurement is private to this compilation. Only cache hits
          // share nodes with a prior frame and need a copy before moving them.
          if (cache && cache[box.id] && node === cache[box.id].node) node = Object.assign({}, node);
          node.x = x; node.y = y; node.height = Math.ceil(box.h);
        }
        const paintedNode = add(node);
        if (box.cached && (box.cached.width !== box.w || box.cached.height !== box.h || box.cached.node !== paintedNode)) {
          // Keep previous cache entries valid even if a later node fails to
          // compile. Store the canonical reused node, not an equal new object.
          const entry = cache && box.cached === cache[box.id] ? Object.assign({}, box.cached) : box.cached;
          entry.width = box.w; entry.height = box.h; entry.node = paintedNode;
          nextCache[box.id] = entry;
        }
      }
    }
  }
  function add(node) {
    const aligned = previous && previous[nodes.length];
    const before = aligned && aligned.id === node.id ? aligned : previousNode(node.id);
    const result = before === node || sameNode(before, node) ? before : node;
    nodes.push(result);
    return result;
  }
  const roots = list(source);
  let y = top;
  roots.forEach((raw, i) => {
    if (raw == null || raw === false) return;
    const box = measure(raw, 324, String(i));
    emit(box, 6, y);
    y += box.h + 10;
  });
  return { nodes, handlers, height: Math.max(480, Math.ceil(y + 14)), end: y, count, cache: nextCache };
}

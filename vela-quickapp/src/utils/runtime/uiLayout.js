// Layout groups are JS-only. Only painted leaves/backgrounds reach the ViewModel.
export const UI_LIMITS = { nodes: 40, depth: 4, painted: 160, qrcodes: 2 };

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
function tone(raw, grid) {
  const colors = grid ? { primary: '#1769d2', success: '#16845b', warning: '#a55d16', danger: '#b93838' }
    : { primary: '#0d6eff', neutral: '#34373d', danger: '#d94343' };
  return background(raw, colors[raw.tone] || (grid ? '#292c31' : '#0d6eff'));
}

// All emitted fields are primitives: cheap comparison, no JSON serialization or
// deep observation of callbacks, render factories, or the original layout tree.
export function sameNode(a, b) {
  if (!a || !b) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (let i = 0; i < keys.length; i += 1) if (a[keys[i]] !== b[keys[i]]) return false;
  return true;
}

export function compileUi(source, top, previous, cache) {
  const nodes = [];
  const handlers = Object.create(null);
  const ids = Object.create(null);
  const old = Object.create(null);
  const nextCache = Object.create(null);
  (previous || []).forEach(node => { old[node.id] = node; });
  let count = 0;
  let qrCount = 0;
  let painted = 0;

  function reservePainted() {
    if (++painted > UI_LIMITS.painted) throw new Error('UI 展开后最多 160 个绘制节点，请减少网格');
  }

  function identity(raw, path) {
    const id = raw.id == null ? '$' + path : String(raw.id);
    if (!id || id.length > 56 || (raw.id != null && id.charAt(0) === '$')) throw new Error('UI id 需为 1–56 字符，不能以 $ 开头');
    if (ids[id]) throw new Error('UI id 重复：' + id);
    ids[id] = true;
    return id;
  }

  function measure(input, available, path, depth, forcedWidth, generated, gridCell) {
    if (!gridCell && ++count > UI_LIMITS.nodes) throw new Error('UI 最多 40 个节点（含布局），请分页');
    if (depth > UI_LIMITS.depth) throw new Error('UI 布局最多嵌套 4 层');
    const raw = input && typeof input === 'object' ? input : { kind: 'text', text: input };
    const id = generated || identity(raw, path);
    if (generated) {
      if (ids[id]) throw new Error('UI id 重复：' + id);
      ids[id] = true;
    }
    const kind = raw.kind || 'text';
    const w = forcedWidth == null ? widthOf(raw.width, available, available) : forcedWidth;
    const box = { id, kind, w, h: 0, raw };
    if (kind === 'row' || kind === 'column' || kind === 'stack' || kind === 'buttonRow' || kind === 'grid') {
      box.background = background(raw, 'transparent');
      if (box.background !== 'transparent') reservePainted();
      const padding = number(raw.padding, 0, Math.min(48, (w - 1) / 2), 0);
      const inner = w - padding * 2;
      const gap = number(raw.gap, 0, 48, kind === 'grid' || kind === 'buttonRow' ? 6 : 8);
      let children = list(kind === 'buttonRow' ? raw.buttons : kind === 'grid' ? raw.items : raw.children);
      if (kind === 'buttonRow' && children.length > 4) throw new Error('buttonRow 最多 4 个按钮');
      const columns = Math.round(number(raw.columns, 2, 4, 4));
      if (kind === 'grid' && children.length > columns * 9) throw new Error('grid 最多 9 行');
      // Check before walking/filtering huge arrays or a cycle.
      if (children.length > (kind === 'grid' ? 36 : UI_LIMITS.nodes)) throw new Error('UI 子节点过多，请分页');
      children = children.filter(child => child != null && child !== false);
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
      box.children = children.map((child, i) => {
        let item = child;
        let childWidth;
        let generatedId;
        if (horizontal) childWidth = widths[i] == null ? remaining * number(child && child.flex, 0.1, 100, 1) / weight : widths[i];
        if (kind === 'grid') {
          const cell = child && typeof child === 'object' ? child : { text: child };
          item = Object.assign({}, cell, { kind: 'text', text: text(cell.text).slice(0, 8), size: number(cell.size, 16, 30, 24),
            align: 'center', bold: true, lines: 1, height: number(raw.cellHeight, 44, 72, 52), background: tone(cell, true), radius: 12 });
          childWidth = (inner - gap * (columns - 1)) / columns;
          generatedId = id + '/cell/' + i;
        } else if (kind === 'buttonRow') {
          const button = child && typeof child === 'object' ? child : { text: child };
          item = Object.assign({}, button, { kind: 'button', text: text(button.text).slice(0, 8), height: 60 });
          // Explicit button IDs are honored and validated, unlike v1.
          if (button.id == null) generatedId = id + '/button/' + i;
        }
        const measured = measure(item, inner, path + '.' + i, depth + (generatedId || kind === 'buttonRow' ? 0 : 1), childWidth, generatedId, kind === 'grid');
        return measured;
      });
      let natural = 0;
      if (horizontal) box.children.forEach(child => { natural = Math.max(natural, child.h); });
      else if (kind === 'grid') natural = Math.ceil(children.length / columns) * (number(raw.cellHeight, 44, 72, 52) + gap) - (children.length ? gap : 0);
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
      return box;
    }

    if (kind === 'spacer') { box.h = number(raw.size, 0, 480, 12); return box; }
    reservePainted();
    if (kind === 'qrcode' && ++qrCount > UI_LIMITS.qrcodes) throw new Error('同屏最多 2 个二维码');
    if (kind === 'button' && typeof raw.onPress === 'function') handlers[id] = raw.onPress;
    if ((kind === 'switch' || kind === 'slider') && typeof raw.onChange === 'function') handlers[id] = raw.onChange;
    // Cache only leaf inputs, never factories or callbacks. The next cache is
    // bounded by this render, so disappearing IDs do not accumulate in memory.
    const cached = cache && cache[id];
    let matched = !!cached && cached.availableWidth === w;
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
    const inputCopy = {};
    for (const key in raw) { if (key !== 'onPress' && key !== 'onChange') inputCopy[key] = raw[key]; }
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
    const before = old[id];
    node.lines = Math.round(number(raw.lines, 1, 64, 0));
    if (!node.lines) {
      if (before && before.text === node.text && before.width === node.width && before.size === node.size) node.lines = before.autoLines;
      if (!node.lines) {
        const perLine = Math.max(1, Math.floor((w - (kind === 'button' ? 16 : 0)) / node.size));
        node.lines = node.text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0);
      }
      node.autoLines = node.lines;
    }
    box.h = number(raw.height, 1, 8192, node.lineHeight * node.lines);
    if (kind === 'button') {
      box.h = Math.max(48, number(raw.height, 48, 480, Math.max(64, node.lineHeight * node.lines + 16)));
      node.background = tone(raw, false);
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

  function emit(box, left, topPosition) {
    const x = Math.round(left);
    const y = Math.round(topPosition);
    if (box.children) {
      if (box.background !== 'transparent') add({ id: box.id, kind: 'background', x, y, width: Math.round(box.w), height: Math.ceil(box.h), background: box.background, radius: box.radius });
      box.children.forEach(child => emit(child, left + child.x, topPosition + child.y));
    } else if (box.kind !== 'spacer') {
      let node = box.node;
      if (node.x !== x || node.y !== y || node.height !== Math.ceil(box.h)) {
        node = Object.assign({}, node, { x, y, height: Math.ceil(box.h) });
      }
      if (box.cached) { box.cached.width = box.w; box.cached.height = box.h; box.cached.node = node; }
      add(node);
    }
  }
  function add(node) {
    if (nodes.length >= UI_LIMITS.painted) throw new Error('UI 展开后最多 160 个绘制节点，请减少网格');
    nodes.push(old[node.id] === node || sameNode(old[node.id], node) ? old[node.id] : node);
  }
  const roots = list(source);
  if (roots.length > UI_LIMITS.nodes) throw new Error('UI 最多 40 个节点，请分页');
  let y = top;
  roots.forEach((raw, i) => {
    if (raw == null || raw === false) return;
    const box = measure(raw, 324, String(i), 0);
    emit(box, 6, y);
    y += box.h + 10;
  });
  return { nodes, handlers, height: Math.max(480, Math.ceil(y + 14)), end: y, count, cache: nextCache };
}

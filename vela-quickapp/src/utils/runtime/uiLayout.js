import { SCREEN } from '../core/screen.js';

// Layout groups are JS-only. Only painted leaves/backgrounds reach the ViewModel.
// Guidance for watch-sized screens, not limits enforced by the compiler.
export const UI_PERFORMANCE_GUIDE = { declarations: 40, paintedNodes: 160, depth: 4, qrcodes: 2 };

export function getUiWidth() { return SCREEN.contentWidth; }

export function number(value, min, max, fallback) {
  if (value === undefined || value === null) return fallback;
  const result = Number(value);
  return isFinite(result) ? Math.min(max, Math.max(min, result)) : fallback;
}

export function text(value) {
  return String(value == null ? '' : value);
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
// Geometry belongs to an accepted compilation, not to mutable script objects.
// Weak keys release it together with the existing leaf cache on session exit.
const groupCaches = new WeakMap();
const GROUP_INPUTS = ['height', 'padding', 'gap', 'columns', 'cellHeight', 'align', 'justify'];
function primitive(value) { return value === null || (typeof value !== 'object' && typeof value !== 'function'); }
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

export function compileUi(source, top, previous, cache, resolveNode) {
  const nodes = [];
  const handlers = Object.create(null);
  const ids = Object.create(null);
  let old = null;
  const nextCache = Object.create(null);
  const groups = cache && groupCaches.get(cache);
  const nextGroups = Object.create(null);
  let count = 0;
  let placed = [], stablePlacement = true;

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
      return cached.box;
    }
    const input = { text: value, size: sizeInput, lineHeight: lineInput, color: colorInput, background: bgInput, tone: toneInput };
    const oldNode = cached && cached.node;
    const size = before && sizeInput === before.size ? oldNode.size : number(sizeInput, 16, 30, 24);
    const node = {
      id, kind: 'text', width: Math.round(w),
      background: before && bgInput === before.background && toneInput === before.tone ? oldNode.background : tone(input, true),
      radius: 12,
      text: before && value === before.text ? oldNode.text : text(value),
      color: before && colorInput === before.color ? oldNode.color : color(colorInput, '#ffffff'),
      size, align: 'center', bold: 'bold',
      lineHeight: before && lineInput === before.lineHeight && size === oldNode.size
        ? oldNode.lineHeight : number(lineInput, size, 64, Math.max(size + 4, 32)),
      lines: 1, x: oldNode && oldNode.x, y: oldNode && oldNode.y, height: h
    };
    let cacheable = true;
    for (const key in input) {
      if (input[key] !== null && (typeof input[key] === 'object' || typeof input[key] === 'function')) cacheable = false;
    }
    const box = { id, kind: 'text', w, h, node };
    const next = { grid: true, availableWidth: w, width: w, height: h, input: cacheable ? input : null, node, box };
    nextCache[id] = next;
    return box;
  }

  function finishLayout(box, layout) {
    const { padding, cached, stack } = layout;
    // Child positions are owned by the group, so unchanged leaf boxes can be
    // shared even when an ancestor moves. Recheck dimensions and order first.
    const positions = cached && cached.positions;
    let matched = !!positions && positions.length === box.children.length * 4;
    for (let i = 0; matched && i < box.children.length; i += 1) {
      const child = box.children[i], index = i * 4;
      matched = child.id === cached.childIds[i] && child.w === positions[index] && child.h === positions[index + 1] &&
        (!stack || (stack[i * 2] + padding === positions[index + 2] && stack[i * 2 + 1] + padding === positions[index + 3]));
    }
    if (matched) {
      box.h = cached.height;
      box.positions = positions;
    } else {
      stablePlacement = false;
      placeChildren(box, layout);
    }
    const geometry = layout.geometry;
    nextGroups[box.id] = matched && cached.allocation === geometry.allocation ? cached
      : Object.assign({}, geometry, { height: box.h, positions: box.positions, childIds: box.children.map(child => child.id) });
  }

  function placeChildren(box, layout) {
    const { raw, kind, padding, inner, gap, columns, cellHeight, horizontal, children, stack } = layout;
    let natural = 0, usedWidth = gap * Math.max(0, children.length - 1);
    if (horizontal) box.children.forEach(child => { natural = Math.max(natural, child.h); usedWidth += child.w; });
    else if (kind === 'grid') natural = Math.ceil(children.length / columns) * (cellHeight + gap) - (children.length ? gap : 0);
    else if (kind === 'stack') box.children.forEach((child, i) => { natural = Math.max(natural, child.h + stack[i * 2 + 1]); });
    else box.children.forEach((child, i) => { natural += child.h + (i ? gap : 0); });
    box.h = Math.ceil(Math.max(natural + padding * 2, number(raw.height, 0, 8192, natural + padding * 2)));
    const extra = Math.max(0, box.h - padding * 2 - natural);
    let cursor = padding + (!horizontal && kind === 'column' ? offset(raw.justify, extra) : 0);
    // Intrinsic leaves such as QR codes may shrink after width allocation.
    const freeX = horizontal ? Math.max(0, inner - usedWidth) : 0;
    if (horizontal) cursor += offset(raw.justify, freeX);
    const between = raw.justify === 'between' && children.length > 1 ? (horizontal ? freeX : extra) / (children.length - 1) : 0;
    box.positions = [];
    box.children.forEach((child, i) => {
      let x = horizontal ? cursor : padding + offset(raw.align, inner - child.w);
      let y = horizontal ? padding + offset(raw.align, box.h - padding * 2 - child.h) : cursor;
      if (kind === 'grid') { x = padding + (i % columns) * (child.w + gap); y = padding + Math.floor(i / columns) * (child.h + gap); }
      if (kind === 'stack') { x = padding + stack[i * 2]; y = padding + stack[i * 2 + 1]; }
      box.positions.push(child.w, child.h, x, y);
      cursor += (horizontal ? child.w : child.h) + gap + between;
    });
  }

  // Explicit enter/exit frames keep layout depth independent of the JS call stack.
  // Only ancestors are tracked: the same descriptor can be reused in siblings.
  function measure(input, available, path, forcedWidth, generated) {
    const active = new Set();
    const frames = [{ input, available, path, forcedWidth, generated, parent: null, index: 0 }];
    let rootBox = null;
    function attach(frame, box, raw) {
      if (frame.parent) frame.parent.children[frame.index] = box;
      else rootBox = box;
      if (frame.stack) {
        frame.stack[frame.index * 2] = number(raw.x, 0, Math.max(0, frame.available - box.w), 0);
        frame.stack[frame.index * 2 + 1] = number(raw.y, 0, 4096, 0);
      }
    }
    while (frames.length) {
      const frame = frames.pop();
      if (frame.exit) {
        finishLayout(frame.box, frame.layout);
        active.delete(frame.raw);
        attach(frame, frame.box, frame.raw);
        continue;
      }
      let raw = frame.input && typeof frame.input === 'object' ? frame.input : { kind: 'text', text: frame.input };
      if (resolveNode) raw = resolveNode(raw);
      if (active.has(raw)) throw new Error('UI 布局不能循环引用');
      count += 1;
      const id = frame.generated || identity(raw, frame.path);
      if (frame.generated) {
        if (ids[id]) throw new Error('UI id 重复：' + id);
        ids[id] = true;
      }
      const kind = raw.kind || 'text';
      const w = frame.forcedWidth == null ? widthOf(raw.width, frame.available, frame.available) : frame.forcedWidth;
      if (kind !== 'row' && kind !== 'column' && kind !== 'stack' && kind !== 'buttonRow' && kind !== 'grid') {
        const box = measureLeaf(raw, id, kind, w);
        // Reserve the same integer height that the native node will paint.
        if (box.h !== Math.ceil(box.h)) box.h = Math.ceil(box.h);
        if (kind !== 'spacer') placed.push(box);
        attach(frame, box, raw);
        continue;
      }
      active.add(raw);
      const box = { id, kind, w, h: 0 };
      box.background = background(raw, 'transparent');
      box.radius = number(raw.radius, 0, 80, 0);
      if (box.background !== 'transparent') placed.push(box);
      let cached = groups && groups[id];
      if (cached && (cached.kind !== kind || cached.w !== w || !cached.input)) cached = null;
      for (let i = 0; cached && i < GROUP_INPUTS.length; i += 1) {
        if (raw[GROUP_INPUTS[i]] !== cached.input[i]) cached = null;
      }
      let geometry = cached;
      if (!geometry) {
        const values = GROUP_INPUTS.map(key => raw[key]);
        const padding = number(raw.padding, 0, Math.min(48, (w - 1) / 2), 0);
        geometry = { kind, w, input: values.every(primitive) ? values : null, padding, inner: w - padding * 2,
          gap: number(raw.gap, 0, 48, kind === 'grid' || kind === 'buttonRow' ? 6 : 8),
          columns: Math.round(number(raw.columns, 2, 4, 4)),
          cellHeight: kind === 'grid' ? Math.ceil(number(raw.cellHeight, 44, 72, 52)) : 0 };
      }
      const { padding, inner, gap, columns, cellHeight } = geometry;
      const children = list(kind === 'buttonRow' ? raw.buttons : kind === 'grid' ? raw.items : raw.children)
        .filter(child => child != null && child !== false);
      const cellWidth = (inner - gap * (columns - 1)) / columns;
      if (kind === 'grid' && children.length && cellWidth < 1) throw new Error('grid 宽度不足：减小 columns、padding 或 gap');
      const horizontal = kind === 'row' || kind === 'buttonRow';
      let allocation = geometry.allocation;
      if (horizontal) {
        let matched = !!allocation && !!allocation.input && allocation.widths.length === children.length;
        for (let i = 0; matched && i < children.length; i += 1) {
          const item = children[i] && typeof children[i] === 'object' ? children[i] : {};
          matched = item.width === allocation.input[i * 2] && (item.width == null ? item.flex : undefined) === allocation.input[i * 2 + 1];
        }
        if (!matched) {
          let remaining = inner - gap * Math.max(0, children.length - 1), weight = 0;
          const widths = [], values = [];
          children.forEach((child, i) => {
            const item = child && typeof child === 'object' ? child : {};
            values.push(item.width, item.width == null ? item.flex : undefined);
            if (item.width != null) { widths[i] = widthOf(item.width, inner, inner); remaining -= widths[i]; }
            else { widths[i] = null; weight += number(item.flex, 0.1, 100, 1); }
          });
          if (remaining < 0) throw new Error('row 宽度不足：减小 width、padding 或 gap');
          children.forEach((child, i) => {
            if (widths[i] == null) widths[i] = remaining * number(child && child.flex, 0.1, 100, 1) / weight;
            if (widths[i] < 1) throw new Error('row 子项宽度不足：调整 flex、width、padding 或 gap');
          });
          allocation = { widths, input: values.every(primitive) ? values : null };
          geometry = Object.assign({}, geometry, { allocation });
        }
      }
      box.children = new Array(children.length);
      const stack = kind === 'stack' ? [] : null;
      const layout = { raw, kind, padding, inner, gap, columns, cellHeight, horizontal, children, cached, geometry, stack };
      frames.push({ exit: true, box, layout, raw, parent: frame.parent, index: frame.index, available: frame.available, stack: frame.stack });
      if (kind === 'grid') {
        children.forEach((child, i) => {
          const cell = child && typeof child === 'object' ? child : { text: child };
          box.children[i] = measureGridCell(cell, cellWidth, cellHeight, id + '/cell/' + i);
          placed.push(box.children[i]);
        });
        continue;
      }
      for (let i = children.length - 1; i >= 0; i -= 1) {
        const child = children[i];
        let item = child;
        let childWidth;
        let generatedId;
        if (horizontal) {
          childWidth = allocation.widths[i];
        }
        if (kind === 'buttonRow') {
          const button = child && typeof child === 'object' ? child : { text: child };
          item = Object.assign({}, button, { kind: 'button', text: text(button.text), height: 60 });
          if (button.id == null) generatedId = id + '/button/' + i;
        }
        // Compact the path when deeply nested, without limiting nesting itself.
        const childPath = frame.path.length < 48 ? frame.path + '.' + i : '#' + count + '.' + i;
        frames.push({ input: item, available: inner, path: childPath, forcedWidth: childWidth,
          generated: generatedId, parent: box, index: i, stack });
      }
    }
    return rootBox;
  }

  function measureLeaf(raw, id, kind, w) {
    if (kind === 'spacer') return { id, kind, w, h: number(raw.size, 0, 480, 12) };
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
      return cached.box;
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
    const box = { id, kind, w, h: 0, node };
    nextCache[id] = { availableWidth: w, input: inputCopy, keyCount, node, box };
    if (kind === 'divider') { box.h = number(raw.height, 1, 32, 2); node.background = color(raw.color, '#34373d'); return box; }
    if (kind === 'image' || kind === 'canvas') {
      node.src = text(raw.src);
      node.fit = raw.fit === undefined ? 'contain' : raw.fit;
      if (['contain', 'cover', 'none', 'scale-down'].indexOf(node.fit) < 0) throw new Error('图片 fit 无效：' + node.fit);
      const naturalHeight = kind === 'canvas' ? w * raw.pixelHeight / raw.pixelWidth : w;
      box.h = number(raw.height, 1, 8192, naturalHeight);
      return box;
    }
    if (kind === 'qrcode') {
      const value = String(raw.value == null ? '' : raw.value);
      if (!value) throw new Error('二维码内容不能为空');
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
    if (['heading', 'text', 'button', 'switch', 'slider', 'progress'].indexOf(kind) === -1) throw new Error('JSLab 版本可能过老，无法识别 UI 组件：' + kind + '。请更新客户端或重新导出独立应用；若已是最新版，请检查组件名称。');
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
        const geometry = nextGroups[box.id];
        if (geometry.left !== frame.left || geometry.top !== frame.topPosition) {
          nextGroups[box.id] = Object.assign({}, geometry, { left: frame.left, top: frame.topPosition });
        }
        if (box.background !== 'transparent') paint(box, x, y);
        for (let i = box.children.length - 1; i >= 0; i -= 1) {
          const child = box.children[i];
          frames.push({ box: child, left: frame.left + box.positions[i * 4 + 2], topPosition: frame.topPosition + box.positions[i * 4 + 3] });
        }
      } else if (box.kind !== 'spacer') {
        paint(box, x, y);
      }
    }
  }

  function paint(box, x, y) {
    if (box.children) {
      add({ id: box.id, kind: 'background', x, y, width: Math.round(box.w), height: box.h, background: box.background, radius: box.radius });
    } else {
      let node = box.node;
      if (node.x !== x || node.y !== y || node.height !== box.h) {
        // A fresh measurement is private to this compilation. Only cache hits
        // share nodes with a prior frame and need a copy before moving them.
        if (cache && cache[box.id] && node === cache[box.id].node) node = Object.assign({}, node);
        node.x = x; node.y = y; node.height = box.h;
      }
      const paintedNode = add(node);
      const cached = nextCache[box.id];
      if (cached && (cached.width !== box.w || cached.height !== box.h || cached.node !== paintedNode)) {
        // Keep previous cache entries valid even if a later node fails to
        // compile. Store the canonical reused node, not an equal new object.
        const entry = cache && cached === cache[box.id] ? Object.assign({}, cached) : cached;
        entry.width = box.w; entry.height = box.h; entry.node = paintedNode;
        entry.box = box.node === paintedNode ? box : Object.assign({}, box, { node: paintedNode });
        nextCache[box.id] = entry;
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
    placed = []; stablePlacement = true;
    const box = measure(raw, SCREEN.contentWidth, String(i));
    const before = box.children ? groups && groups[box.id] : cache && cache[box.id];
    const sameOrigin = before && (box.children ? before.left === SCREEN.side && before.top === y
      : before.width === box.w && before.height === box.h && before.node.x === SCREEN.side && before.node.y === Math.round(y));
    if (stablePlacement && sameOrigin) {
      // Measurement already visited leaves in paint order. With unchanged
      // geometry, reuse absolute coordinates without a second tree traversal.
      placed.forEach(item => {
        const entry = item.children ? groups[item.id] : cache[item.id];
        if (!item.children && item.node === entry.node && previous && previous[nodes.length] === item.node) nodes.push(item.node);
        else paint(item, item.children ? Math.round(entry.left) : entry.node.x, item.children ? Math.round(entry.top) : entry.node.y);
      });
    } else emit(box, SCREEN.side, y);
    y += box.h + 10;
  });
  groupCaches.set(nextCache, nextGroups);
  return { nodes, handlers, height: Math.max(SCREEN.height, Math.ceil(y + SCREEN.bottom)), end: y, count, cache: nextCache };
}

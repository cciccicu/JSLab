import { compileUi, text } from './uiLayout.js';

const nextTurn = Promise.resolve();
function node(kind, props, options) { return Object.assign({}, props, options || {}, { kind }); }

// Plain JS session: closures and handlers are never placed in reactive page data.
export function createUiSession(host) {
  let active = true;
  let queued = false;
  let rendering = false;
  let source = null;
  let hasSource = false;
  let nodes = [];
  let cache = null;
  let handlers = Object.create(null);

  function flush() {
    queued = false;
    if (!active || !hasSource) return;
    if (rendering) throw new Error('不要在 UI 渲染函数中更新状态');
    rendering = true;
    try {
      const view = typeof source === 'function' ? source() : source;
      const result = compileUi(view, host.top(), nodes, cache);
      cache = result.cache;
      const changed = nodes.length !== result.nodes.length || result.nodes.some((item, index) => item !== nodes[index]);
      // Refresh callbacks even when every painted field is unchanged.
      handlers = result.handlers;
      if (changed) nodes = result.nodes;
      host.publish(nodes, result.height, result.end, changed);
    } catch (error) { host.error(error); }
    rendering = false;
  }

  function refresh() {
    if (!active) return;
    if (rendering) throw new Error('不要在 UI 渲染函数中更新状态');
    if (queued) return;
    queued = true;
    nextTurn.then(() => { if (queued) flush(); });
  }

  const ui = {
    version: 2,
    render(view) {
      if (!active) return;
      if (rendering) throw new Error('不要在 UI 渲染函数中调用 ui.render');
      source = view;
      hasSource = true;
      flush();
    },
    refresh,
    setTitle(value) { if (active) host.title(text(value).slice(0, 10) || 'UI 应用'); },
    showHeader(visible) { if (active && host.header(visible !== false)) refresh(); },
    scrollTo(position) { if (active) host.scroll(position); },
    scrollTop() { if (active) host.scroll('top'); },
    scrollBottom() { if (active) host.scroll('bottom'); },
    signal(initial) {
      let value = initial;
      const state = {
        get() { return value; },
        set(next) {
          if (rendering) throw new Error('不要在 UI 渲染函数中更新 signal');
          if (value === next || (value !== value && next !== next)) return value;
          value = next;
          refresh();
          return value;
        },
        update(updater) { return state.set(typeof updater === 'function' ? updater(value) : updater); }
      };
      return state;
    },
    heading(value, options) { return node('heading', { text: value }, options); },
    text(value, options) { return node('text', { text: value }, options); },
    button(value, onPress, options) { return node('button', { text: value, onPress }, options); },
    switch(value, checked, onChange, options) { return node('switch', { text: value, checked, onChange }, options); },
    slider(value, amount, onChange, options) { return node('slider', { text: value, value: amount, onChange }, options); },
    progress(value, percent, options) { return node('progress', { text: value, percent }, options); },
    grid(items, options) { return node('grid', { items }, options); },
    buttonRow(buttons, options) { return node('buttonRow', { buttons }, options); },
    divider(options) { return node('divider', {}, options); },
    spacer(size) { return node('spacer', { size }); },
    row(children, options) { return node('row', { children }, options); },
    column(children, options) { return node('column', { children }, options); },
    stack(children, options) { return node('stack', { children }, options); },
    qrcode(value, options) { return node('qrcode', { value }, options); }
  };

  return {
    ui,
    refresh,
    invoke(id, value) {
      if (!active || typeof handlers[id] !== 'function') return false;
      try {
        const result = handlers[id](value);
        if (result && typeof result.then === 'function') result.then(null, error => { if (active) host.error(error); });
      } catch (error) { if (active) host.error(error); }
      return true;
    },
    dispose() { active = false; queued = false; source = null; nodes = []; cache = null; handlers = Object.create(null); }
  };
}

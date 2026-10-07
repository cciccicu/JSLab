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
  let forcePublish = false;
  let visible = true;
  let dirty = false;
  let hasFrame = false;
  let frameHeight = 480;
  let frameEnd = 102;

  function flush() {
    queued = false;
    if (!active || !hasSource) return;
    if (rendering) throw new Error('不要在 UI 渲染函数中更新状态');
    rendering = true;
    try {
      const view = typeof source === 'function' ? source() : source;
      const result = compileUi(view, host.top(), nodes, cache);
      const changed = forcePublish || nodes.length !== result.nodes.length || result.nodes.some((item, index) => item !== nodes[index]);
      if (visible) host.publish(changed ? result.nodes : nodes, result.height, result.end, changed);
      // Commit only after the host accepts the frame. A failed/partial publish
      // must remain retryable even if the next view matches the old snapshot.
      cache = result.cache;
      // Refresh callbacks even when every painted field is unchanged.
      handlers = result.handlers;
      if (changed) nodes = result.nodes;
      hasFrame = true;
      frameHeight = result.height;
      frameEnd = result.end;
      dirty = false;
      forcePublish = !visible;
      return true;
    } catch (error) { forcePublish = true; host.error(error); }
    finally { rendering = false; }
  }

  function refresh() {
    if (!active) return;
    if (rendering) throw new Error('不要在 UI 渲染函数中更新状态');
    dirty = true;
    if (!visible) return;
    if (queued) return;
    queued = true;
    nextTurn.then(() => { if (queued && visible) flush(); else queued = false; });
  }

  const ui = {
    version: 2,
    render(view) {
      if (!active) return false;
      if (rendering) throw new Error('不要在 UI 渲染函数中调用 ui.render');
      if (host.clearError) host.clearError();
      // Snapshot only explicit submissions; ordinary signal refresh stays lean.
      const previous = { source, hasSource, nodes, cache, handlers, hasFrame, frameHeight, frameEnd, dirty, visible };
      source = view;
      hasSource = true;
      let success = flush();
      if (success && host.show) {
        try { success = host.show() !== false; }
        catch (error) { host.error(error); success = false; }
      }
      if (!success) {
        source = previous.source; hasSource = previous.hasSource;
        nodes = previous.nodes; cache = previous.cache; handlers = previous.handlers;
        hasFrame = previous.hasFrame; frameHeight = previous.frameHeight; frameEnd = previous.frameEnd;
        dirty = previous.dirty; visible = previous.visible; forcePublish = true;
        // Restore a previous accepted frame after a partially rejected publish.
        if (visible && hasFrame) {
          try { host.publish(nodes, frameHeight, frameEnd, true); forcePublish = false; }
          catch (error) { host.error(error); }
        }
        if (dirty && visible && hasSource) refresh();
      }
      return !!success;
    },
    show() { if (!active || !hasFrame) return false; return host.show ? host.show() !== false : true; },
    hide() { if (active && host.hide) host.hide(); },
    refresh,
    setTitle(value) { if (active) host.title(text(value).slice(0, 80) || '脚本'); },
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
    hasFrame() { return hasFrame; },
    setVisible(value) {
      const next = value !== false;
      if (!active) return false;
      if (visible === next && !(next && forcePublish)) return true;
      visible = next;
      if (visible && hasFrame) {
        forcePublish = true;
        if (dirty) return flush();
        try { host.publish(nodes, frameHeight, frameEnd, true); forcePublish = false; return true; }
        catch (error) { host.error(error); return false; }
      }
      return true;
    },
    invoke(id, value) {
      if (!active || !visible || typeof handlers[id] !== 'function') return false;
      try {
        if (host.clearError && host.clearError()) refresh();
        const result = handlers[id](value);
        if (result && typeof result.then === 'function') result.then(null, error => { if (active) host.error(error); });
      } catch (error) { if (active) host.error(error); }
      return true;
    },
    dispose() { active = false; queued = false; source = null; nodes = []; cache = null; handlers = Object.create(null); }
  };
}

import { decodeImage, imageFormat, encodePng } from './bitmapCodec.js';
import { createCanvasSurface } from './canvasSurface.js';

// Session-owned resources shared by image and canvas. Resolvers produce plain
// display descriptors; codecs, drawing methods and buffers never enter nodes.
export function createUiMedia(host) {
  let active = true, sequence = 0;
  const prefix = 'internal://cache/jslab-ui-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-';
  const owned = new Map(), images = new Map(), canvases = new Map(), frames = new Map();
  let sources = new Map(), nextSources = new Map();
  let requested = new Set();
  function check(readOnly) {
    if (!active) throw new Error('当前脚本已退出，不能再操作画布');
    if (!readOnly && host.rendering()) throw new Error('不要在 UI 渲染函数中创建或修改画布，请在渲染函数外操作');
  }
  function remove(uri) {
    const resource = owned.get(uri);
    if (!resource || resource.deleting) return;
    resource.deleting = true;
    const fail = (message, code) => {
      // Keep failed deletes eligible for the next collection or session exit.
      resource.deleting = false;
      if (active && code !== 301 && !resource.warned) {
        resource.warned = true;
        host.error(new Error('清理图片缓存失败（' + code + '）：' + message));
      }
    };
    try { host.files.delete({ uri, success: () => owned.delete(uri), fail }); }
    catch (error) { fail(error.message); }
  }
  function collect() {
    const keep = new Set();
    canvases.forEach(state => keep.add(state.src));
    images.forEach(entry => keep.add(entry.src));
    frames.forEach(frame => { keep.add(frame.src); keep.add(frame.retired); });
    owned.forEach((entry, uri) => { if (!entry.writing && !keep.has(uri)) remove(uri); });
  }
  function ready(uri) { const entry = owned.get(uri); if (entry) entry.writing = false; }
  function write(buffer, format) {
    return Promise.resolve(host.mediaReady).then(() => new Promise((resolve, reject) => {
      if (!active) { reject(new Error('当前脚本已退出')); return; }
      if (!host.files || typeof host.files.writeArrayBuffer !== 'function' || typeof host.files.delete !== 'function') {
        reject(new Error('当前设备无法写入图片缓存')); return;
      }
      const uri = prefix + (++sequence) + '.' + format;
      owned.set(uri, { writing: true, deleting: false });
      const fail = (message, code) => {
        ready(uri); remove(uri);
        reject(new Error('写入图片失败' + (code === undefined ? '' : '（' + code + '）') + '：' + message));
      };
      try {
        host.files.writeArrayBuffer({ uri, buffer, append: false, success: () => {
          if (!active) { ready(uri); remove(uri); reject(new Error('当前脚本已退出')); }
          else resolve(uri);
        }, fail });
      } catch (error) { fail(error.message); }
    }));
  }
  function submit(state) {
    const revision = state.revision;
    if (state.pending.has(revision)) return state.pending.get(revision);
    if (state.submitted === revision) return Promise.resolve();
    // Encoding now snapshots exactly this call's pixels, before asynchronous I/O.
    const bytes = encodePng(state.width, state.height, state.pixels);
    const ticket = ++state.sequence;
    const pending = write(bytes, 'png').then(uri => {
      if (!active) { ready(uri); remove(uri); state.pending.delete(revision); throw new Error('当前脚本已退出'); }
      if (ticket > state.committed) { state.src = uri; state.submitted = revision; state.committed = ticket; }
      ready(uri); state.pending.delete(revision); collect();
    }, error => { state.pending.delete(revision); throw error; });
    state.pending.set(revision, pending);
    return pending;
  }
  function resolveImage(raw) {
    const sourceInput = raw.source, formatInput = raw.format;
    // Key by the original string, so warm refreshes never scan Base64 again.
    // Retain only sources used in the latest accepted frame. Object-valued
    // formats still need coercion on each refresh for mutable old scripts.
    const cacheable = formatInput === null || (typeof formatInput !== 'object' && typeof formatInput !== 'function');
    const variants = nextSources.get(sourceInput) || sources.get(sourceInput);
    let parsed = cacheable && variants && variants.get(formatInput);
    if (!parsed) {
      if (typeof sourceInput !== 'string' || !sourceInput.trim()) throw new Error('图片 source 必须是非空字符串');
      const source = sourceInput.trim();
      if (!/^data:/i.test(source) && formatInput === undefined) parsed = { src: source };
      else {
        const data = /^data:image\/(png|jpe?g);base64,([\s\S]+)$/i.exec(source);
        if (/^data:/i.test(source) && !data) throw new Error('图片 Data URI 目前支持 PNG/JPG Base64');
        const format = imageFormat(data ? data[1] : formatInput);
        const encoded = (data ? data[2] : source).replace(/\s/g, '');
        const key = format + ':' + encoded;
        let entry = images.get(key);
        if (!entry) { entry = { key, encoded, format, src: '', started: false }; images.set(key, entry); }
        parsed = { entry };
      }
    }
    if (cacheable) {
      let next = nextSources.get(sourceInput);
      if (!next) { next = new Map(); nextSources.set(sourceInput, next); }
      next.set(formatInput, parsed);
    }
    const descriptor = Object.assign({}, raw);
    delete descriptor.source; delete descriptor.format;
    if (parsed.entry) requested.add(parsed.entry.key);
    descriptor.src = parsed.entry ? parsed.entry.src : parsed.src;
    return descriptor;
  }
  function resolveCanvas(raw) {
    const state = canvases.get(raw);
    if (!state) throw new Error('Canvas 实例无效，请使用 ui.canvas(options) 创建');
    return Object.assign({}, raw, { src: state.src });
  }
  // New resource-backed node types can add a resolver without changing the
  // drawing engine or the existing primitive component constructors.
  const resolvers = { image: resolveImage, canvas: resolveCanvas };
  return {
    canvas(options) {
      check();
      const result = createCanvasSurface(options, { check, color: host.color, submit });
      canvases.set(result.canvas, result.state);
      return result.canvas;
    },
    begin() { requested = new Set(); nextSources = new Map(); },
    resolve(raw) { return Object.prototype.hasOwnProperty.call(resolvers, raw.kind) ? resolvers[raw.kind](raw) : raw; },
    commit() {
      sources = nextSources;
      images.forEach((entry, key) => { if (!requested.has(key)) images.delete(key); });
      images.forEach(entry => {
        if (entry.started) return;
        entry.started = true;
        Promise.resolve().then(() => {
          if (!active || images.get(entry.key) !== entry) return;
          return write(decodeImage(entry.encoded, entry.format), entry.format).then(uri => {
            if (active && images.get(entry.key) === entry) { entry.src = uri; host.refresh(); }
            ready(uri); collect();
          });
        }).then(null, error => { if (active && images.get(entry.key) === entry) host.error(error); });
      });
      collect();
    },
    present(nodes) {
      const current = new Set();
      nodes.forEach(node => {
        if (node.kind !== 'image' && node.kind !== 'canvas') return;
        current.add(node.id);
        let frame = frames.get(node.id);
        if (!frame) { frame = { src: '', retired: '' }; frames.set(node.id, frame); }
        if (frame.src !== node.src) {
          // Retain one prior image while native loading finishes. Superseded
          // intermediate frames must not pile up when load callbacks are late.
          if (frame.src && !frame.retired) frame.retired = frame.src;
          frame.src = node.src;
        }
      });
      frames.forEach((frame, id) => { if (!current.has(id)) frames.delete(id); });
      collect();
    },
    loaded(id, src) {
      const frame = frames.get(id);
      if (frame && frame.src === src) { frame.retired = ''; collect(); }
    },
    dispose() {
      active = false;
      canvases.forEach(state => { state.pixels = null; state.src = ''; });
      canvases.clear(); images.clear(); frames.clear(); requested.clear();
      sources.clear(); nextSources.clear();
      collect();
    }
  };
}

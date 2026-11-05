// Stateful drawing lives outside the ViewModel. The public object remains a
// regular UI node; drawing methods are non-enumerable and pixel dimensions fixed.
function coordinate(value, name) {
  if (typeof value !== 'number' || !isFinite(value)) throw new Error('Canvas ' + name + ' 必须是有限数值');
  return Math.round(value);
}

export function createCanvasSurface(options, services) {
  const separate = options.pixelWidth !== undefined || options.pixelHeight !== undefined;
  const widthKey = separate ? 'pixelWidth' : 'width', heightKey = separate ? 'pixelHeight' : 'height';
  const width = coordinate(options[widthKey], widthKey), height = coordinate(options[heightKey], heightKey);
  if (width < 1 || height < 1 || width !== options[widthKey] || height !== options[heightKey]) throw new Error('Canvas ' + widthKey + '、' + heightKey + ' 必须是正整数');
  const state = { width, height, pixels: new Uint8Array(width * height * 4), revision: 0, submitted: -1, src: '', pending: new Map(), sequence: 0, committed: 0 };
  const canvas = Object.assign({}, options, { kind: 'canvas', pixelWidth: width, pixelHeight: height });
  let uniformColor = 0, uniformRevision = 0;
  function check(readOnly) { services.check(readOnly); }
  function rgba(value) {
    const normalized = services.color(value, '');
    if (!normalized) throw new Error('Canvas 颜色无效：' + value);
    if (normalized[0] === '#') return [parseInt(normalized.slice(1, 3), 16), parseInt(normalized.slice(3, 5), 16), parseInt(normalized.slice(5, 7), 16), 255];
    const parts = normalized.slice(normalized.indexOf('(') + 1, -1).split(',').map(Number);
    return [parts[0], parts[1], parts[2], parts.length === 4 ? Math.round(parts[3] * 255) : 255];
  }
  function pixelColor(value) {
    if (!Array.isArray(value)) return rgba(value);
    if (value.length !== 4) throw new Error('Canvas RGBA 数组必须包含 4 个通道');
    for (let i = 0; i < 4; i += 1) {
      if (!Number.isInteger(value[i]) || value[i] < 0 || value[i] > 255) throw new Error('Canvas RGBA 通道必须是 0–255 的整数');
    }
    return value;
  }
  function paint(x, y, value, blend) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = (y * width + x) * 4, pixels = state.pixels;
    let red = value[0], green = value[1], blue = value[2], alpha = value[3];
    if (blend && alpha < 255) {
      const sourceAlpha = alpha / 255, targetAlpha = pixels[index + 3] / 255;
      const total = sourceAlpha + targetAlpha * (1 - sourceAlpha);
      if (!total) return;
      const weight = targetAlpha * (1 - sourceAlpha);
      red = Math.round((red * sourceAlpha + pixels[index] * weight) / total);
      green = Math.round((green * sourceAlpha + pixels[index + 1] * weight) / total);
      blue = Math.round((blue * sourceAlpha + pixels[index + 2] * weight) / total);
      alpha = Math.round(total * 255);
    }
    if (pixels[index] === red && pixels[index + 1] === green && pixels[index + 2] === blue && pixels[index + 3] === alpha) return;
    pixels[index] = red; pixels[index + 1] = green; pixels[index + 2] = blue; pixels[index + 3] = alpha;
    state.revision += 1;
  }
  function style(value) {
    const opts = value || {};
    const lineWidth = opts.lineWidth === undefined ? 1 : coordinate(opts.lineWidth, 'lineWidth');
    if (lineWidth < 1) throw new Error('Canvas lineWidth 必须大于 0');
    return { color: rgba(opts.color === undefined ? '#ffffff' : opts.color), fill: opts.fill !== false, lineWidth };
  }
  function region(left, top, right, bottom, color, contains) {
    for (let y = Math.max(0, Math.ceil(top)); y <= Math.min(height - 1, Math.floor(bottom)); y += 1) {
      for (let x = Math.max(0, Math.ceil(left)); x <= Math.min(width - 1, Math.floor(right)); x += 1) {
        if (!contains || contains(x, y)) paint(x, y, color, true);
      }
    }
  }
  const methods = {
    clear(value) {
      check();
      const color = value === undefined ? [0, 0, 0, 0] : rgba(value);
      // Pack through the byte view so native endianness cannot change RGBA.
      const packed = new Uint32Array(new Uint8Array(color).buffer)[0];
      if (uniformRevision === state.revision && uniformColor === packed) return;
      const pixels = new Uint32Array(state.pixels.buffer);
      for (let i = 0; i < pixels.length; i += 1) {
        if (pixels[i] !== packed) {
          pixels.fill(packed);
          state.revision += 1;
          break;
        }
      }
      uniformColor = packed; uniformRevision = state.revision;
    },
    setPixel(x, y, value) { check(); paint(coordinate(x, 'x'), coordinate(y, 'y'), pixelColor(value), false); },
    getPixel(x, y) {
      check(true); x = coordinate(x, 'x'); y = coordinate(y, 'y');
      if (x < 0 || y < 0 || x >= width || y >= height) throw new Error('Canvas 读取像素坐标超出画布');
      const index = (y * width + x) * 4;
      return [state.pixels[index], state.pixels[index + 1], state.pixels[index + 2], state.pixels[index + 3]];
    },
    line(x1, y1, x2, y2, options) {
      check(); x1 = coordinate(x1, 'x1'); y1 = coordinate(y1, 'y1'); x2 = coordinate(x2, 'x2'); y2 = coordinate(y2, 'y2');
      const settings = style(options), radius = settings.lineWidth / 2;
      // Even strokes sit between pixel centers so width 2 covers two rows.
      if (settings.lineWidth % 2 === 0) { x1 += 0.5; y1 += 0.5; x2 += 0.5; y2 += 0.5; }
      const dx = x2 - x1, dy = y2 - y1, length = dx * dx + dy * dy;
      // Scan a narrow strip along the dominant axis, not the whole bounding box.
      // Keep the original distance predicate for identical caps and blending.
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const major1 = horizontal ? x1 : y1, major2 = horizontal ? x2 : y2;
      const minor1 = horizontal ? y1 : x1, minor2 = horizontal ? y2 : x2;
      const majorDelta = horizontal ? dx : dy, minorDelta = horizontal ? dy : dx;
      const start = Math.max(0, Math.ceil(Math.min(major1, major2) - radius));
      const end = Math.min((horizontal ? width : height) - 1, Math.floor(Math.max(major1, major2) + radius));
      const low = Math.max(0, Math.ceil(Math.min(minor1, minor2) - radius));
      const high = Math.min((horizontal ? height : width) - 1, Math.floor(Math.max(minor1, minor2) + radius));
      const spread = length ? radius * Math.sqrt(length) / Math.abs(majorDelta) : radius;
      for (let major = start; major <= end; major += 1) {
        const center = length ? minor1 + (major - major1) * minorDelta / majorDelta : minor1;
        // Include a pixel of margin for floating-point rounding at the boundary.
        const first = Math.max(low, Math.ceil(center - spread) - 1);
        const last = Math.min(high, Math.floor(center + spread) + 1);
        for (let minor = first; minor <= last; minor += 1) {
          const x = horizontal ? major : minor, y = horizontal ? minor : major;
          const t = length ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / length)) : 0;
          if (Math.pow(x - x1 - t * dx, 2) + Math.pow(y - y1 - t * dy, 2) <= radius * radius) paint(x, y, settings.color, true);
        }
      }
    },
    rect(x, y, w, h, options) {
      check(); x = coordinate(x, 'x'); y = coordinate(y, 'y'); w = coordinate(w, 'width'); h = coordinate(h, 'height');
      if (w < 0 || h < 0) throw new Error('Canvas 矩形尺寸不能为负数');
      const settings = style(options), edge = settings.lineWidth;
      region(x, y, x + w - 1, y + h - 1, settings.color, settings.fill ? null : (px, py) => px < x + edge || px >= x + w - edge || py < y + edge || py >= y + h - edge);
    },
    circle(x, y, radius, options) {
      check(); x = coordinate(x, 'x'); y = coordinate(y, 'y'); radius = coordinate(radius, 'radius');
      if (radius < 0) throw new Error('Canvas radius 不能为负数');
      const settings = style(options), inner = Math.max(0, radius - settings.lineWidth);
      region(x - radius, y - radius, x + radius, y + radius, settings.color, (px, py) => {
        const distance = (px - x) * (px - x) + (py - y) * (py - y);
        return distance <= radius * radius && (settings.fill || inner === 0 || distance > inner * inner);
      });
    },
    submit() {
      try { check(); return services.submit(state); }
      catch (error) { return Promise.reject(error); }
    }
  };
  Object.keys(methods).forEach(key => Object.defineProperty(canvas, key, { value: methods[key], enumerable: false, writable: false, configurable: false }));
  const fixed = separate ? ['kind', 'pixelWidth', 'pixelHeight'] : ['kind', 'pixelWidth', 'pixelHeight', 'width', 'height'];
  fixed.forEach(key => Object.defineProperty(canvas, key, { value: canvas[key], enumerable: true, writable: false, configurable: false }));
  return { canvas, state };
}

/* VB6 Studio Web 0.5.0 - MIT. Generated from modular sources. */
(()=>{'use strict';
const __modules=[];

/* policy.js */
__modules[0]=(()=>{

/** Serializable, dependency-free rendering policy. HTML is always the final safety net. */
const BACKENDS = Object.freeze(['webgpu', 'webgl2', 'canvas2d', 'html']);
const DEFAULT_RENDERING = Object.freeze({backend: 'webgpu', fallbacks: Object.freeze(['webgl2', 'canvas2d', 'html']), text: 'native', pixelSnap: true});
const RENDERING_STORAGE_KEY = 'vb6-studio-web.rendering.v1';
function normalizeRendering(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const backend = BACKENDS.includes(value.backend) ? value.backend : 'webgpu';
  const input = Array.isArray(value.fallbacks) ? value.fallbacks : DEFAULT_RENDERING.fallbacks;
  const fallbacks = [...new Set(input.filter(item => BACKENDS.includes(item) && item !== backend))];
  // A missing GPU must never turn a working IDE into an invisible or unusable UI.
  if (backend !== 'html' && !fallbacks.includes('html')) fallbacks.push('html');
  return {backend, fallbacks: backend === 'html' ? [] : fallbacks, text: value.text === 'gpu' ? 'gpu' : 'native', pixelSnap: value.pixelSnap !== false};
}
function renderingCandidates(value) {
  const policy = normalizeRendering(value);
  return [policy.backend, ...policy.fallbacks].slice(0, [policy.backend, ...policy.fallbacks].indexOf('html') + 1 || undefined);
}
function readRendering(storage) {
  try { return normalizeRendering(JSON.parse(storage?.getItem(RENDERING_STORAGE_KEY) || '{}')); }
  catch { return normalizeRendering(); }
}
function writeRendering(storage, value) {
  const policy = normalizeRendering(value);
  try { storage?.setItem(RENDERING_STORAGE_KEY, JSON.stringify(policy)); return true; }
  catch { return false; }
}
function physicalSize(width, height, dpr = 1, limit = 16384, maxPixels = 32 * 1024 * 1024) {
  if (![width, height, dpr].every(Number.isFinite) || width <= 0 || height <= 0 || dpr <= 0) throw new RangeError('Invalid rendering dimensions.');
  const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
  if (w > limit || h > limit || w * h > maxPixels) throw new RangeError('Native-resolution rendering exceeds the device or memory limit; using the next configured backend.');
  return {width: w, height: h, scaleX: w / width, scaleY: h / height};
}
function intersect(a, b) {
  const x = Math.max(a[0], b[0]), y = Math.max(a[1], b[1]);
  return [x, y, Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - x), Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - y)];
}
function snapRect(rect, dpr = 1) {
  const x = Math.round(rect[0] * dpr) / dpr, y = Math.round(rect[1] * dpr) / dpr;
  return [x, y, Math.round((rect[0] + rect[2]) * dpr) / dpr - x, Math.round((rect[1] + rect[3]) * dpr) / dpr - y];
}

return {BACKENDS,DEFAULT_RENDERING,RENDERING_STORAGE_KEY,normalizeRendering,renderingCandidates,readRendering,writeRendering,physicalSize,intersect,snapRect};
})();

/* scene.js */
__modules[1]=(()=>{
const {intersect, snapRect}=__modules[0];

/** A retained paint list. Commands are in CSS pixels, colors are unpremultiplied sRGB. */
class PaintScene {
  constructor(width, height, {dpr = 1, pixelSnap = true, maxCommands = 100000} = {}) {
    this.sealed = false;
    this.width = width; this.height = height; this.dpr = dpr; this.pixelSnap = pixelSnap;
    this.clip = [0, 0, width, height]; this.commands = []; this.maxCommands = maxCommands;
    this.stats = {elements: 0, nativeIslands: 0, nativeText: 0, gpuText: 0, reasons: {}};
  }
  add(rect, color, {clip = this.clip, color2 = color, vertical = false, page = null, uv = [0, 0, 1, 1], hole = false, snap = true} = {}) {
    if (this.sealed) throw new TypeError('Cannot change a sealed paint scene.');
    if (!rect.every(Number.isFinite) || rect[2] <= 0 || rect[3] <= 0) return;
    rect = this.pixelSnap && snap ? snapRect(rect, this.dpr) : rect;
    clip = intersect(clip, this.clip);
    if (intersect(rect, clip).slice(2).some(n => n <= 0)) return;
    if (!hole && (!color || color[3] <= 0) && !page) return;
    if (this.commands.length >= this.maxCommands) throw new RangeError('UI paint command budget exceeded.');
    this.commands.push({rect, clip, color, color2, vertical, page, uv, hole});
  }
  /** Opt-in immutable geometry for static/repeated GPU draws. Atlas pages remain
   * revisioned resources, so updating their pixels still triggers an upload. */
  seal() {
    if (this.sealed) return this;
    this.commands = Object.freeze(this.commands.map(command => {
      const color = Object.freeze(Array.from(command.color));
      return Object.freeze({...command, rect: Object.freeze(Array.from(command.rect)),
        clip: Object.freeze(Array.from(command.clip)), color,
        color2: command.color === command.color2 ? color : Object.freeze(Array.from(command.color2)),
        uv: Object.freeze(Array.from(command.uv))});
    }));
    this.clip = Object.freeze(Array.from(this.clip)); this.sealed = true;
    return Object.freeze(this);
  }
  native(rect, clip, reason = 'native') {
    if (this.sealed) throw new TypeError('Cannot change a sealed paint scene.');
    this.stats.nativeIslands++;
    this.stats.reasons[reason] = (this.stats.reasons[reason] || 0) + 1;
    const outward = r => { const x = Math.floor(r[0] * this.dpr) / this.dpr, y = Math.floor(r[1] * this.dpr) / this.dpr; return [x, y, Math.ceil((r[0] + r[2]) * this.dpr) / this.dpr - x, Math.ceil((r[1] + r[3]) * this.dpr) / this.dpr - y]; };
    this.add(outward(rect), [0, 0, 0, 0], {clip: outward(clip), hole: true, snap: false});
  }
}
/** Computed CSS colors are normally rgb()/rgba(); no DOM needed in the core. */
function parseColor(value) {
  if (!value || value === 'transparent') return [0, 0, 0, 0];
  const rgb = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgb) {
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean);
    return [0, 1, 2].map(i => parts[i]?.endsWith('%') ? parseFloat(parts[i]) / 100 : Number(parts[i]) / 255).concat(parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : Number(parts[3]));
  }
  const hex = /^#([\da-f]{3,8})$/i.exec(value);
  if (hex) {
    let h = hex[1]; if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
    if (h.length === 6 || h.length === 8) return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).concat(h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1);
  }
  throw new TypeError('Unsupported computed color: ' + value);
}
function splitCSS(value) {
  let depth = 0, begin = 0; const result = [];
  for (let i = 0; i < value.length; i++) { if (value[i] === '(') depth++; else if (value[i] === ')') depth--; else if (value[i] === ',' && depth === 0) { result.push(value.slice(begin, i).trim()); begin = i + 1; } }
  result.push(value.slice(begin).trim()); return result;
}
function rgbaCSS(c) { return `rgba(${c[0] * 255},${c[1] * 255},${c[2] * 255},${c[3]})`; }

return {PaintScene,parseColor,splitCSS,rgbaCSS};
})();

/* atlas.js */
__modules[2]=(()=>{

/** Browser-shaped text runs are rasterized once, then sampled by GPU quads.
 * No font files, foreignObject snapshots, HTML rasterizers or network dependencies.
 */
class TextAtlas {
  constructor(document, {size = 1024, maxPages = 4} = {}) {
    this.document = document; this.size = size; this.maxPages = maxPages; this.pages = []; this.entries = new Map(); this.clock = 0;
    this.measure = document.createElement('canvas').getContext('2d');
  }
  begin() { this.clock++; }
  page() {
    if (this.pages.length >= this.maxPages) return null;
    const canvas = this.document.createElement('canvas'); canvas.width = canvas.height = this.size;
    const page = {canvas, context: canvas.getContext('2d'), width: this.size, height: this.size, x: 1, y: 1, row: 0, revision: 0};
    this.pages.push(page); return page;
  }
  allocate(width, height) {
    if (width > this.size - 2 || height > this.size - 2) return null;
    for (let i = 0; i <= this.pages.length; i++) {
      const page = this.pages[i] || this.page(); if (!page) return null;
      if (page.x + width + 1 > this.size) { page.x = 1; page.y += page.row + 1; page.row = 0; }
      if (page.y + height + 1 > this.size) continue;
      const box = {page, x: page.x, y: page.y, width, height}; page.x += width + 1; page.row = Math.max(page.row, height); return box;
    }
    return null;
  }
  text(text, style, rect, dpr = 1) {
    const ctx = this.measure, font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.font = font; ctx.fontKerning = style.fontKerning || 'auto'; ctx.direction = style.direction || 'ltr';
    const metrics = ctx.measureText(text), ascent = metrics.fontBoundingBoxAscent ?? parseFloat(style.fontSize), descent = metrics.fontBoundingBoxDescent ?? parseFloat(style.fontSize) * .25;
    const fx = rect[0] * dpr - Math.floor(rect[0] * dpr), fy = rect[1] * dpr - Math.floor(rect[1] * dpr);
    const key = JSON.stringify([text, font, style.color, style.direction, style.fontKerning, dpr, fx.toFixed(3), fy.toFixed(3)]);
    let entry = this.entries.get(key);
    if (!entry) {
      const pad = 2, width = Math.ceil((Math.max(metrics.width, metrics.actualBoundingBoxRight || 0) + Math.max(0, metrics.actualBoundingBoxLeft || 0)) * dpr + fx) + pad * 2;
      const height = Math.ceil((ascent + descent) * dpr + fy) + pad * 2;
      const box = this.allocate(width, height); if (!box) return null;
      const paint = box.page.context; paint.save(); paint.beginPath(); paint.rect(box.x, box.y, width, height); paint.clip();
      paint.translate(box.x + pad + fx + Math.max(0, metrics.actualBoundingBoxLeft || 0) * dpr, box.y + pad + fy); paint.scale(dpr, dpr);
      paint.font = font; paint.fontKerning = ctx.fontKerning; paint.direction = ctx.direction; paint.textAlign = 'left'; paint.textBaseline = 'alphabetic'; paint.fillStyle = style.color; paint.fillText(text, 0, ascent); paint.restore();
      box.page.revision++;
      entry = {...box, pad, left: Math.max(0, metrics.actualBoundingBoxLeft || 0), ascent, descent}; this.entries.set(key, entry);
    }
    entry.used = this.clock;
    return {page: entry.page, uv: [entry.x / this.size, entry.y / this.size, entry.width / this.size, entry.height / this.size], rect: [(Math.floor(rect[0] * dpr) - entry.pad) / dpr - entry.left, (Math.floor(rect[1] * dpr) - entry.pad) / dpr, entry.width / dpr, entry.height / dpr]};
  }
  reset() { this.entries.clear(); this.pages.length = 0; }
  dispose() { this.reset(); this.measure = null; }
}

return {TextAtlas};
})();

/* device.js */
__modules[3]=(()=>{

const devices = new WeakMap();
function deadline(promise, milliseconds, message = 'Renderer initialization timed out') {
  let timer;
  return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]).finally(() => clearTimeout(timer));
}
/** Devices belong to a browser Window, never a DOM node which can be adopted. */
async function acquireDevice(view, timeout = 3000) {
  if (view.vb6NativeGPUUnavailable) throw new Error('Native host disabled WebGPU');
  if (view.vb6NativeGPUDevice) return {device: view.vb6NativeGPUDevice, info: {description: 'Native host device', isFallbackAdapter: null}};
  if (!view.navigator?.gpu) throw new Error('WebGPU is unavailable in this browser or origin');
  let pending = devices.get(view);
  if (!pending) {
    pending = (async () => {
      const adapter = await view.navigator.gpu.requestAdapter({powerPreference: 'high-performance'});
      if (!adapter) throw new Error('No WebGPU adapter');
      const requiredFeatures = adapter.features?.has('timestamp-query') ? ['timestamp-query'] : [];
      const device = await adapter.requestDevice({requiredFeatures});
      const info = adapter.info || {};
      device.lost.then(() => { if (devices.get(view) === pending) devices.delete(view); });
      return {device, info: {vendor: info.vendor || '', architecture: info.architecture || '', description: info.description || '', isFallbackAdapter: info.isFallbackAdapter ?? adapter.isFallbackAdapter ?? null}};
    })();
    devices.set(view, pending);
    pending.catch(() => { if (devices.get(view) === pending) devices.delete(view); });
  }
  return deadline(pending, timeout);
}

// One promise continuation per shared device, not one retained closure per
// disposed painter. Unsubscribing releases detached documents immediately.
const losses = new WeakMap();
function subscribeDeviceLoss(device, callback) {
  let record = losses.get(device);
  if (!record) {
    record = {listeners: new Set(), info: null}; losses.set(device, record);
    device.lost.then(info => {
      record.info = info;
      const callbacks = [...record.listeners]; record.listeners.clear();
      for (const listener of callbacks) { try { listener(info); } catch (error) { globalThis.reportError?.(error); } }
    });
  }
  let active = true;
  if (record.info) queueMicrotask(() => { if (active) callback(record.info); });
  else record.listeners.add(callback);
  return () => { active = false; record.listeners.delete(callback); };
}

return {deadline,acquireDevice,subscribeDeviceLoss};
})();

/* instances.js */
__modules[4]=(()=>{

/** Shared WebGPU/WebGL2 instance encoder. Colors remain unpremultiplied sRGB.
 * Clip against physical pixel centers, not CSS coordinates divided in a shader:
 * division introduced edge disagreements at fractional DPI.
 * Source: WebGPU fragment position and pixel-coordinate conventions:
 * https://gpuweb.github.io/gpuweb/#coordinate-systems
 * Original implementation; no third-party code copied.
 */
const INSTANCE_FLOATS = 24;
const INSTANCE_BYTES = INSTANCE_FLOATS * 4;
function encodeInstances(commands, data, scaleX, scaleY) {
  let at = 0;
  for (const c of commands) {
    data.set(c.rect, at);
    const [x, y, w, h] = c.clip;
    const left = Math.ceil(x * scaleX - .5), top = Math.ceil(y * scaleY - .5);
    const right = Math.ceil((x + w) * scaleX - .5), bottom = Math.ceil((y + h) * scaleY - .5);
    data[at + 4] = left; data[at + 5] = top;
    data[at + 6] = right - left; data[at + 7] = bottom - top;
    data.set(c.color, at + 8); data.set(c.color2, at + 12); data.set(c.uv, at + 16);
    data[at + 20] = c.hole ? 2 : c.page ? 1 : 0;
    data[at + 21] = c.vertical ? 1 : 0;
    data[at + 22] = data[at + 23] = 0;
    at += INSTANCE_FLOATS;
  }
  return at;
}
/** Only sealed scenes can reuse encoded geometry; mutable public command arrays
 * continue to be observed on every draw. Image pixels are revisioned separately.
 */
function canReuseInstances(painter, scene, size) {
  return scene.sealed === true && painter.encodedScene === scene &&
    painter.encodedWidth === size.width && painter.encodedHeight === size.height;
}
function rememberInstances(painter, scene, size) {
  painter.encodedScene = scene.sealed ? scene : null;
  painter.encodedWidth = size.width; painter.encodedHeight = size.height;
}

/** Ordered batches keep page identities, not GPU handles, so a resized/revised
 * atlas page can refresh its texture without repacking immutable geometry. */
function prepareBatches(painter, scene) {
  if (scene.sealed && painter.batchedScene === scene) return painter.batches;
  const groups = [], pages = new Set();
  for (let index = 0; index < scene.commands.length; index++) {
    const command = scene.commands[index], page = command.page || null;
    if (page) pages.add(page);
    const previous = groups.at(-1), hole = Boolean(command.hole);
    if (previous && previous.page === page && previous.hole === hole) previous.count++;
    else groups.push({first: index, count: 1, page, hole});
  }
  painter.batches = {groups, pages}; painter.batchedScene = scene.sealed ? scene : null;
  painter.stats.batchBuilds = (painter.stats.batchBuilds || 0) + 1;
  return painter.batches;
}

return {INSTANCE_FLOATS,INSTANCE_BYTES,encodeInstances,canReuseInstances,rememberInstances,prepareBatches};
})();

/* webgpu.js */
__modules[5]=(()=>{
const {acquireDevice, deadline, subscribeDeviceLoss}=__modules[3];
const {physicalSize}=__modules[0];
const {PaintScene}=__modules[1];
const {encodeInstances, canReuseInstances, rememberInstances, prepareBatches}=__modules[4];




const UI_SHADER = `
struct Screen { size: vec2f, scale: vec2f };
@group(0) @binding(0) var<uniform> screen: Screen;
@group(1) @binding(0) var image: texture_2d<f32>;
struct Output {
 @builtin(position) position: vec4f,
 @location(0) uv: vec2f,
 @location(1) color: vec4f,
 @location(2) @interpolate(flat) clip: vec4f,
 @location(3) @interpolate(flat) mode: f32
};
@vertex fn vs(@builtin(vertex_index) vertex: u32,
 @location(0) rect: vec4f, @location(1) clip: vec4f,
 @location(2) color: vec4f, @location(3) color2: vec4f,
 @location(4) uv: vec4f, @location(5) paintFlags: vec4f) -> Output {
 let corners = array<vec2f, 6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
 let p = corners[vertex]; let xy = rect.xy + p * rect.zw;
 var out: Output;
 out.position = vec4f(xy.x / screen.size.x * 2.0 - 1.0, 1.0 - xy.y / screen.size.y * 2.0, 0.0, 1.0);
 out.uv = uv.xy + p * uv.zw; out.clip = clip; out.mode = paintFlags.x;
 out.color = mix(color, color2, select(p.x, p.y, paintFlags.y > 0.5));
 return out;
}
@fragment fn fs(input: Output) -> @location(0) vec4f {
 let xy = floor(input.position.xy);
 if (any(xy < input.clip.xy) || any(xy >= input.clip.xy + input.clip.zw)) { discard; }
 if (input.mode > 1.5) { return vec4f(0); }
 var color = input.color;
 if (input.mode > 0.5) {
   let size = textureDimensions(image);
   let pixel = clamp(vec2i(floor(input.uv * vec2f(size))), vec2i(0), vec2i(size) - vec2i(1));
   color = textureLoad(image, pixel, 0) * input.color;
 }
 return vec4f(color.rgb * color.a, color.a);
}`;
/** Instanced, clipped, demand-submitted sRGB UI quads. No screenshots of HTML. */
class WebGPUPainter {
  static async create(canvas, {onLost = () => {}, timeout = 3000} = {}) {
    const painter = new WebGPUPainter(canvas, onLost);
    try { await deadline(painter.initialize(timeout), timeout * 2); await painter.verifyOutput(timeout); return painter; }
    catch (error) { painter.dispose(); throw error; }
  }
  constructor(canvas, onLost) {
    this.canvas = canvas; this.view = canvas.ownerDocument.defaultView; this.onLost = onLost; this.name = 'webgpu'; this.disposed = false;
    this.textures = new Map(); this.stats = {frames: 0, drawCalls: 0, uploadedBytes: 0, bufferAllocations: 0, geometryPacks: 0, instanceUploads: 0, readbacks: 0, outputVerified: false};
  }
  async initialize(timeout) {
    const {device, info} = await acquireDevice(this.view, timeout);
    if (this.disposed) return;
    this.device = device; this.adapterInfo = info;
    this.context = this.canvas.getContext('webgpu'); if (!this.context) throw new Error('WebGPU canvas context unavailable');
    this.format = this.view.navigator.gpu.getPreferredCanvasFormat();
    const module = device.createShaderModule({label: 'VB6 UI quads', code: UI_SHADER});
    const diagnostics = await module.getCompilationInfo();
    if (this.disposed) return;
    if (diagnostics.messages.some(m => m.type === 'error')) throw new Error(diagnostics.messages.filter(m => m.type === 'error').map(m => m.message).join('\n'));
    const {GPUBufferUsage: B, GPUTextureUsage: T} = this.view;
    device.pushErrorScope('validation');
    try {
      this.context.configure({device, format: this.format, alphaMode: 'premultiplied', colorSpace: 'srgb', usage: T.RENDER_ATTACHMENT | T.COPY_SRC});
      const screenLayout = device.createBindGroupLayout({entries: [{binding: 0, visibility: this.view.GPUShaderStage.VERTEX | this.view.GPUShaderStage.FRAGMENT, buffer: {type: 'uniform'}}]});
      this.imageLayout = device.createBindGroupLayout({entries: [{binding: 0, visibility: this.view.GPUShaderStage.FRAGMENT, texture: {sampleType: 'unfilterable-float'}}]});
      const layout = device.createPipelineLayout({bindGroupLayouts: [screenLayout, this.imageLayout]});
      const descriptor = {layout, vertex: {module, entryPoint: 'vs', buffers: [{arrayStride: 96, stepMode: 'instance', attributes: Array.from({length: 6}, (_, i) => ({shaderLocation: i, offset: i * 16, format: 'float32x4'}))}]}, fragment: {module, entryPoint: 'fs', targets: [{format: this.format, blend: {color: {srcFactor: 'one', dstFactor: 'one-minus-src-alpha'}, alpha: {srcFactor: 'one', dstFactor: 'one-minus-src-alpha'}}}]}, primitive: {topology: 'triangle-list'}};
      this.pipeline = device.createRenderPipeline(descriptor);
      this.holePipeline = device.createRenderPipeline({...descriptor, fragment: {...descriptor.fragment, targets: [{format: this.format}]}});
      this.uniform = device.createBuffer({size: 16, usage: B.UNIFORM | B.COPY_DST});
      this.screenGroup = device.createBindGroup({layout: screenLayout, entries: [{binding: 0, resource: {buffer: this.uniform}}]});
      this.white = device.createTexture({size: [1, 1], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST});
      device.queue.writeTexture({texture: this.white}, new Uint8Array([255, 255, 255, 255]), {bytesPerRow: 4}, [1, 1]);
      this.whiteGroup = device.createBindGroup({layout: this.imageLayout, entries: [{binding: 0, resource: this.white.createView()}]});
    } finally {
      const error = await device.popErrorScope(); if (error) throw error;
    }
    if (this.disposed) { this.disposeResources(); return; }
    this.errorHandler = event => { if (!this.disposed) this.onLost('WebGPU error: ' + event.error.message); };
    device.addEventListener('uncapturederror', this.errorHandler);
    this.unsubscribeLoss = subscribeDeviceLoss(device, info => { if (!this.disposed) this.onLost('WebGPU device lost: ' + (info.message || info.reason)); });
  }
  image(page) {
    if (!page) return this.whiteGroup;
    let record = this.textures.get(page);
    if (record && (record.width !== page.width || record.height !== page.height)) { record.texture.destroy(); this.textures.delete(page); record = null; }
    if (!record) {
      const T = this.view.GPUTextureUsage;
      const texture = this.device.createTexture({size: [page.width, page.height], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT});
      record = {texture, width: page.width, height: page.height, revision: -1, group: this.device.createBindGroup({layout: this.imageLayout, entries: [{binding: 0, resource: texture.createView()}]})}; this.textures.set(page, record);
    }
    if (record.revision !== page.revision || record.source !== page.canvas) {
      this.device.queue.copyExternalImageToTexture({source: page.canvas}, {texture: record.texture, premultipliedAlpha: false}, [page.width, page.height]);
      record.revision = page.revision; record.source = page.canvas; this.stats.uploadedBytes += page.width * page.height * 4;
    }
    return record.group;
  }
  render(scene, {readback = false, timing = null} = {}) {
    const {groups, pages: usedPages} = prepareBatches(this, scene);
    for (const [page, record] of this.textures) if (!usedPages.has(page)) { record.texture.destroy(); this.textures.delete(page); }
    if (this.disposed) throw new Error('Renderer disposed');
    const device = this.device, size = physicalSize(scene.width, scene.height, scene.dpr, device.limits.maxTextureDimension2D);
    if (this.canvas.width !== size.width) this.canvas.width = size.width;
    if (this.canvas.height !== size.height) this.canvas.height = size.height;
    const count = scene.commands.length, required = Math.max(96, count * 96);
    if (required > device.limits.maxBufferSize) throw new RangeError('UI vertex buffer exceeds device limit');
    if (!this.buffer || required > this.capacity) {
      this.buffer?.destroy(); this.capacity = Math.min(device.limits.maxBufferSize, Math.max(4096, 2 ** Math.ceil(Math.log2(required))));
      this.buffer = device.createBuffer({size: this.capacity, usage: this.view.GPUBufferUsage.VERTEX | this.view.GPUBufferUsage.COPY_DST});
      this.data = new Float32Array(this.capacity / 4); this.stats.bufferAllocations++;
    }
    const reuse = canReuseInstances(this, scene, size);
    if (!reuse) { encodeInstances(scene.commands, this.data, size.scaleX, size.scaleY); this.stats.geometryPacks++; }
    const images = new Map();
    for (const page of usedPages) images.set(page, this.image(page));
    const screen = this.screenData || (this.screenData = new Float32Array(4));
    const values = [scene.width, scene.height, size.scaleX, size.scaleY];
    if (!this.screenUploaded || values.some((v, i) => Math.fround(v) !== screen[i])) {
      screen.set(values); device.queue.writeBuffer(this.uniform, 0, screen); this.screenUploaded = true;
    }
    if (count && !reuse) { this.stats.instanceUploads++; device.queue.writeBuffer(this.buffer, 0, this.data, 0, count * 24); this.stats.uploadedBytes += count * 96; }
    rememberInstances(this, scene, size);
    const encoder = device.createCommandEncoder({label: 'VB6 UI frame'});
    const texture = this.context.getCurrentTexture();
    const pass = encoder.beginRenderPass({...(timing ? {timestampWrites: {querySet: timing.querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1}} : {}), colorAttachments: [{view: texture.createView(), clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store'}]});
    pass.setBindGroup(0, this.screenGroup); pass.setVertexBuffer(0, this.buffer);
    for (const group of groups) { pass.setPipeline(group.hole ? this.holePipeline : this.pipeline); pass.setBindGroup(1, group.page ? images.get(group.page) : this.whiteGroup); pass.draw(6, group.count, 0, group.first); }
    pass.end();
    // Optional diagnostic timestamps are resolved with this pass, not wall-clock
    // queue completion. Normal frames allocate no queries and perform no waits.
    // Source: https://www.w3.org/TR/webgpu/#timestamp-query
    if (timing) {
      encoder.resolveQuerySet(timing.querySet, 0, 2, timing.resolve, 0);
      encoder.copyBufferToBuffer(timing.resolve, 0, timing.readback, 0, 16);
    }
    // Queue the copy in the SAME submission as rendering, before automatic
    // canvas-texture expiry. Do not call getCurrentTexture after an await.
    // Source: https://gpuweb.github.io/gpuweb/#automatic-expiry-task-source
    let capture;
    if (readback) {
      const stride = Math.ceil(size.width * 4 / 256) * 256;
      const buffer = device.createBuffer({label: 'VB6 UI readback', size: stride * size.height,
        usage: this.view.GPUBufferUsage.COPY_DST | this.view.GPUBufferUsage.MAP_READ});
      capture = {buffer, stride};
      try { encoder.copyTextureToBuffer({texture}, {buffer, bytesPerRow: stride}, {width: size.width, height: size.height}); }
      catch (error) { buffer.destroy(); throw error; }
    }
    try { device.queue.submit([encoder.finish()]); } catch (error) { capture?.buffer.destroy(); throw error; }
    this.stats.frames++; this.stats.drawCalls = groups.length; this.stats.atlasPages = this.textures.size;
    if (capture) { this.stats.readbacks++; return this.decodeReadback(capture, size); }
  }
  async decodeReadback({buffer, stride}, size) {
    try {
      await deadline(buffer.mapAsync(this.view.GPUMapMode.READ), 5000, 'GPU readback timed out');
      const bytes = new Uint8Array(buffer.getMappedRange()), data = new Uint8Array(size.width * size.height * 4);
      const bgra = this.format.startsWith('bgra');
      for (let y = 0; y < size.height; y++) {
        const row = bytes.subarray(y * stride, y * stride + size.width * 4), at = y * size.width * 4;
        data.set(row, at);
        if (bgra) for (let x = 0; x < row.length; x += 4) { data[at + x] = row[x + 2]; data[at + x + 2] = row[x]; }
      }
      return {width: size.width, height: size.height, data};
    } finally { if (buffer.mapState === 'mapped') buffer.unmap(); buffer.destroy(); }
  }
  async verifyOutput(timeout) {
    const scene = new PaintScene(2, 2);
    scene.add([0, 0, 2, 2], [1, 0, 0, 1]); scene.add([1, 0, 1, 2], [0, 1, 0, 1]);
    const image = await deadline(this.render(scene, {readback: true}), timeout, 'WebGPU output verification timed out');
    if (this.disposed) throw new Error('Renderer disposed during output verification');
    const expected = [255,0,0,255,0,255,0,255,255,0,0,255,0,255,0,255];
    if (image.width !== 2 || image.height !== 2 || image.data.length !== expected.length || image.data.some((channel, index) => channel !== expected[index])) throw new Error('WebGPU output verification failed');
    this.stats.outputVerified = true;
    // Startup diagnostics must not inflate workload frames/uploads/allocations.
    this.buffer?.destroy(); this.buffer = null; this.encodedScene = null; this.batchedScene = null; this.batches = null;
    for (const name of ['frames','drawCalls','uploadedBytes','bufferAllocations','geometryPacks','instanceUploads','readbacks','batchBuilds']) this.stats[name] = 0;
  }
  disposeResources() {
    this.unsubscribeLoss?.(); this.unsubscribeLoss = null; this.encodedScene = null; this.batchedScene = null; this.batches = null;
    this.device?.removeEventListener('uncapturederror', this.errorHandler);
    this.buffer?.destroy(); this.uniform?.destroy(); this.white?.destroy();
    for (const record of this.textures.values()) record.texture.destroy(); this.textures.clear();
    this.context?.unconfigure(); this.buffer = this.uniform = this.white = null;
  }
  dispose() { this.disposed = true; this.disposeResources(); }
}

return {UI_SHADER,WebGPUPainter};
})();

/* webgl2.js */
__modules[6]=(()=>{
const {physicalSize}=__modules[0];
const {encodeInstances, canReuseInstances, rememberInstances, prepareBatches}=__modules[4];


const VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec4 rect; layout(location=1) in vec4 clipping;
layout(location=2) in vec4 color; layout(location=3) in vec4 color2;
layout(location=4) in vec4 texrect; layout(location=5) in vec4 meta;
uniform vec4 screen; out vec2 uv; out vec4 tint; flat out vec4 clip; flat out float mode;
void main() {
 vec2 p[6]=vec2[6](vec2(0,0),vec2(1,0),vec2(0,1),vec2(0,1),vec2(1,0),vec2(1,1));
 vec2 v=p[gl_VertexID], xy=rect.xy+v*rect.zw;
 gl_Position=vec4(xy.x/screen.x*2.-1.,1.-xy.y/screen.y*2.,0,1);
 uv=texrect.xy+v*texrect.zw; tint=mix(color,color2,meta.y>.5?v.y:v.x); clip=clipping; mode=meta.x;
}`;
const FRAGMENT = `#version 300 es
precision highp float; uniform sampler2D image; uniform vec4 screen;
in vec2 uv; in vec4 tint; flat in vec4 clip; flat in float mode; out vec4 outputColor;
void main(){
 vec2 xy=floor(vec2(gl_FragCoord.x,screen.y*screen.w-gl_FragCoord.y));
 if(any(lessThan(xy,clip.xy))||any(greaterThanEqual(xy,clip.xy+clip.zw)))discard;
 if(mode>1.5){outputColor=vec4(0);return;}
 vec4 c=mode>.5?texture(image,uv)*tint:tint; outputColor=vec4(c.rgb*c.a,c.a);
}`;
class WebGLPainter {
  constructor(canvas, {onLost = () => {}} = {}) {
    this.canvas = canvas; this.name = 'webgl2'; this.textures = new Map(); this.stats = {frames: 0, drawCalls: 0, uploadedBytes: 0, bufferAllocations: 0, geometryPacks: 0, instanceUploads: 0};
    const gl = this.gl = canvas.getContext('webgl2', {alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance'});
    if (!gl) throw new Error('WebGL2 unavailable');
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.lost = event => { event.preventDefault(); if (!this.disposed) onLost('WebGL2 context lost'); }; canvas.addEventListener('webglcontextlost', this.lost);
    const shader = (type, source) => { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(log); } return s; };
    let vertex, fragment;
    try {
      vertex = shader(gl.VERTEX_SHADER, VERTEX); fragment = shader(gl.FRAGMENT_SHADER, FRAGMENT);
      this.program = gl.createProgram(); gl.attachShader(this.program, vertex); gl.attachShader(this.program, fragment); gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      this.uniform = gl.getUniformLocation(this.program, 'screen'); this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao); this.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      for (let i = 0; i < 6; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 96, i * 16); gl.vertexAttribDivisor(i, 1); }
      this.white = this.texture(); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      const extension = gl.getExtension('WEBGL_debug_renderer_info'); this.adapterInfo = {description: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)};
    } catch (error) { this.dispose(); throw error; }
    finally { if (vertex) gl.deleteShader(vertex); if (fragment) gl.deleteShader(fragment); }
  }
  texture() {
    const gl = this.gl, texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return texture;
  }
  image(page) {
    if (!page) return this.white;
    const gl = this.gl; let record = this.textures.get(page);
    if (!record) { record = {texture: this.texture(), revision: -1}; this.textures.set(page, record); }
    if (record.revision !== page.revision || record.source !== page.canvas || record.width !== page.width || record.height !== page.height) {
      gl.bindTexture(gl.TEXTURE_2D, record.texture); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, page.canvas); record.revision = page.revision; record.source = page.canvas; record.width = page.width; record.height = page.height; this.stats.uploadedBytes += page.width * page.height * 4;
    }
    return record.texture;
  }
  render(scene) {
    const {groups, pages: usedPages} = prepareBatches(this, scene);
    for (const [page, record] of this.textures) if (!usedPages.has(page)) { this.gl.deleteTexture(record.texture); this.textures.delete(page); }
    const gl = this.gl; if (this.disposed || gl.isContextLost()) throw new Error('WebGL2 context lost');
    const size = physicalSize(scene.width, scene.height, scene.dpr, this.maxTextureSize);
    const resized = this.canvas.width !== size.width || this.canvas.height !== size.height;
    if (this.canvas.width !== size.width) this.canvas.width = size.width;
    if (this.canvas.height !== size.height) this.canvas.height = size.height;
    gl.viewport(0, 0, size.width, size.height); gl.disable(gl.DITHER); gl.disable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program); gl.uniform4f(this.uniform, scene.width, scene.height, size.scaleX, size.scaleY); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const required = Math.max(24, scene.commands.length * 24);
    if (!this.data || this.data.length < required) { this.data = new Float32Array(Math.max(1024, 2 ** Math.ceil(Math.log2(required)))); gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW); this.stats.bufferAllocations++; }
    const reuse = canReuseInstances(this, scene, size);
    if (!reuse) { encodeInstances(scene.commands, this.data, size.scaleX, size.scaleY); this.stats.geometryPacks++; }
    const at = scene.commands.length * 24, images = new Map();
    for (const page of usedPages) images.set(page, this.image(page));
    if (at && !reuse) { gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, at)); this.stats.uploadedBytes += at * 4; this.stats.instanceUploads++; }
    rememberInstances(this, scene, size);
    for (const group of groups) {
      group.hole ? gl.disable(gl.BLEND) : gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.bindTexture(gl.TEXTURE_2D, group.page ? images.get(group.page) : this.white);
      for (let i = 0; i < 6; i++) gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 96, group.first * 96 + i * 16);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, group.count);
    }
    if (!reuse || resized || usedPages.size) { const error = gl.getError(); if (error !== gl.NO_ERROR) throw new Error('WebGL2 rendering error: ' + error); }
    this.stats.frames++; this.stats.drawCalls = groups.length; this.stats.atlasPages = this.textures.size;
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; this.encodedScene = null; this.batchedScene = null; this.batches = null; this.canvas.removeEventListener('webglcontextlost', this.lost);
    const gl = this.gl; if (!gl) return;
    for (const record of this.textures.values()) gl.deleteTexture(record.texture); this.textures.clear();
    gl.deleteTexture(this.white); gl.deleteBuffer(this.buffer); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

return {WebGLPainter};
})();

/* canvas2d.js */
__modules[7]=(()=>{
const {physicalSize}=__modules[0];
const {rgbaCSS}=__modules[1];


class CanvasPainter {
  constructor(canvas) {
    this.canvas = canvas; this.context = canvas.getContext('2d', {alpha: true});
    if (!this.context) throw new Error('Canvas2D context unavailable');
    this.name = 'canvas2d'; this.stats = {frames: 0, drawCalls: 0, uploadedBytes: 0};
  }
  render(scene) {
    const size = physicalSize(scene.width, scene.height, scene.dpr);
    if (this.canvas.width !== size.width) this.canvas.width = size.width;
    if (this.canvas.height !== size.height) this.canvas.height = size.height;
    const ctx = this.context; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, size.width, size.height); ctx.setTransform(size.scaleX, 0, 0, size.scaleY, 0, 0);
    ctx.imageSmoothingEnabled = false;
    for (const c of scene.commands) {
      ctx.save(); ctx.beginPath(); ctx.rect(...c.clip); ctx.clip();
      if (c.hole) ctx.clearRect(...c.rect);
      else if (c.page) ctx.drawImage(c.page.canvas, c.uv[0] * c.page.width, c.uv[1] * c.page.height, c.uv[2] * c.page.width, c.uv[3] * c.page.height, ...c.rect);
      else {
        if (c.color !== c.color2) {
          const [x, y, w, h] = c.rect, g = ctx.createLinearGradient(x, y, c.vertical ? x : x + w, c.vertical ? y + h : y);
          g.addColorStop(0, rgbaCSS(c.color)); g.addColorStop(1, rgbaCSS(c.color2)); ctx.fillStyle = g;
        } else ctx.fillStyle = rgbaCSS(c.color);
        ctx.fillRect(...c.rect);
      }
      ctx.restore();
    }
    this.stats.frames++; this.stats.drawCalls = scene.commands.length;
  }
  dispose() { this.canvas.width = this.canvas.height = 1; this.context = null; }
}

return {CanvasPainter};
})();

/* background.js */
__modules[8]=(()=>{
const {parseColor, splitCSS}=__modules[1];

const list = value => splitCSS(value || '');
function length(value) {
  const match = /^(-?(?:\d*\.)?\d+)(px|%)$/.exec(value);
  if (!match) throw new TypeError('Unsupported background dimension');
  return {value: Number(match[1]), percent: match[2] === '%'};
}
const resolve = (length, extent) => length.percent ? extent * (length.value / 100) : length.value;
/** Solid CSS background layers, used by the border-box classic staircase.
 * Layer order and positioning follow CSS Backgrounds, not DOM screenshots:
 * https://www.w3.org/TR/css-backgrounds-3/#layering
 * The staircase design attribution/license is retained in theme/bevels.css.
 */
function solidBackgroundLayers(style) {
  const images = list(style.backgroundImage);
  if (images.length > 32) throw new RangeError('Background layer budget exceeded');
  const sizes=list(style.backgroundSize), positions=list(style.backgroundPosition);
  const repeats=list(style.backgroundRepeat), origins=list(style.backgroundOrigin), clips=list(style.backgroundClip);
  return images.map((image, index) => {
    if (!image.startsWith('linear-gradient(') || !image.endsWith(')')) throw new TypeError('Native background image');
    const stops=list(image.slice(16,-1));
    if(stops.length===3 && /^(?:-?[\d.]+deg|to (?:left|right|top|bottom))$/.test(stops[0])) stops.shift();
    if(stops.length!==2) throw new TypeError('Native background gradient');
    const color=parseColor(stops[0]), end=parseColor(stops[1]);
    if(!color.every((v,i)=>v===end[i])) throw new TypeError('Native multistop gradient');
    const at = values => values[index%values.length];
    if(at(repeats)!=='no-repeat' || at(origins)!=='border-box' || at(clips)!=='border-box') throw new TypeError('Native background repeat or box');
    const size=at(sizes).split(/\s+/), position=at(positions).split(/\s+/);
    if(size.length!==2 || position.length!==2) throw new TypeError('Native background sizing');
    const aliases=[{left:'0%',center:'50%',right:'100%'},{top:'0%',center:'50%',bottom:'100%'}];
    return {color, size:size.map(length), position:position.map((v,i)=>length(aliases[i][v] || v))};
  });
}
function paintBackgroundLayers(scene, rect, clip, layers) {
  const [x,y,width,height]=rect, painted=[];
  for(let i=layers.length-1;i>=0;i--) {
    const layer=layers[i], w=resolve(layer.size[0],width), h=resolve(layer.size[1],height);
    // Percent position applies to the remaining space, not the whole box.
    const left=x+resolve(layer.position[0],width-w), top=y+resolve(layer.position[1],height-h);
    const area=[left,top,w,h];
    scene.add(area,layer.color,{clip});
    if(layer.color[3]>0 && w>0 && h>0) painted.push(area);
  }
  return painted;
}

/** Preserve a thin device-pixel coverage strip at fractional edges of
 * authored background images. Image bounds need not match the layout border:
 * a two-CSS-pixel classic bevel can extend inside a one-pixel border. Rounding
 * only the outer box then loses the inner image's partial pixel at e.g. DPR 1.25.
 * CSS Backgrounds: https://www.w3.org/TR/css-backgrounds-3/#background-size
 * Interiors are still GPU quads. Clear these strips after the complete box paint
 * but before its children, so later siblings/children keep their stacking order.
 */
function preserveBackgroundEdges(scene, rectangles, clip) {
  const dpr=scene.dpr, seen=new Set();
  const edge=(coordinate,start,extent,vertical,fractionalBox)=>{
    const pixel=coordinate*dpr;
    if((!fractionalBox && Math.abs(pixel-Math.round(pixel))<1e-6) || extent<=0) return;
    // CSS image origins and image extents may round independently. Include
    // a one-device-pixel halo around the coverage pixel, never the whole box.
    const low=(Math.floor(pixel)-1)/dpr;
    const rect=vertical?[low,start,3/dpr,extent]:[start,low,extent,3/dpr];
    const key=rect.join(',');if(seen.has(key))return;seen.add(key);
    scene.native(rect,clip,'fractional CSS background edge');
  };
  for(const [x,y,w,h] of rectangles){
    // Fractional CSS boxes may shift an otherwise integral device edge when
    // the browser computes its image positioning area from rounded box metrics.
    const fractionalBox=[x,y,w,h].some(value=>Math.abs(value-Math.round(value))>1e-6);
    edge(x,y,h,true,fractionalBox);edge(x+w,y,h,true,fractionalBox);
    edge(y,x,w,false,fractionalBox);edge(y+h,x,w,false,fractionalBox);
  }
}

return {solidBackgroundLayers,paintBackgroundLayers,preserveBackgroundEdges};
})();

/* style-activity.js */
__modules[9]=(()=>{

/** Event-driven CSSOM / Web Animations invalidation, scoped to a Window.
 * CSSOM mutations do not generate DOM MutationRecords. Subscribe while painting
 * a canvas backend, restore native descriptors on the last release, and never
 * poll an idle document. All wrappers preserve receiver, exceptions, return
 * value (including Promise identity) and third-party descriptor replacements.
 *
 * Original implementation; API behavior/reference attribution:
 * https://drafts.csswg.org/cssom/#the-cssstylesheet-interface
 * https://drafts.csswg.org/cssom/#the-cssstyledeclaration-interface
 * https://www.w3.org/TR/web-animations-1/#the-animation-interface
 * https://www.w3.org/TR/web-animations-1/#extensions-to-the-element-interface
 */
const HUB = Symbol.for('vb6.rendering.styleActivity.v1');
const SHADOW_HOSTS = Symbol.for('vb6.rendering.nativeShadowHosts.v1');
/** Closed roots are intentionally opaque. Remember roots created while the
 * renderer observes the realm; custom elements conservatively stay native even
 * when their closed root predates subscription. No DOM attributes are changed.
 * Source: https://dom.spec.whatwg.org/#dom-element-attachshadow
 */
function requiresNativeShadowPaint(node) {
  return !!node.shadowRoot || node.localName?.includes('-') ||
    !!node.ownerDocument?.defaultView?.[SHADOW_HOSTS]?.has(node);
}
function subscribeStyleActivity(view, callback) {
  if (typeof callback !== 'function') throw new TypeError('A style activity callback is required');
  let hub = view[HUB];
  if (!hub) {
    hub = {listeners: new Set(), restore: [], unavailable: [], installed: 0};
    Object.defineProperty(view, HUB, {configurable: true, value: hub});
    const notify = (kind, receiver) => {
      if (kind === 'shadow') {
        let hosts = view[SHADOW_HOSTS];
        if (!hosts) {
          hosts = new WeakSet();
          Object.defineProperty(view, SHADOW_HOSTS, {configurable: true, value: hosts});
        }
        hosts.add(receiver);
      }
      // Own canvas style writes must never invalidate the renderer recursively.
      if (receiver?.nodeType === 1 && receiver.hasAttribute?.('data-vb-render-layer')) return;
      for (const listener of [...hub.listeners]) {
        try { listener(kind); } catch { /* Observation cannot change native semantics. */ }
      }
    };
    const patch = (prototype, name, kind, {async = false, ruleOnly = false} = {}) => {
      if (!prototype) return;
      const original = Object.getOwnPropertyDescriptor(prototype, name);
      if (!original || (!original.set && typeof original.value !== 'function')) return;
      if (!original.configurable) { hub.unavailable.push(name); return; }
      const operation = original.set || original.value;
      function observed(...args) {
        const result = Reflect.apply(operation, this, args); // Native brand checks and throws first.
        if (ruleOnly && !this.parentRule) return result; // Inline style is already a DOM mutation.
        if (async) {
          // Do not substitute a chained Promise or turn a rejection into success.
          Promise.resolve(result).then(() => notify(kind, this), () => {});
        } else notify(kind, this);
        return result;
      }
      const installed = original.set ? {...original, set: observed} : {...original, value: observed};
      try {
        Object.defineProperty(prototype, name, installed); hub.installed++;
        hub.restore.push(() => {
          const current = Object.getOwnPropertyDescriptor(prototype, name);
          if ((original.set ? current?.set : current?.value) === observed) {
            Object.defineProperty(prototype, name, original.set ? {...current, set: original.set} : {...current, value: original.value});
          }
        });
      } catch { hub.unavailable.push(name); }
    };
    // Chromium exposes named CSS properties as configurable instance properties,
    // not prototype setters. Instrument only declarations actually accessed by
    // script after subscription, not every rule in a large loaded stylesheet.
    // Keep the native declaration object (no Proxy, no identity/brand changes).
    const seen = new WeakSet(), accessors = new Map();
    const declarationPrototype = view.CSSStyleDeclaration?.prototype;
    const getProperty = declarationPrototype?.getPropertyValue;
    const setProperty = declarationPrototype?.setProperty;
    const watchDeclaration = declaration => {
      if (!declaration || seen.has(declaration) || !getProperty || !setProperty) return;
      seen.add(declaration);
      const installed = [];
      for (const name of Object.getOwnPropertyNames(declaration)) {
        const old = Object.getOwnPropertyDescriptor(declaration,name);
        if (!old?.configurable || !old.writable || typeof old.value !== 'string' || /^\d+$/.test(name)) continue;
        const property = name === 'cssFloat' ? 'float' : name.replace(/^webkit(?=[A-Z])/,'Webkit').replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
        if (!view.CSS?.supports?.(property,'initial')) continue;
        let pair = accessors.get(name);
        if (!pair) {
          pair = {
            get() { return Reflect.apply(getProperty,this,[property]); },
            set(value) { Reflect.apply(setProperty,this,[property,value]); notify('stylesheet',this); }
          }; accessors.set(name,pair);
        }
        try { Object.defineProperty(declaration,name,{configurable:true,enumerable:old.enumerable,...pair}); installed.push([name,pair]); } catch {}
      }
      // Do not restore an old value: removing our accessor reveals the native
      // named-property interceptor with the CURRENT declaration's CSS value.
      const reference = typeof WeakRef === 'function' ? new WeakRef(declaration) : {deref:()=>declaration};
      hub.restore.push(() => {
        const object = reference.deref(); if (!object) return;
        for (const [name,pair] of installed) {
          const current=Object.getOwnPropertyDescriptor(object,name);
          if(current?.get===pair.get && current?.set===pair.set) delete object[name];
        }
      });
    };
    for (const ctor of ['CSSStyleRule','CSSKeyframeRule','CSSPageRule','CSSFontFaceRule']) {
      const prototype=view[ctor]?.prototype, original=prototype && Object.getOwnPropertyDescriptor(prototype,'style');
      if (!original?.get || !original.configurable) continue;
      function get() { const declaration=Reflect.apply(original.get,this,[]);watchDeclaration(declaration);return declaration; }
      try {
        Object.defineProperty(prototype,'style',{...original,get}); hub.installed++;
        hub.restore.push(() => {
          const current = Object.getOwnPropertyDescriptor(prototype, 'style');
          if (current?.get === get) Object.defineProperty(prototype, 'style', {...current, get: original.get});
        });
      } catch { hub.unavailable.push(ctor+'.style'); }
    }
    for (const name of ['insertRule','deleteRule','addRule','removeRule','replaceSync']) patch(view.CSSStyleSheet?.prototype, name, 'stylesheet');
    patch(view.CSSStyleSheet?.prototype, 'replace', 'stylesheet', {async: true});
    for (const ctor of ['StyleSheet','HTMLStyleElement','HTMLLinkElement']) patch(view[ctor]?.prototype, 'disabled', 'stylesheet');
    for (const ctor of ['CSSGroupingRule','CSSKeyframesRule']) {
      for (const name of ['insertRule','deleteRule','appendRule','name']) patch(view[ctor]?.prototype, name, 'stylesheet');
    }
    for (const ctor of ['CSSRule','CSSStyleRule','CSSKeyframeRule']) {
      for (const name of ['cssText','selectorText','keyText']) patch(view[ctor]?.prototype, name, 'stylesheet');
    }
    for (const name of ['appendMedium','deleteMedium','mediaText']) patch(view.MediaList?.prototype, name, 'stylesheet');
    // Rule declarations expose both setProperty() and generated longhand setters.
    const declarations = view.CSSStyleDeclaration?.prototype;
    if (declarations) for (const name of Object.getOwnPropertyNames(declarations)) {
      if (Object.getOwnPropertyDescriptor(declarations,name)?.set || ['setProperty','removeProperty'].includes(name)) {
        patch(declarations, name, 'stylesheet', {ruleOnly: true});
      }
    }
    // adoptedStyleSheets is an ObservableArray. Preserve its identity (no
    // Proxy), its native range/type checks and mutator return values. Getter
    // access invalidates before a following indexed assignment, and saved array
    // references keep working through observed push/splice/etc. The explicit
    // invalidateStyles hook still covers a saved reference's direct index writes.
    // Source: https://drafts.csswg.org/cssom/#dom-documentorshadowroot-adoptedstylesheets
    const arrays = new WeakSet();
    const watchArray = array => {
      if (!array || arrays.has(array)) return;
      arrays.add(array);
      for (const name of ['push','pop','shift','unshift','splice','sort','reverse','fill','copyWithin']) {
        const original = Object.getOwnPropertyDescriptor(array, name), operation = array[name];
        if (typeof operation !== 'function' || (original && !original.configurable)) continue;
        function observed(...args) {
          // A failed native operation can have partially modified an array.
          // Invalidating on failure preserves pixels without swallowing errors.
          try { return Reflect.apply(operation, this, args); }
          finally { notify('stylesheet', this); }
        }
        try {
          Object.defineProperty(array, name, {configurable: true, writable: true, enumerable: original?.enumerable || false, value: observed});
          const reference = typeof WeakRef === 'function' ? new WeakRef(array) : {deref: () => array};
          hub.restore.push(() => {
            const object = reference.deref();
            if (object && Object.getOwnPropertyDescriptor(object, name)?.value === observed) {
              if (original) Object.defineProperty(object, name, original); else delete object[name];
            }
          });
        } catch { hub.unavailable.push('adoptedStyleSheets.' + name); }
      }
    };
    for (const ctor of ['Document','ShadowRoot']) {
      const prototype = view[ctor]?.prototype;
      patch(prototype, 'adoptedStyleSheets', 'stylesheet');
      const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, 'adoptedStyleSheets');
      if (!descriptor?.get || !descriptor.configurable) continue;
      function get() {
        const result = Reflect.apply(descriptor.get, this, []);
        watchArray(result); notify('stylesheet', this); return result;
      }
      try {
        Object.defineProperty(prototype, 'adoptedStyleSheets', {...descriptor, get}); hub.installed++;
        hub.restore.push(() => {
          const current = Object.getOwnPropertyDescriptor(prototype, 'adoptedStyleSheets');
          if (current?.get === get) Object.defineProperty(prototype, 'adoptedStyleSheets', {...current, get: descriptor.get});
        });
      } catch { hub.unavailable.push(ctor + '.adoptedStyleSheets'); }
    }
    patch(view.Element?.prototype, 'attachShadow', 'shadow');
    patch(view.Element?.prototype, 'animate', 'animation');
    for (const name of ['play','pause','reverse','finish','cancel','updatePlaybackRate','currentTime','startTime','playbackRate','effect','timeline']) patch(view.Animation?.prototype, name, 'animation');
    for (const ctor of ['AnimationEffect','KeyframeEffect']) for (const name of ['setKeyframes','updateTiming','target','composite','iterationComposite']) patch(view[ctor]?.prototype, name, 'animation');
  }
  hub.listeners.add(callback);
  let active = true;
  const release = () => {
    if (!active) return; active = false; hub.listeners.delete(callback);
    if (!hub.listeners.size) {
      for (const restore of hub.restore.splice(0).reverse()) { try { restore(); } catch {} }
      if (view[HUB] === hub) delete view[HUB];
    }
  };
  Object.defineProperty(release, 'capabilities', {get: () => ({installed: hub.installed, unavailable: [...hub.unavailable]})});
  return release;
}

return {requiresNativeShadowPaint,subscribeStyleActivity};
})();

/* paint-compat.js */
__modules[10]=(()=>{
const {parseColor}=__modules[1];

/** A canvas overlay cannot alpha-blend a CSS paint over its already painted
 * DOM equivalent: that would apply its opacity twice. Opaque colors and fully
 * transparent no-ops are safe. All partial alpha stays browser-native.
 * https://www.w3.org/TR/compositing-1/#simplealphacompositing
 */
function hasPartialAlpha(paint) {
  const partial = color => color && color[3] > 0 && color[3] < 1;
  return partial(paint.background) || (paint.gradient && (paint.gradient.start[3] < 1 || paint.gradient.end[3] < 1) && (paint.gradient.start[3] > 0 || paint.gradient.end[3] > 0)) ||
    paint.borders.some(edge => edge.width > 0 && partial(edge.color)) ||
    paint.shadows.some(shadow => partial(shadow.color)) ||
    (paint.layers || []).some(layer => partial(layer.color));
}

/** Root/background propagation uses used paint, not blindly the body's
 * computed background. A nontransparent root background prevents propagation.
 * Unknown/partial-alpha canvas paint stays transparent to the native backdrop.
 * https://www.w3.org/TR/css-backgrounds-3/#special-backgrounds
 */
function canvasBackground(root, body) {
  const rootColor = parseColor(root.backgroundColor);
  const propagated = rootColor[3] === 0 && root.backgroundImage === 'none';
  const style = propagated ? body : root;
  const color = parseColor(style.backgroundColor);
  return {propagated, color, native: color[3] !== 1 || style.backgroundImage !== 'none'};
}

return {hasPartialAlpha,canvasBackground};
})();

/* dom-scene.js */
__modules[11]=(()=>{
const {PaintScene, parseColor, splitCSS}=__modules[1];
const {intersect}=__modules[0];
const {solidBackgroundLayers, paintBackgroundLayers, preserveBackgroundEdges}=__modules[8];
const {requiresNativeShadowPaint}=__modules[9];
const {hasPartialAlpha, canvasBackground}=__modules[10];





const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'HEAD']);
const NATIVE = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'IFRAME', 'VIDEO', 'AUDIO', 'CANVAS', 'SVG', 'IMG', 'OBJECT', 'EMBED', 'TABLE', 'METER', 'PROGRESS']);
const rectOf = rect => [rect.left, rect.top, rect.width, rect.height];
const number = value => Number.parseFloat(value) || 0;
const STYLE_KEYS = ['color','display','visibility','position','zIndex','overflowX','overflowY','boxShadow','outlineWidth','outlineStyle','opacity','filter','backdropFilter','mixBlendMode','clipPath','maskImage','writingMode','transform','borderImageSource','backgroundColor','backgroundImage','backgroundSize','backgroundPosition','backgroundRepeat','backgroundOrigin','backgroundClip','direction','letterSpacing','textShadow','textDecorationLine','textOverflow','whiteSpace', ...['Top','Right','Bottom','Left'].flatMap(s=>['Width','Style','Color'].map(p=>'border'+s+p)), ...['TopLeft','TopRight','BottomLeft','BottomRight'].map(s=>'border'+s+'Radius')];
function shadowParts(value) {
  if (!value || value === 'none') return [];
  return splitCSS(value).map(part => {
    const color = part.match(/rgba?\([^)]*\)|#[\da-f]+/i)?.[0];
    if (!color) throw new Error('Unsupported shadow color');
    const inset = /\binset\b/.test(part), dims = part.replace(color, '').replace(/\binset\b/, '').trim().split(/\s+/).map(number);
    if (dims[2] || dims[3]) throw new Error('Blurred or spread shadow');
    return {color: parseColor(color), x: dims[0] || 0, y: dims[1] || 0, inset};
  });
}
/** DOM is the layout/input/accessibility authority; this adapter emits GPU paint,
 * not bitmap snapshots of HTML. Unsupported/native subtrees are explicit holes.
 */
class DOMScene {
  constructor(document, atlas) { this.document = document; this.view = document.defaultView; this.atlas = atlas; this.styles = new WeakMap(); this.order = new WeakMap(); this.range = document.createRange(); }
  clear() {
    this.styles = new WeakMap(); this.order = new WeakMap(); this.boxes = new WeakMap();
    this.elements = new Set(); this.scene = null; this.selection = null;
    this.range = this.document.createRange();
  }
  build(policy) {
    const view = this.view, width = view.innerWidth, height = view.innerHeight;
    const scene = new PaintScene(width, height, {dpr: view.devicePixelRatio || 1, pixelSnap: policy.pixelSnap});
    this.elements = new Set(); this.boxes = new WeakMap();
    this.scene = scene; this.policy = policy; this.selection = this.document.getSelection(); this.atlas.begin();
    let backdrop;
    try { backdrop = canvasBackground(this.style(this.document.documentElement), this.style(this.document.body)); }
    catch { backdrop = {propagated: false, native: true}; }
    this.propagatedBodyBackground = backdrop.propagated;
    if (backdrop.native) scene.native(scene.clip, scene.clip, 'native canvas background');
    else scene.add(scene.clip, backdrop.color);
    this.element(this.document.body, scene.clip, 0);
    return scene;
  }
  // One border-box/layout metric read per element per build. Read all required
  // metrics before painting; never hold geometry across a browser layout change.
  // Source: https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing
  rect(node) {
    let box = this.boxes.get(node);
    if (!box) { box = {rect: rectOf(node.getBoundingClientRect())}; this.boxes.set(node,box); }
    return box.rect;
  }
  box(node) {
    this.rect(node);
    const box = this.boxes.get(node);
    if (!box.measured) {
      box.width = node.offsetWidth; box.height = node.offsetHeight;
      box.clientWidth = node.clientWidth; box.clientHeight = node.clientHeight;
      box.clientLeft = node.clientLeft; box.clientTop = node.clientTop; box.measured = true;
    }
    return box;
  }
  style(node) {
    let style = this.styles.get(node);
    if (!style) {
      const computed = this.view.getComputedStyle(node); style = {};
      for (const key of STYLE_KEYS) style[key] = computed[key];
      this.styles.set(node, style);
    }
    return style;
  }
  fontStyle(node, style) {
    // Native text is drawn by the browser. Reading and serializing the full
    // computed font shorthand for every geometry node was unnecessary work.
    // Only atlas-eligible text needs these properties; cache them with its style.
    if (style.font === undefined) {
      const computed = this.view.getComputedStyle(node);
      for (const key of ['font','fontWeight','fontSize','fontFamily','fontKerning']) style[key] = computed[key];
    }
    return style;
  }
  invalidateChildren(node) { this.order.delete(node); }
  invalidateStyles(node = null) {
    this.order = new WeakMap();
    if (!node || node === this.document.body || node === this.document.documentElement || node === this.document.head) { this.styles = new WeakMap(); return; }
    if (node.nodeType !== 1) node = node.parentElement;
    if (!node) return;
    this.styles.delete(node); for (const child of node.querySelectorAll('*')) this.styles.delete(child);
  }
  native(node, rect, clip, reason) {
    // Shadows/outlines and descendants can extend beyond a native element's border box.
    const style = this.style(node); let [x, y, w, h] = rect, right = x + w, bottom = y + h;
    if (!NATIVE.has(node.tagName.toUpperCase()) && (style.overflowX === 'visible' || style.overflowY === 'visible')) {
      let count = 0;
      for (const child of node.querySelectorAll('*')) {
        if (++count > 2000) { x = 0; y = 0; right = this.scene.width; bottom = this.scene.height; break; }
        if (child.hasAttribute('data-vb-render-layer')) continue;
        const r = child.getBoundingClientRect(); if (!r.width || !r.height) continue;
        x = Math.min(x, r.left); y = Math.min(y, r.top); right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom);
      }
    }
    const pad = style.boxShadow !== 'none' || number(style.outlineWidth) ? 4 : 1;
    this.scene.native([x - pad, y - pad, right - x + pad * 2, bottom - y + pad * 2], clip, reason);
  }
  unsupported(node, style) {
    if (requiresNativeShadowPaint(node) || NATIVE.has(node.tagName.toUpperCase()) || node.isContentEditable || node.matches('[data-vb-native-render],.code-editor,.source-editor,.editor-container,.vb-richtext')) return 'native control, image or editor';
    if (number(style.opacity) !== 1 || style.filter !== 'none' || (style.backdropFilter && style.backdropFilter !== 'none') || style.mixBlendMode !== 'normal') return 'native compositing';
    if (style.clipPath !== 'none' || (style.maskImage && style.maskImage !== 'none') || style.writingMode !== 'horizontal-tb') return 'native clipping or writing mode';
    if (style.transform !== 'none') {
      const m = new this.view.DOMMatrixReadOnly(style.transform);
      if (!m.is2D || m.b || m.c || m.a <= 0 || m.d <= 0) return 'rotated or 3D transform';
    }
    if (['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'].some(side => number(style['border' + side + 'Radius']) > 0)) return 'rounded border';
    if (style.borderImageSource !== 'none') return 'border image';
    if (style.outlineStyle !== 'none' && number(style.outlineWidth)) return 'native focus outline';
    for (const pseudo of ['::before', '::after']) {
      if (!(pseudo in style)) { const p = this.view.getComputedStyle(node, pseudo); style[pseudo] = p.display !== 'none' && !['none', 'normal', ''].includes(p.content); }
      if (style[pseudo]) return 'generated content';
    }
    return null;
  }
  element(node, clip, depth) {
    if (depth > 160 || this.scene.stats.elements > 20000) throw new Error('UI scene traversal budget exceeded');
    if (SKIP.has(node.tagName.toUpperCase()) || node.hasAttribute('data-vb-render-layer')) return;
    const style = this.style(node);
    if (style.display === 'none' || node.hidden) return;
    this.elements.add(node);
    // visibility may be overridden by a descendant, so do not drop the subtree.
    const visible = style.visibility === 'visible', rect = this.rect(node);
    const area = intersect(rect, clip), inView = area[2] > 0 && area[3] > 0;
    if (!inView && style.overflowX !== 'visible' && style.overflowY !== 'visible') return;
    this.scene.stats.elements++;
    if (visible && inView) {
      const reason = this.unsupported(node, style);
      if (reason) { this.native(node, rect, clip, reason); return; }
    }
    const box = this.box(node);
    const scaleX = box.width ? rect[2] / box.width : 1, scaleY = box.height ? rect[3] / box.height : 1;
    let borders, shadows, background, gradient, layers, backgroundRects;
    try {
      if (!style.paint) {
        const sourceBorders = ['Top', 'Right', 'Bottom', 'Left'].map(side => ({width: number(style['border' + side + 'Width']), style: style['border' + side + 'Style'], color: parseColor(style['border' + side + 'Color'])}));
        if (sourceBorders.some(b => b.width && !['solid', 'none', 'hidden'].includes(b.style))) throw new Error('non-solid border');
        if (sourceBorders.some(b => b.width && b.color[3] === 0) && sourceBorders.some(b => b.width && b.color[3] > 0)) throw new Error('CSS border wedge');
        const layered = splitCSS(style.backgroundImage || 'none').length > 1;
        style.paint = {borders: sourceBorders, shadows: shadowParts(style.boxShadow), background: parseColor(style.backgroundColor), gradient: layered ? null : this.gradient(style.backgroundImage), layers: layered ? solidBackgroundLayers(style) : null};
      }
      const paint = node === this.document.body && this.propagatedBodyBackground
        ? {...style.paint, background: [0, 0, 0, 0], gradient: null, layers: null} : style.paint;
      if (hasPartialAlpha(paint)) throw new Error('native alpha compositing');
      borders = scaleX === 1 && scaleY === 1 ? style.paint.borders : style.paint.borders.map((b, i) => ({...b, width: b.width * (i % 2 ? scaleX : scaleY)}));
      ({shadows, background, gradient, layers} = paint);
    } catch (error) { if (visible && inView) this.native(node, rect, clip, error.message); else this.children(node, clip, depth); return; }
    if (visible && inView) {
      for (const s of [...shadows].reverse()) if (!s.inset) this.scene.add([rect[0] + s.x * scaleX, rect[1] + s.y * scaleY, rect[2], rect[3]], s.color, {clip});
      this.scene.add(rect, background, {clip});
      if (gradient) this.scene.add(rect, gradient.start, {clip, color2: gradient.end, vertical: gradient.vertical});
      if (layers) { backgroundRects = paintBackgroundLayers(this.scene, rect, intersect(rect,clip), layers); this.scene.stats.gpuBackgroundLayers = (this.scene.stats.gpuBackgroundLayers || 0) + layers.length; }
      const [t, r, b, l] = borders.map(item => item.width), [x, y, w, h] = rect;
      // CSS solid border corners are split diagonally. Use native corner squares
      // for multicolor bevels; long edges remain native GPU primitives.
      this.scene.add([x + l, y, w - l - r, t], borders[0].color, {clip});
      this.scene.add([x + w - r, y + t, r, h - t - b], borders[1].color, {clip});
      this.scene.add([x + l, y + h - b, w - l - r, b], borders[2].color, {clip});
      this.scene.add([x, y + t, l, h - t - b], borders[3].color, {clip});
      for (const corner of [[x, y, l, t], [x + w - r, y, r, t], [x, y + h - b, l, b], [x + w - r, y + h - b, r, b]]) if (corner[2] && corner[3] && borders.some(edge=>edge.color[3]>0)) this.scene.add(corner, [0, 0, 0, 0], {clip, hole: true});
      const inner = [x + l, y + t, w - l - r, h - t - b];
      for (const s of [...shadows].reverse()) if (s.inset) {
        const sx = s.x * scaleX, sy = s.y * scaleY;
        if (sx) this.scene.add([sx > 0 ? inner[0] : inner[0] + inner[2] + sx, inner[1], Math.abs(sx), inner[3]], s.color, {clip});
        if (sy) this.scene.add([inner[0], sy > 0 ? inner[1] : inner[1] + inner[3] + sy, inner[2], Math.abs(sy)], s.color, {clip});
      }
      // CSS border rasterization rounds widths and antialiases fractional device
      // edges differently from pixel-snapped GPU quads. Preserve only those thin
      // edge strips, not the entire control, so 125%/150% DPI stays faithful.
      const dpr = this.scene.dpr;
      const fractional = rect.some(value => Math.abs(value - Math.round(value)) > .001) || [...rect, ...borders.map(edge => edge.width), ...shadows.flatMap(shadow => [shadow.x * scaleX, shadow.y * scaleY])].some(value => Math.abs(value * dpr - Math.round(value * dpr)) > .001);
      if (fractional) {
        const pad = 1 / dpr;
        const sx = Math.max(0, ...shadows.map(shadow => Math.abs(shadow.x * scaleX)));
        const sy = Math.max(0, ...shadows.map(shadow => Math.abs(shadow.y * scaleY)));
        for (const edge of [
          [x - sx - pad, y - sy - pad, w + 2 * (sx + pad), t + 2 * (sy + pad)],
          [x - sx - pad, y + h - b - sy - pad, w + 2 * (sx + pad), b + 2 * (sy + pad)],
          [x - sx - pad, y - sy - pad, l + 2 * (sx + pad), h + 2 * (sy + pad)],
          [x + w - r - sx - pad, y - sy - pad, r + 2 * (sx + pad), h + 2 * (sy + pad)]
        ]) this.scene.native(edge, clip, 'fractional CSS edge');
      }
      if (backgroundRects) preserveBackgroundEdges(this.scene, backgroundRects, intersect(rect,clip));
    }
    let childClip = clip;
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
      const own = [rect[0] + box.clientLeft * scaleX, rect[1] + box.clientTop * scaleY, box.clientWidth * scaleX, box.clientHeight * scaleY];
      childClip = intersect(clip, [style.overflowX === 'visible' ? clip[0] : own[0], style.overflowY === 'visible' ? clip[1] : own[1], style.overflowX === 'visible' ? clip[2] : own[2], style.overflowY === 'visible' ? clip[3] : own[3]]);
    }
    this.children(node, childClip, depth);
    // Native scrollbar thumbs/buttons remain interactive and platform accurate.
    if (visible && inView && borders) {
      const [t, r, b, l] = borders.map(item => item.width);
      const sw = rect[2] - box.clientWidth * scaleX - l - r, sh = rect[3] - box.clientHeight * scaleY - t - b;
      if (box.clientWidth && sw > .5) this.scene.native([rect[0] + rect[2] - r - sw, rect[1] + t, sw, rect[3] - t - b], clip, 'scrollbar');
      if (box.clientHeight && sh > .5) this.scene.native([rect[0] + l, rect[1] + rect[3] - b - sh, rect[2] - l - r, sh], clip, 'scrollbar');
    }
  }
  children(node, clip, depth) {
    // Stable order for the classic IDE's local stacking contexts, including MDI z-order.
    let nodes = this.order.get(node);
    if (!nodes) { nodes = [...node.childNodes].map((child, index) => {
      let z = 0, positioned = false;
      if (child.nodeType === 1) { const style = this.style(child); z = Number(style.zIndex) || 0; positioned = style.position !== 'static'; }
      return {child, index, z, group: z < 0 ? -1 : z > 0 ? 2 : positioned ? 1 : 0};
    }).sort((a, b) => a.group - b.group || a.z - b.z || a.index - b.index);
      this.order.set(node, nodes);
    }
    for (const {child} of nodes) {
      if (child.nodeType === 1) this.element(child, clip, depth + 1);
      else if (child.nodeType === 3 && child.textContent.trim()) this.text(child, clip);
    }
  }
  gradient(value) {
    if (!value || value === 'none') return null;
    if (!value.startsWith('linear-gradient(') || !value.endsWith(')')) throw new Error('native background image');
    const parts = splitCSS(value.slice(16, -1));
    if (parts.length !== 3 || !['90deg', '180deg', 'to right', 'to bottom', '270deg', '0deg'].includes(parts[0])) throw new Error('native gradient');
    let start = parseColor(parts[1]), end = parseColor(parts[2]);
    if (parts[0] === '270deg' || parts[0] === '0deg') [start, end] = [end, start];
    return {start, end, vertical: ['180deg', '0deg', 'to bottom'].includes(parts[0])};
  }
  text(node, clip) {
    const style = this.style(node.parentElement); if (style.visibility !== 'visible') return;
    const range = this.range; range.selectNodeContents(node);
    const rectangles = [...range.getClientRects()].map(rectOf).filter(r => r[2] && r[3]);
    if (!rectangles.length) return;
    const native = this.policy.text !== 'gpu' || style.textShadow !== 'none' || style.textDecorationLine !== 'none' || style.direction !== 'ltr' || style.letterSpacing !== 'normal' || Math.abs((this.box(node.parentElement).rect[2] / (this.box(node.parentElement).width || 1)) - 1) > .01 || (this.selection?.rangeCount && this.selection.containsNode(node, true));
    if (native || rectangles.length !== 1 || style.textOverflow === 'ellipsis' || this.style(node.parentElement).transform !== 'none') {
      for (const rect of rectangles) this.scene.native([rect[0] - 1, rect[1] - 1, rect[2] + 2, rect[3] + 2], clip, 'native text');
      this.scene.stats.nativeText++; return;
    }
    const rect = rectangles[0]; let text = node.textContent;
    if (!style.whiteSpace.startsWith('pre')) text = text.replace(/\s+/g, ' ');
    const glyph = this.atlas.text(text, this.fontStyle(node.parentElement, style), rect, this.scene.dpr);
    if (!glyph) { this.scene.native(rect, clip, 'text atlas capacity'); return; }
    this.scene.add(glyph.rect, [1, 1, 1, 1], {clip, page: glyph.page, uv: glyph.uv, snap: false}); this.scene.stats.gpuText++;
  }
}

return {DOMScene};
})();

/* retained-scene.js */
__modules[12]=(()=>{

/** Exact retained-scene comparison, not a probabilistic hash. The UI can receive
 * focus/selection/layout notifications without changing any painted pixels.
 * Keep immutable geometry and independently revisioned images so these events
 * neither upload vertices nor submit a redundant GPU frame.
 * Source background: https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing
 * Original implementation; no third-party source copied.
 */
const ARRAY_KEYS = ['rect', 'clip', 'color', 'color2', 'uv'];
function equalArray(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}
function sameGeometry(a, b) {
  if (!a || !b || a.width !== b.width || a.height !== b.height || a.dpr !== b.dpr || a.pixelSnap !== b.pixelSnap || a.commands.length !== b.commands.length) return false;
  for (let i = 0; i < a.commands.length; i++) {
    const x = a.commands[i], y = b.commands[i];
    if (x.page !== y.page || x.hole !== y.hole || x.vertical !== y.vertical) return false;
    for (const key of ARRAY_KEYS) if (!equalArray(x[key], y[key])) return false;
  }
  return true;
}
class RetainedScene {
  constructor() { this.clear(); }
  clear() { this.scene = null; this.resources = new Map(); this.pages = new Set(); }
  update(scene) {
    // Custom scene factories must explicitly implement immutable snapshots.
    if (typeof scene.seal !== 'function') { this.clear(); return {scene, changed: true, geometryChanged: true}; }
    const geometryChanged = !sameGeometry(this.scene, scene);
    if (geometryChanged) {
      this.scene = scene.seal(); this.pages = new Set();
      for (const command of this.scene.commands) if (command.page) this.pages.add(command.page);
    }
    let resourcesChanged = false;
    const pages = this.pages;
    for (const page of pages) {
      const previous = this.resources.get(page);
      const current = [page.revision, page.width, page.height, page.canvas];
      if (!equalArray(previous, current)) { resourcesChanged = true; this.resources.set(page, current); }
    }
    for (const page of this.resources.keys()) if (!pages.has(page)) this.resources.delete(page);
    return {scene: this.scene, changed: geometryChanged || resourcesChanged, geometryChanged};
  }
}

return {sameGeometry,RetainedScene};
})();

/* mutations.js */
__modules[13]=(()=>{

/** Reuse paint styles only when a mutation cannot change selector matching.
 * Text geometry is still rebuilt: this never caches layout across frames.
 * Sources (original implementation, not copied source):
 * https://www.w3.org/TR/selectors-4/#the-empty-pseudo
 * https://html.spec.whatwg.org/multipage/dom.html#the-dir-attribute
 * https://dom.spec.whatwg.org/#interface-mutationrecord
 */
function canReuseTextStyles(record, parent) {
  if (!parent || parent.nodeType !== 1 || parent.closest('head,style,script,title,textarea,option,bdi,[dir="auto" i]')) return false;
  let before, after;
  if (record.type === 'characterData' && record.target.nodeType === 3) {
    before = record.oldValue; after = record.target.data;
  } else if (record.type === 'childList' && record.addedNodes.length === 1 && record.removedNodes.length === 1) {
    const a = record.addedNodes[0], b = record.removedNodes[0];
    if (a.nodeType !== 3 || b.nodeType !== 3) return false;
    before = b.data; after = a.data;
  } else return false;
  // Requiring visible text on both sides preserves :empty under both current
  // and whitespace-ignoring Selectors definitions. Direction-sensitive and
  // form/default-value ancestors above deliberately use full invalidation.
  return typeof before === 'string' && typeof after === 'string' && /\S/.test(before) && /\S/.test(after);
}


return {canReuseTextStyles};
})();

/* renderer.js */
__modules[14]=(()=>{
const {normalizeRendering, renderingCandidates}=__modules[0];
const {CanvasPainter}=__modules[7];
const {WebGPUPainter}=__modules[5];
const {WebGLPainter}=__modules[6];
const {TextAtlas}=__modules[2];
const {DOMScene}=__modules[11];
const {RetainedScene}=__modules[12];
const {subscribeStyleActivity}=__modules[9];
const {canReuseTextStyles}=__modules[13];









const sessions = new WeakMap();
async function createPainter(name, canvas, options = {}) {
  if (name === 'webgpu') return WebGPUPainter.create(canvas, options);
  if (name === 'webgl2') return new WebGLPainter(canvas, options);
  if (name === 'canvas2d') return new CanvasPainter(canvas);
  if (name === 'html') return null;
  throw new TypeError('Unknown rendering backend: ' + name);
}
/** One demand-rendered visual layer per Document. The semantic DOM never moves,
 * becomes inert, or loses its hit targets, selection, IME, forms or accessibility.
 */
class UIRenderer {
  constructor(document, policy = {}, {factory = createPainter, sceneFactory} = {}) {
    this.document = document; this.view = document.defaultView; this.factory = factory; this.generation = 0; this.disposed = false;
    this.atlas = new TextAtlas(document); this.adapter = new DOMScene(document, this.atlas); this.sceneFactory = sceneFactory || (p => this.adapter.build(p));
    this.policy = normalizeRendering(policy); this.backend = 'html'; this.attempts = []; this.metrics = {frames: 0, invalidations: 0, builds: [], submissions: [], last: null}; this.listeners = [];
    this.retained = new RetainedScene(); this.observedElements = new Set();
    this.resizeTargetsTask = null; this.pendingResizeTargets = null;
    this.frame = null; this.metrics.textStyleReuses = 0;
    this.metrics.unchangedFrames = 0; this.metrics.sceneBuilds = 0;
    this.observe(); this.ready = this.setOptions(policy, {force: true});
  }
  listen(target, type, listener, options) { target?.addEventListener(type, listener, options); this.listeners.push(() => target?.removeEventListener(type, listener, options)); }
  observe() {
    const invalidate = event => {
      if (!this.driver) return; // HTML-only mode does not build/measure a GPU scene.
      // Resource completion and form validity/checked/active/popover pseudo
      // classes can change styles without an attribute mutation. Scroll and
      // selection alone reuse style snapshots; every other wake-up resamples.
      if (event && !['scroll', 'selectionchange'].includes(event.type)) this.stylesDirty = true;
      this.invalidate();
    };
    this.observer = new this.view.MutationObserver(records => {
      if (!this.driver) return;
      let changed = false;
      for (const r of records) {
        const node = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        if (node?.closest('[data-vb-render-layer]')) continue;
        if (r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every(n => n.nodeType === 1 && n.hasAttribute('data-vb-render-layer'))) continue;
        changed = true;
        if (canReuseTextStyles(r, node)) {
          // textContent replaces a Text node; do not keep the removed child in
          // cached paint order. CharacterData keeps the existing node identity.
          if (r.type === 'childList') this.adapter.invalidateChildren(node);
          this.metrics.textStyleReuses++;
        } else this.stylesDirty = true;
      }
      if (changed) this.invalidate();
    });
    // Connected only while a canvas backend is active; native HTML incurs no
    // mutation scanning. Include <head> so dynamic stylesheet edits invalidate.
    for (const event of ['load', 'error', 'input', 'change', 'focusin', 'focusout', 'pointerover', 'pointerout', 'pointerdown', 'pointerup', 'pointercancel', 'keydown', 'keyup', 'toggle', 'beforetoggle', 'selectionchange', 'vb-theme-change']) this.listen(this.document, event, invalidate, true);
    // ResizeObserver catches layout changes which have no DOM mutation (for
    // example intrinsic image sizing or a container resized by a stylesheet).
    // Source: https://www.w3.org/TR/resize-observer/
    this.resizeObserver = typeof this.view.ResizeObserver === 'function' ? new this.view.ResizeObserver(() => {
      if (!this.driver) return;
      this.stylesDirty = true; this.invalidate();
    }) : null;
    for (const event of ['animationstart','animationiteration','animationend','animationcancel','transitionrun','transitionstart','transitionend','transitioncancel']) this.listen(this.document, event, invalidate, true);
    this.listen(this.document, 'scroll', invalidate, true);
    this.listen(this.view, 'resize', invalidate);
    this.listen(this.view.visualViewport, 'resize', invalidate);
    this.listen(this.view.visualViewport, 'scroll', invalidate);
    this.listen(this.document, 'visibilitychange', () => { if (this.document.hidden) this.cancelFrame(); else invalidate(); });
    this.listen(this.view, 'pagehide', event => {
      if (event.persisted) this.cancelFrame(); else this.dispose();
    });
    this.listen(this.view, 'pageshow', event => {
      if (event.persisted && !this.disposed) this.ready = this.setOptions(this.policy, {force: true});
    });
    this.listen(this.view, 'beforeprint', () => { this.printing = true; if (this.canvas) this.canvas.style.visibility = 'hidden'; });
    this.listen(this.view, 'afterprint', () => { this.printing = false; invalidate(); });
    this.listen(this.document.fonts, 'loadingdone', () => { this.atlas.reset(); this.stylesDirty = true; invalidate(); });
    this.forcedColors = this.view.matchMedia('(forced-colors: active)');
    this.listen(this.forcedColors, 'change', () => { this.ready = this.setOptions(this.policy, {force: true}); });
    for (const media of ['(prefers-color-scheme: dark)','(prefers-reduced-motion: reduce)','(prefers-contrast: more)']) {
      this.listen(this.view.matchMedia(media),'change',()=>this.invalidateStyles());
    }
    this.armDPR();
  }
  armDPR() {
    this.dprCleanup?.();
    const query = this.view.matchMedia(`(resolution: ${this.view.devicePixelRatio || 1}dppx)`);
    const changed = () => { this.atlas.reset(); this.stylesDirty = true; this.armDPR(); this.invalidate(); };
    query.addEventListener('change', changed); this.dprCleanup = () => query.removeEventListener('change', changed);
  }
  canvasForBackend() {
    const canvas = this.document.createElement('canvas'); canvas.dataset.vbRenderLayer = ''; canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;margin:0;padding:0;border:0;pointer-events:none;z-index:2147483000;visibility:hidden;contain:strict';
    this.document.documentElement.append(canvas); return canvas;
  }
  async setOptions(value, {force = false} = {}) {
    if (this.disposed) return this.getStats();
    const next = normalizeRendering(value), old = this.policy;
    this.policy = next;
    this.document.dispatchEvent(new this.view.CustomEvent('vb-rendering-policy', {detail: {...next, fallbacks: [...next.fallbacks]}}));
    if (!force && old.backend === next.backend && JSON.stringify(old.fallbacks) === JSON.stringify(next.fallbacks) && this.driver) {
      this.atlas.reset(); this.invalidate(); return this.getStats();
    }
    const generation = ++this.generation; this.cancelFrame(); this.releaseDriver(); this.attempts = [];
    const candidates = this.forcedColors.matches ? ['html'] : renderingCandidates(next);
    this.candidates = candidates; this.candidateIndex = -1;
    return this.activate(candidates, 0, generation);
  }
  async activate(candidates, start, generation) {
    for (let index = start; index < candidates.length; index++) {
      if (this.disposed || generation !== this.generation) return this.getStats();
      const name = candidates[index]; this.candidateIndex = index;
      if (name === 'html') { this.backend = 'html'; this.publish(); return this.getStats(); }
      const canvas = this.canvasForBackend(); let painter;
      try {
        painter = await this.factory(name, canvas, {onLost: reason => {
          if (!this.disposed && this.generation === generation && this.driver === painter) this.fallback(reason);
        }});
        if (this.disposed || generation !== this.generation) { painter?.dispose(); canvas.remove(); return this.getStats(); }
        this.canvas = canvas; this.driver = painter; this.backend = name; this.stylesDirty = true;
        this.observer.observe(this.document.documentElement, {childList: true, subtree: true, attributes: true, characterData: true, characterDataOldValue: true});
        this.releaseStyleActivity = subscribeStyleActivity(this.view, () => { this.stylesDirty = true; this.invalidate(); });
        this.renderNow();
        if (this.driver === painter) this.publish();
        return this.getStats();
      } catch (error) {
        painter?.dispose(); canvas.remove();
        if (this.disposed || generation !== this.generation) return this.getStats();
        // The first frame can fail after observe() connected. HTML fallback
        // must not retain an observer (or a queued frame) from the failed driver.
        this.cancelFrame(); this.releaseStyleActivity?.(); this.releaseStyleActivity = null; this.observer.disconnect(); this.disconnectResizeTargets();
        this.observedElements.clear(); this.retained.clear(); this.adapter?.clear?.(); this.atlas?.reset?.(); this.animating = false;
        this.driver = null; this.canvas = null; this.backend = 'html';
        this.attempts.push({backend: name, reason: error.message || String(error)});
      }
    }
    this.backend = 'html'; this.publish(); return this.getStats();
  }
  fallback(reason) {
    if (this.disposed) return;
    this.attempts.push({backend: this.backend, reason}); this.cancelFrame(); this.releaseDriver();
    const generation = ++this.generation;
    this.ready = this.activate(this.candidates || ['html'], this.candidateIndex + 1, generation);
  }
  /** Explicit integration hook for pre-captured native methods or custom paint. */
  invalidateStyles() { this.stylesDirty = true; this.invalidate(); }
  invalidate() {
    if (this.disposed || this.printing || this.document.hidden || !this.driver) return;
    this.metrics.invalidations++;
    if (this.frame != null) return;
    this.frame = this.view.requestAnimationFrame(() => { this.frame = null; try { this.renderNow(); } catch (error) { this.fallback(error.message || String(error)); } });
  }
  syncResizeTargets() {
    if (!this.resizeObserver || !this.driver || this.disposed) return;
    const next = this.adapter.elements || new Set([this.document.body]);
    const same = next.size === this.observedElements.size && [...next].every(node => this.observedElements.has(node));
    // A caller can render synchronously from its own ResizeObserver callback.
    // Adding a shallower target during that delivery creates skipped observations
    // and a resize-loop error, despite this renderer never changing layout.
    // Defer target registration to a task, NOT a microtask in the delivery loop.
    // Sources: https://www.w3.org/TR/resize-observer/#broadcast-active-observations
    //          https://www.w3.org/TR/resize-observer/#deliver-resize-loop-error
    if (same && !this.resizeTargetsTask) return;
    this.pendingResizeTargets = new Set(next);
    if (this.resizeTargetsTask) return;
    const task = {generation: this.generation, handle: null};
    this.resizeTargetsTask = task;
    task.handle = this.view.setTimeout(() => {
      if (this.resizeTargetsTask !== task) return;
      this.resizeTargetsTask = null;
      const targets = this.pendingResizeTargets; this.pendingResizeTargets = null;
      if (this.disposed || !this.driver || task.generation !== this.generation || !targets) return;
      for (const node of this.observedElements) if (!targets.has(node)) this.resizeObserver.unobserve(node);
      for (const node of targets) if (!this.observedElements.has(node)) this.resizeObserver.observe(node);
      this.observedElements = targets;
    }, 0);
  }
  disconnectResizeTargets() {
    if (this.resizeTargetsTask) this.view.clearTimeout(this.resizeTargetsTask.handle);
    this.resizeTargetsTask = null; this.pendingResizeTargets = null;
    this.resizeObserver?.disconnect(); this.observedElements.clear();
  }
  renderNow({force = false} = {}) {
    if (this.disposed || !this.driver || this.printing) return;
    this.cancelFrame();
    const start = this.view.performance.now();
    // Sample active CSS/Web Animations on demand; once they finish or pause,
    // no perpetual RAF loop remains. Animation events invalidate the first frame.
    // Source: https://www.w3.org/TR/web-animations-1/#dom-document-getanimations
    const animations = this.document.getAnimations?.() || [];
    const animating = animations.some(a => (a.playState === 'running' || a.pending) && !a.effect?.target?.closest?.('[data-vb-render-layer]'));
    if (this.stylesDirty || this.animating || animating) { this.adapter.invalidateStyles(); this.stylesDirty = false; }
    this.animating = animating;
    const scene = this.sceneFactory(this.policy);
    const plan = this.retained.update(scene);
    this.syncResizeTargets();
    const built = this.view.performance.now();
    const resized = this.canvas.width !== Math.round(scene.width * scene.dpr) || this.canvas.height !== Math.round(scene.height * scene.dpr);
    const painted = force || resized || plan.changed;
    if (painted) { this.driver.render(plan.scene); this.metrics.frames++; }
    else this.metrics.unchangedFrames++;
    const submitted = this.view.performance.now();
    this.metrics.sceneBuilds++;
    if (this.canvas.style.visibility !== 'visible') this.canvas.style.visibility = 'visible';
    this.metrics.builds.push(built - start); this.metrics.submissions.push(submitted - built);
    if (this.metrics.builds.length > 120) { this.metrics.builds.shift(); this.metrics.submissions.shift(); }
    this.metrics.last = {buildMs: built - start, submitCpuMs: submitted - built, submitted: painted, commands: scene.commands.length, dpr: scene.dpr, width: this.canvas.width, height: this.canvas.height, ...scene.stats};
    if (animating) this.invalidate();
  }
  cancelFrame() { if (this.frame != null) this.view.cancelAnimationFrame(this.frame); this.frame = null; }
  publish() {
    this.document.dispatchEvent(new this.view.CustomEvent('vb-rendering-status', {detail: this.getStats()}));
  }
  getStats() {
    const percentile = (array, quantile) => { if (!array.length) return 0; const sorted = [...array].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))]; };
    return {styleObservation: this.releaseStyleActivity?.capabilities || null, requested: this.policy.backend, active: this.backend, text: this.policy.text, forcedColors: this.forcedColors?.matches || false, attempts: this.attempts.map(a => ({...a})), adapter: this.driver?.adapterInfo ? {...this.driver.adapterInfo} : null,
      frames: this.metrics.frames, textStyleReuses: this.metrics.textStyleReuses || 0, sceneBuilds: this.metrics.sceneBuilds, unchangedFrames: this.metrics.unchangedFrames, invalidations: this.metrics.invalidations, buildP50Ms: percentile(this.metrics.builds, .5), buildP95Ms: percentile(this.metrics.builds, .95), submitCpuP50Ms: percentile(this.metrics.submissions, .5), submitCpuP95Ms: percentile(this.metrics.submissions, .95), last: this.metrics.last ? JSON.parse(JSON.stringify(this.metrics.last)) : null, driver: this.driver ? {...this.driver.stats} : null};
  }
  releaseDriver() { this.releaseStyleActivity?.(); this.releaseStyleActivity = null; this.observer?.disconnect(); this.disconnectResizeTargets(); this.observedElements.clear(); this.retained.clear(); this.adapter?.clear?.(); this.atlas?.reset?.(); this.animating = false; this.stylesDirty = true; this.driver?.dispose(); this.driver = null; this.canvas?.remove(); this.canvas = null; this.backend = 'html'; }
  dispose() {
    if (this.disposed) return; this.disposed = true; this.generation++; this.cancelFrame(); this.observer.disconnect(); this.dprCleanup?.();
    for (const remove of this.listeners.splice(0)) remove(); this.releaseDriver(); this.atlas.dispose();
  }
}
/** Reference-counted integration: multiple runtime hosts can share one document. */
function retainRenderer(document, policy = {}) {
  let session = sessions.get(document);
  if (!session || session.renderer.disposed) { session = {renderer: new UIRenderer(document, policy), count: 0}; sessions.set(document, session); }
  session.count++;
  let released = false;
  return {renderer: session.renderer, release() {
    if (released) return; released = true;
    if (--session.count === 0) { session.renderer.dispose(); if (sessions.get(document) === session) sessions.delete(document); }
  }};
}
function rendererForDocument(document) { return sessions.get(document)?.renderer || null; }

return {createPainter,UIRenderer,retainRenderer,rendererForDocument};
})();

/* benchmark.js */
__modules[15]=(()=>{
const {PaintScene}=__modules[1];
const {createPainter}=__modules[14];
const {deadline}=__modules[3];



function timingSummary(samples) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a,b) => a-b);
  return {samples: [...samples], count: samples.length, p50Ms: sorted[Math.floor(sorted.length*.5)], p95Ms: sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]};
}
/** Diagnostic-only pass timestamps. They are NOT frame latency or FPS.
 * Sources: https://www.w3.org/TR/webgpu/#timestamp-query
 * https://www.w3.org/TR/webgpu/#dom-gpurenderpasstimestampwrites
 * All resources are private to a benchmark; no normal-frame readbacks/waits.
 */
class PassTimer {
  constructor(painter) {
    this.painter = painter; this.device = painter.device;
    if (!this.device?.features.has('timestamp-query')) return;
    const B = painter.view.GPUBufferUsage;
    try {
      this.querySet = this.device.createQuerySet({type:'timestamp', count:2});
      this.resolve = this.device.createBuffer({size:16, usage:B.QUERY_RESOLVE | B.COPY_SRC});
      this.readback = this.device.createBuffer({size:16, usage:B.COPY_DST | B.MAP_READ});
    } catch (error) { this.dispose(); throw error; }
  }
  async measure(scene) {
    const p = this.painter, now = () => p.view.performance.now(), start = now();
    p.render(scene, this.querySet ? {timing:this} : {});
    const cpuMs = now()-start;
    if (!this.querySet) return {cpuMs, gpuMs:null};
    await deadline(this.readback.mapAsync(p.view.GPUMapMode.READ), 3000, 'GPU timestamp readback timed out');
    try {
      const data = new BigUint64Array(this.readback.getMappedRange());
      return {cpuMs, gpuMs: data[1] >= data[0] ? Number(data[1]-data[0])/1e6 : null};
    } finally { this.readback.unmap(); }
  }
  dispose() { this.querySet?.destroy(); this.resolve?.destroy(); this.readback?.destroy(); this.querySet = this.resolve = this.readback = null; }
}
/** Run on the actual user's adapter, preserving all IDE/project/render settings.
 * Opaque sealed primitives isolate painter submission and optional pass time.
 * The native HTML compositor is not comparable to a canvas submission call, so
 * this report explicitly does not invent an HTML FPS or whole-IDE speedup.
 */
async function benchmarkRendering(document, {frames = 30, quads = 10000, backends = ['webgpu','webgl2','canvas2d'], signal, onProgress = () => {}} = {}) {
  if (!Number.isInteger(frames) || frames < 1 || frames > 120 || !Number.isInteger(quads) || quads < 1 || quads > 10000) throw new RangeError('Benchmark frames (1–120) and quads (1–10000) must be bounded integers');
  if (!Array.isArray(backends) || !backends.length || backends.some(b => !['webgpu','webgl2','canvas2d'].includes(b))) throw new TypeError('Invalid benchmark backends');
  const view = document.defaultView, results = [], now = () => view.performance.now();
  const abort = () => { if (signal?.aborted) throw new view.DOMException('Rendering measurement cancelled','AbortError'); };
  const scene = new PaintScene(512,512);
  for (let i=0;i<quads;i++) scene.add([(i%100)*5,Math.floor(i/100)*5,4,4],[.2,.4,.8,1]);
  scene.seal();
  for (const backend of [...new Set(backends)]) {
    abort(); onProgress(backend);
    const canvas = document.createElement('canvas'); // Detached: no changes to IDE layout or hit testing.
    let painter, timer;
    try {
      painter = await createPainter(backend,canvas); abort();
      timer = new PassTimer(painter);
      const cpu = [], gpu = [];
      painter.render(scene); // Warm allocation/packing is not mixed into repeated submission timings.
      if (painter.device) await deadline(painter.device.queue.onSubmittedWorkDone(),3000);
      for (let i=0;i<frames;i++) {
        abort();
        if (i%5 === 0) { await new Promise(resolve => view.setTimeout(resolve,0)); abort(); } // Keep cancellation/UI responsive, including hidden tabs.
        if (painter.device) {
          const sample = await timer.measure(scene); cpu.push(sample.cpuMs);
          if (sample.gpuMs !== null) gpu.push(sample.gpuMs);
        } else { const start=now(); painter.render(scene); cpu.push(now()-start); }
      }
      if (painter.device) await deadline(painter.device.queue.onSubmittedWorkDone(),3000);
      results.push({backend, available:true, adapter:painter.adapterInfo || null,
        cpuSubmission:timingSummary(cpu), gpuPass:timingSummary(gpu), counters:{...painter.stats}});
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      results.push({backend, available:false, reason:error.message || String(error)});
    } finally { timer?.dispose(); painter?.dispose(); canvas.width=canvas.height=1; }
  }
  abort();
  return {schema:1, frames, quads, width:512, height:512, dpr:1, userAgent:view.navigator.userAgent, results,
    claims:{physicalHardwareCertified:false, nativeVB6PixelParityCertified:false, wholeIDEPerformanceCompared:false},
    note:'CPU submission and optional GPU pass timestamps for sealed primitives only. No presentation/FPS, input latency, power or native HTML compositor comparison. Adapter may be software. Timestamp values may be quantized.'};
}

return {timingSummary,PassTimer,benchmarkRendering};
})();

/* entry.js */
__modules[16]=(()=>{
const {BACKENDS, DEFAULT_RENDERING, normalizeRendering, renderingCandidates, physicalSize, snapRect, intersect}=__modules[0];
const {PaintScene, parseColor}=__modules[1];
const {TextAtlas}=__modules[2];
const {WebGPUPainter, UI_SHADER}=__modules[5];
const {WebGLPainter}=__modules[6];
const {CanvasPainter}=__modules[7];
const {UIRenderer, createPainter, retainRenderer, rendererForDocument}=__modules[14];
const {benchmarkRendering, timingSummary}=__modules[15];









return {benchmarkRendering,timingSummary,BACKENDS,DEFAULT_RENDERING,normalizeRendering,renderingCandidates,physicalSize,snapRect,intersect,PaintScene,parseColor,TextAtlas,WebGPUPainter,UI_SHADER,WebGLPainter,CanvasPainter,UIRenderer,createPainter,retainRenderer,rendererForDocument};
})();
globalThis["VB6Rendering"]=__modules[16];
})();
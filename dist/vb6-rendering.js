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
  const fallbacks = [...new Set(input.filter(item => BACKENDS.includes(item) && item !== backend && item !== 'webgpu'))];
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
    this.width = width; this.height = height; this.dpr = dpr; this.pixelSnap = pixelSnap;
    this.clip = [0, 0, width, height]; this.commands = []; this.maxCommands = maxCommands;
    this.stats = {elements: 0, nativeIslands: 0, nativeText: 0, gpuText: 0, reasons: {}};
  }
  add(rect, color, {clip = this.clip, color2 = color, vertical = false, page = null, uv = [0, 0, 1, 1], hole = false, snap = true} = {}) {
    if (!rect.every(Number.isFinite) || rect[2] <= 0 || rect[3] <= 0) return;
    rect = this.pixelSnap && snap ? snapRect(rect, this.dpr) : rect;
    clip = intersect(clip, this.clip);
    if (intersect(rect, clip).slice(2).some(n => n <= 0)) return;
    if (!hole && (!color || color[3] <= 0) && !page) return;
    if (this.commands.length >= this.maxCommands) throw new RangeError('UI paint command budget exceeded.');
    this.commands.push({rect, clip, color, color2, vertical, page, uv, hole});
  }
  native(rect, clip, reason = 'native') {
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
      const device = await adapter.requestDevice();
      const info = adapter.info || {};
      device.lost.then(() => { if (devices.get(view) === pending) devices.delete(view); });
      return {device, info: {vendor: info.vendor || '', architecture: info.architecture || '', description: info.description || '', isFallbackAdapter: info.isFallbackAdapter ?? adapter.isFallbackAdapter ?? null}};
    })();
    devices.set(view, pending);
    pending.catch(() => { if (devices.get(view) === pending) devices.delete(view); });
  }
  return deadline(pending, timeout);
}

return {deadline,acquireDevice};
})();

/* webgpu.js */
__modules[4]=(()=>{
const {acquireDevice, deadline}=__modules[3];
const {physicalSize}=__modules[0];


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
 @location(4) uv: vec4f, @location(5) meta: vec4f) -> Output {
 let corners = array<vec2f, 6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
 let p = corners[vertex]; let xy = rect.xy + p * rect.zw;
 var out: Output;
 out.position = vec4f(xy.x / screen.size.x * 2.0 - 1.0, 1.0 - xy.y / screen.size.y * 2.0, 0.0, 1.0);
 out.uv = uv.xy + p * uv.zw; out.clip = clip; out.mode = meta.x;
 out.color = mix(color, color2, select(p.x, p.y, meta.y > 0.5));
 return out;
}
@fragment fn fs(input: Output) -> @location(0) vec4f {
 let xy = input.position.xy / screen.scale;
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
    try { await deadline(painter.initialize(timeout), timeout * 2); return painter; }
    catch (error) { painter.dispose(); throw error; }
  }
  constructor(canvas, onLost) {
    this.canvas = canvas; this.view = canvas.ownerDocument.defaultView; this.onLost = onLost; this.name = 'webgpu'; this.disposed = false;
    this.textures = new Map(); this.stats = {frames: 0, drawCalls: 0, uploadedBytes: 0, bufferAllocations: 0};
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
    device.lost.then(info => { if (!this.disposed) this.onLost('WebGPU device lost: ' + (info.message || info.reason)); });
  }
  image(page) {
    if (!page) return this.whiteGroup;
    let record = this.textures.get(page);
    if (!record) {
      const T = this.view.GPUTextureUsage;
      const texture = this.device.createTexture({size: [page.width, page.height], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT});
      record = {texture, revision: -1, group: this.device.createBindGroup({layout: this.imageLayout, entries: [{binding: 0, resource: texture.createView()}]})}; this.textures.set(page, record);
    }
    if (record.revision !== page.revision) {
      this.device.queue.copyExternalImageToTexture({source: page.canvas}, {texture: record.texture, premultipliedAlpha: false}, [page.width, page.height]);
      record.revision = page.revision; this.stats.uploadedBytes += page.width * page.height * 4;
    }
    return record.group;
  }
  render(scene) {
    const usedPages = new Set(scene.commands.map(command => command.page).filter(Boolean));
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
    const groups = []; let at = 0;
    for (const command of scene.commands) {
      this.data.set(command.rect, at); this.data.set(command.clip, at + 4); this.data.set(command.color, at + 8); this.data.set(command.color2, at + 12); this.data.set(command.uv, at + 16);
      this.data.set([command.hole ? 2 : command.page ? 1 : 0, command.vertical ? 1 : 0, 0, 0], at + 20); at += 24;
      const image = this.image(command.page), previous = groups.at(-1);
      if (previous && previous.image === image && previous.hole === command.hole) previous.count++;
      else groups.push({image, hole: command.hole, first: at / 24 - 1, count: 1});
    }
    device.queue.writeBuffer(this.uniform, 0, new Float32Array([scene.width, scene.height, size.scaleX, size.scaleY]));
    if (count) { device.queue.writeBuffer(this.buffer, 0, this.data, 0, count * 24); this.stats.uploadedBytes += count * 96; }
    const encoder = device.createCommandEncoder({label: 'VB6 UI frame'});
    const pass = encoder.beginRenderPass({colorAttachments: [{view: this.context.getCurrentTexture().createView(), clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store'}]});
    pass.setBindGroup(0, this.screenGroup); pass.setVertexBuffer(0, this.buffer);
    for (const group of groups) { pass.setPipeline(group.hole ? this.holePipeline : this.pipeline); pass.setBindGroup(1, group.image); pass.draw(6, group.count, 0, group.first); }
    pass.end(); device.queue.submit([encoder.finish()]); this.stats.frames++; this.stats.drawCalls = groups.length; this.stats.atlasPages = this.textures.size;
  }
  disposeResources() {
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
__modules[5]=(()=>{
const {physicalSize}=__modules[0];

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
 vec2 xy=vec2(gl_FragCoord.x/screen.z,screen.y-gl_FragCoord.y/screen.w);
 if(any(lessThan(xy,clip.xy))||any(greaterThanEqual(xy,clip.xy+clip.zw)))discard;
 if(mode>1.5){outputColor=vec4(0);return;}
 vec4 c=mode>.5?texture(image,uv)*tint:tint; outputColor=vec4(c.rgb*c.a,c.a);
}`;
class WebGLPainter {
  constructor(canvas, {onLost = () => {}} = {}) {
    this.canvas = canvas; this.name = 'webgl2'; this.textures = new Map(); this.stats = {frames: 0, drawCalls: 0, uploadedBytes: 0, bufferAllocations: 0};
    const gl = this.gl = canvas.getContext('webgl2', {alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance'});
    if (!gl) throw new Error('WebGL2 unavailable');
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
    if (record.revision !== page.revision) {
      gl.bindTexture(gl.TEXTURE_2D, record.texture); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, page.canvas); record.revision = page.revision; this.stats.uploadedBytes += page.width * page.height * 4;
    }
    return record.texture;
  }
  render(scene) {
    const usedPages = new Set(scene.commands.map(command => command.page).filter(Boolean));
    for (const [page, record] of this.textures) if (!usedPages.has(page)) { this.gl.deleteTexture(record.texture); this.textures.delete(page); }
    const gl = this.gl; if (this.disposed || gl.isContextLost()) throw new Error('WebGL2 context lost');
    const size = physicalSize(scene.width, scene.height, scene.dpr, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    if (this.canvas.width !== size.width) this.canvas.width = size.width;
    if (this.canvas.height !== size.height) this.canvas.height = size.height;
    gl.viewport(0, 0, size.width, size.height); gl.disable(gl.DITHER); gl.disable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program); gl.uniform4f(this.uniform, scene.width, scene.height, size.scaleX, size.scaleY); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const required = Math.max(24, scene.commands.length * 24);
    if (!this.data || this.data.length < required) { this.data = new Float32Array(Math.max(1024, 2 ** Math.ceil(Math.log2(required)))); gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW); this.stats.bufferAllocations++; }
    const groups = []; let at = 0;
    for (const c of scene.commands) {
      this.data.set(c.rect, at); this.data.set(c.clip, at + 4); this.data.set(c.color, at + 8); this.data.set(c.color2, at + 12); this.data.set(c.uv, at + 16); this.data.set([c.hole ? 2 : c.page ? 1 : 0, c.vertical ? 1 : 0, 0, 0], at + 20); at += 24;
      const image = this.image(c.page), previous = groups.at(-1);
      if (previous && previous.image === image && previous.hole === c.hole) previous.count++; else groups.push({first: at / 24 - 1, count: 1, image, hole: c.hole});
    }
    if (at) gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, at)); this.stats.uploadedBytes += at * 4;
    for (const group of groups) {
      group.hole ? gl.disable(gl.BLEND) : gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.bindTexture(gl.TEXTURE_2D, group.image);
      for (let i = 0; i < 6; i++) gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 96, group.first * 96 + i * 16);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, group.count);
    }
    const error = gl.getError(); if (error !== gl.NO_ERROR) throw new Error('WebGL2 rendering error: ' + error);
    this.stats.frames++; this.stats.drawCalls = groups.length; this.stats.atlasPages = this.textures.size;
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; this.canvas.removeEventListener('webglcontextlost', this.lost);
    const gl = this.gl; if (!gl) return;
    for (const record of this.textures.values()) gl.deleteTexture(record.texture); this.textures.clear();
    gl.deleteTexture(this.white); gl.deleteBuffer(this.buffer); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

return {WebGLPainter};
})();

/* canvas2d.js */
__modules[6]=(()=>{
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

/* dom-scene.js */
__modules[7]=(()=>{
const {PaintScene, parseColor, splitCSS}=__modules[1];
const {intersect}=__modules[0];


const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'HEAD']);
const NATIVE = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'IFRAME', 'VIDEO', 'AUDIO', 'CANVAS', 'SVG', 'IMG', 'OBJECT', 'EMBED', 'TABLE', 'METER', 'PROGRESS']);
const rectOf = rect => [rect.left, rect.top, rect.width, rect.height];
const number = value => Number.parseFloat(value) || 0;
const STYLE_KEYS = ['color','display','visibility','position','zIndex','overflowX','overflowY','boxShadow','outlineWidth','outlineStyle','opacity','filter','backdropFilter','mixBlendMode','clipPath','maskImage','writingMode','transform','borderImageSource','backgroundColor','backgroundImage','font','fontWeight','fontSize','fontFamily','fontKerning','direction','letterSpacing','textShadow','textDecorationLine','textOverflow','whiteSpace', ...['Top','Right','Bottom','Left'].flatMap(s=>['Width','Style','Color'].map(p=>'border'+s+p)), ...['TopLeft','TopRight','BottomLeft','BottomRight'].map(s=>'border'+s+'Radius')];
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
  constructor(document, atlas) { this.document = document; this.view = document.defaultView; this.atlas = atlas; this.styles = new WeakMap(); }
  build(policy) {
    const view = this.view, width = view.innerWidth, height = view.innerHeight;
    const scene = new PaintScene(width, height, {dpr: view.devicePixelRatio || 1, pixelSnap: policy.pixelSnap});
    this.scene = scene; this.policy = policy; this.selection = this.document.getSelection(); this.atlas.begin();
    let background;
    try { background = parseColor(this.style(this.document.body).backgroundColor); } catch { background = [1, 1, 1, 1]; }
    if (background[3] === 0) { try { background = parseColor(this.style(this.document.documentElement).backgroundColor); } catch {} }
    if (background[3] === 0) background = [1, 1, 1, 1];
    scene.add([0, 0, width, height], background);
    this.element(this.document.body, scene.clip, 0);
    return scene;
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
  invalidateStyles(node = null) {
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
    if (NATIVE.has(node.tagName.toUpperCase()) || node.isContentEditable || node.matches('[data-vb-native-render],.code-editor,.source-editor,.editor-container,.vb-richtext')) return 'native control, image or editor';
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
    // visibility may be overridden by a descendant, so do not drop the subtree.
    const visible = style.visibility === 'visible', rect = rectOf(node.getBoundingClientRect());
    const area = intersect(rect, clip), inView = area[2] > 0 && area[3] > 0;
    if (!inView && style.overflowX !== 'visible' && style.overflowY !== 'visible') return;
    this.scene.stats.elements++;
    if (visible && inView) {
      const reason = this.unsupported(node, style);
      if (reason) { this.native(node, rect, clip, reason); return; }
    }
    const scaleX = node.offsetWidth ? rect[2] / node.offsetWidth : 1, scaleY = node.offsetHeight ? rect[3] / node.offsetHeight : 1;
    let borders, shadows, background, gradient;
    try {
      if (!style.paint) {
        const sourceBorders = ['Top', 'Right', 'Bottom', 'Left'].map(side => ({width: number(style['border' + side + 'Width']), style: style['border' + side + 'Style'], color: parseColor(style['border' + side + 'Color'])}));
        if (sourceBorders.some(b => b.width && !['solid', 'none', 'hidden'].includes(b.style))) throw new Error('non-solid border');
        if (sourceBorders.some(b => b.width && b.color[3] === 0) && sourceBorders.some(b => b.width && b.color[3] > 0)) throw new Error('CSS border wedge');
        style.paint = {borders: sourceBorders, shadows: shadowParts(style.boxShadow), background: parseColor(style.backgroundColor), gradient: this.gradient(style.backgroundImage)};
      }
      borders = scaleX === 1 && scaleY === 1 ? style.paint.borders : style.paint.borders.map((b, i) => ({...b, width: b.width * (i % 2 ? scaleX : scaleY)}));
      ({shadows, background, gradient} = style.paint);
    } catch (error) { if (visible && inView) this.native(node, rect, clip, error.message); else this.children(node, clip, depth); return; }
    if (visible && inView) {
      for (const s of [...shadows].reverse()) if (!s.inset) this.scene.add([rect[0] + s.x * scaleX, rect[1] + s.y * scaleY, rect[2], rect[3]], s.color, {clip});
      this.scene.add(rect, background, {clip});
      if (gradient) this.scene.add(rect, gradient.start, {clip, color2: gradient.end, vertical: gradient.vertical});
      const [t, r, b, l] = borders.map(item => item.width), [x, y, w, h] = rect;
      // CSS solid border corners are split diagonally. Use native corner squares
      // for multicolor bevels; long edges remain native GPU primitives.
      this.scene.add([x + l, y, w - l - r, t], borders[0].color, {clip});
      this.scene.add([x + w - r, y + t, r, h - t - b], borders[1].color, {clip});
      this.scene.add([x + l, y + h - b, w - l - r, b], borders[2].color, {clip});
      this.scene.add([x, y + t, l, h - t - b], borders[3].color, {clip});
      for (const corner of [[x, y, l, t], [x + w - r, y, r, t], [x, y + h - b, l, b], [x + w - r, y + h - b, r, b]]) if (corner[2] && corner[3]) this.scene.add(corner, [0, 0, 0, 0], {clip, hole: true});
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
    }
    let childClip = clip;
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
      const own = [rect[0] + node.clientLeft * scaleX, rect[1] + node.clientTop * scaleY, node.clientWidth * scaleX, node.clientHeight * scaleY];
      childClip = intersect(clip, [style.overflowX === 'visible' ? clip[0] : own[0], style.overflowY === 'visible' ? clip[1] : own[1], style.overflowX === 'visible' ? clip[2] : own[2], style.overflowY === 'visible' ? clip[3] : own[3]]);
    }
    this.children(node, childClip, depth);
    // Native scrollbar thumbs/buttons remain interactive and platform accurate.
    if (visible && inView && borders) {
      const [t, r, b, l] = borders.map(item => item.width);
      const sw = rect[2] - node.clientWidth * scaleX - l - r, sh = rect[3] - node.clientHeight * scaleY - t - b;
      if (node.clientWidth && sw > .5) this.scene.native([rect[0] + rect[2] - r - sw, rect[1] + t, sw, rect[3] - t - b], clip, 'scrollbar');
      if (node.clientHeight && sh > .5) this.scene.native([rect[0] + l, rect[1] + rect[3] - b - sh, rect[2] - l - r, sh], clip, 'scrollbar');
    }
  }
  children(node, clip, depth) {
    // Stable order for the classic IDE's local stacking contexts, including MDI z-order.
    const nodes = [...node.childNodes].map((child, index) => {
      let z = 0, positioned = false;
      if (child.nodeType === 1) { const style = this.style(child); z = Number(style.zIndex) || 0; positioned = style.position !== 'static'; }
      return {child, index, z, group: z < 0 ? -1 : z > 0 ? 2 : positioned ? 1 : 0};
    }).sort((a, b) => a.group - b.group || a.z - b.z || a.index - b.index);
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
    const range = this.document.createRange(); range.selectNodeContents(node);
    const rectangles = [...range.getClientRects()].map(rectOf).filter(r => r[2] && r[3]);
    if (!rectangles.length) return;
    const native = this.policy.text !== 'gpu' || style.textShadow !== 'none' || style.textDecorationLine !== 'none' || style.direction !== 'ltr' || style.letterSpacing !== 'normal' || Math.abs((node.parentElement.getBoundingClientRect().width / (node.parentElement.offsetWidth || 1)) - 1) > .01 || (this.selection?.rangeCount && this.selection.containsNode(node, true));
    if (native || rectangles.length !== 1 || style.textOverflow === 'ellipsis' || this.style(node.parentElement).transform !== 'none') {
      for (const rect of rectangles) this.scene.native([rect[0] - 1, rect[1] - 1, rect[2] + 2, rect[3] + 2], clip, 'native text');
      this.scene.stats.nativeText++; return;
    }
    const rect = rectangles[0]; let text = node.textContent;
    if (!style.whiteSpace.startsWith('pre')) text = text.replace(/\s+/g, ' ');
    const glyph = this.atlas.text(text, style, rect, this.scene.dpr);
    if (!glyph) { this.scene.native(rect, clip, 'text atlas capacity'); return; }
    this.scene.add(glyph.rect, [1, 1, 1, 1], {clip, page: glyph.page, uv: glyph.uv, snap: false}); this.scene.stats.gpuText++;
  }
}

return {DOMScene};
})();

/* renderer.js */
__modules[8]=(()=>{
const {normalizeRendering, renderingCandidates}=__modules[0];
const {CanvasPainter}=__modules[6];
const {WebGPUPainter}=__modules[4];
const {WebGLPainter}=__modules[5];
const {TextAtlas}=__modules[2];
const {DOMScene}=__modules[7];






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
    this.observe(); this.ready = this.setOptions(policy, {force: true});
  }
  listen(target, type, listener, options) { target?.addEventListener(type, listener, options); this.listeners.push(() => target?.removeEventListener(type, listener, options)); }
  observe() {
    const invalidate = event => {
      if (event?.type === 'vb-theme-change' || event?.type === 'resize') this.adapter.invalidateStyles();
      else if (event?.target?.nodeType === 1 && /^(focus|pointer)/.test(event.type)) {
        const scope = event.target.closest('button,[role=treeitem],.tree-row,.property-row,.vb-control,.tool-caption') || event.target;
        this.adapter.invalidateStyles(scope.parentElement);
        if (event.relatedTarget?.nodeType === 1) this.adapter.invalidateStyles(event.relatedTarget.parentElement);
      }
      this.invalidate();
    };
    this.observer = new this.view.MutationObserver(records => {
      let changed = false;
      for (const r of records) {
        const node = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        if (node?.closest('[data-vb-render-layer]')) continue;
        changed = true;
        if (r.type !== 'characterData') this.adapter.invalidateStyles(node);
      }
      if (changed) this.invalidate();
    });
    this.observer.observe(this.document.body, {childList: true, subtree: true, attributes: true, characterData: true});
    for (const event of ['input', 'change', 'focusin', 'focusout', 'pointerover', 'pointerout', 'pointerdown', 'pointerup', 'pointercancel', 'keyup', 'selectionchange', 'vb-theme-change']) this.listen(this.document, event, invalidate, true);
    this.listen(this.document, 'scroll', invalidate, true);
    this.listen(this.view, 'resize', invalidate);
    this.listen(this.view.visualViewport, 'resize', invalidate);
    this.listen(this.view.visualViewport, 'scroll', invalidate);
    this.listen(this.document, 'visibilitychange', () => { if (this.document.hidden) this.cancelFrame(); else invalidate(); });
    this.listen(this.view, 'pagehide', () => this.dispose());
    this.listen(this.view, 'beforeprint', () => { this.printing = true; if (this.canvas) this.canvas.style.visibility = 'hidden'; });
    this.listen(this.view, 'afterprint', () => { this.printing = false; invalidate(); });
    this.listen(this.document.fonts, 'loadingdone', () => { this.atlas.reset(); this.adapter.invalidateStyles(); invalidate(); });
    this.forcedColors = this.view.matchMedia('(forced-colors: active)');
    this.listen(this.forcedColors, 'change', () => { this.ready = this.setOptions(this.policy, {force: true}); });
    this.armDPR();
  }
  armDPR() {
    this.dprCleanup?.();
    const query = this.view.matchMedia(`(resolution: ${this.view.devicePixelRatio || 1}dppx)`);
    const changed = () => { this.atlas.reset(); this.armDPR(); this.invalidate(); };
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
        this.canvas = canvas; this.driver = painter; this.backend = name;
        this.renderNow();
        if (this.driver === painter) this.publish();
        return this.getStats();
      } catch (error) {
        painter?.dispose(); canvas.remove();
        if (this.disposed || generation !== this.generation) return this.getStats();
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
  invalidate() {
    if (this.disposed || this.printing || this.document.hidden || !this.driver) return;
    this.metrics.invalidations++;
    if (this.frame) return;
    this.frame = this.view.requestAnimationFrame(() => { this.frame = 0; try { this.renderNow(); } catch (error) { this.fallback(error.message || String(error)); } });
  }
  renderNow() {
    if (this.disposed || !this.driver || this.printing) return;
    this.cancelFrame();
    const start = this.view.performance.now(), scene = this.sceneFactory(this.policy), built = this.view.performance.now();
    this.driver.render(scene);
    const submitted = this.view.performance.now();
    this.canvas.style.visibility = 'visible'; this.metrics.frames++;
    this.metrics.builds.push(built - start); this.metrics.submissions.push(submitted - built);
    if (this.metrics.builds.length > 120) { this.metrics.builds.shift(); this.metrics.submissions.shift(); }
    this.metrics.last = {buildMs: built - start, submitCpuMs: submitted - built, commands: scene.commands.length, dpr: scene.dpr, width: this.canvas.width, height: this.canvas.height, ...scene.stats};
  }
  cancelFrame() { if (this.frame) this.view.cancelAnimationFrame(this.frame); this.frame = 0; }
  publish() {
    this.document.dispatchEvent(new this.view.CustomEvent('vb-rendering-status', {detail: this.getStats()}));
  }
  getStats() {
    const percentile = (array, quantile) => { if (!array.length) return 0; const sorted = [...array].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))]; };
    return {requested: this.policy.backend, active: this.backend, text: this.policy.text, forcedColors: this.forcedColors?.matches || false, attempts: this.attempts.map(a => ({...a})), adapter: this.driver?.adapterInfo ? {...this.driver.adapterInfo} : null,
      frames: this.metrics.frames, invalidations: this.metrics.invalidations, buildP50Ms: percentile(this.metrics.builds, .5), buildP95Ms: percentile(this.metrics.builds, .95), submitCpuP50Ms: percentile(this.metrics.submissions, .5), submitCpuP95Ms: percentile(this.metrics.submissions, .95), last: this.metrics.last ? JSON.parse(JSON.stringify(this.metrics.last)) : null, driver: this.driver ? {...this.driver.stats} : null};
  }
  releaseDriver() { this.driver?.dispose(); this.driver = null; this.canvas?.remove(); this.canvas = null; this.backend = 'html'; }
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

/* entry.js */
__modules[9]=(()=>{
const {BACKENDS, DEFAULT_RENDERING, normalizeRendering, renderingCandidates, physicalSize, snapRect, intersect}=__modules[0];
const {PaintScene, parseColor}=__modules[1];
const {TextAtlas}=__modules[2];
const {WebGPUPainter, UI_SHADER}=__modules[4];
const {WebGLPainter}=__modules[5];
const {CanvasPainter}=__modules[6];
const {UIRenderer, createPainter, retainRenderer, rendererForDocument}=__modules[8];








return {BACKENDS,DEFAULT_RENDERING,normalizeRendering,renderingCandidates,physicalSize,snapRect,intersect,PaintScene,parseColor,TextAtlas,WebGPUPainter,UI_SHADER,WebGLPainter,CanvasPainter,UIRenderer,createPainter,retainRenderer,rendererForDocument};
})();
globalThis["VB6Rendering"]=__modules[9];
})();
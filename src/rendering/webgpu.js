import {acquireDevice, deadline} from './device.js';
import {physicalSize} from './policy.js';
export const UI_SHADER = `
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
export class WebGPUPainter {
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

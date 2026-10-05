import {physicalSize} from './policy.js';
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
export class WebGLPainter {
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

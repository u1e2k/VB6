import {intersect, snapRect} from './policy.js';
/** A retained paint list. Commands are in CSS pixels, colors are unpremultiplied sRGB. */
export class PaintScene {
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
export function parseColor(value) {
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
export function splitCSS(value) {
  let depth = 0, begin = 0; const result = [];
  for (let i = 0; i < value.length; i++) { if (value[i] === '(') depth++; else if (value[i] === ')') depth--; else if (value[i] === ',' && depth === 0) { result.push(value.slice(begin, i).trim()); begin = i + 1; } }
  result.push(value.slice(begin).trim()); return result;
}
export function rgbaCSS(c) { return `rgba(${c[0] * 255},${c[1] * 255},${c[2] * 255},${c[3]})`; }

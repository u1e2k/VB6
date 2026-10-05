import {PaintScene, parseColor, splitCSS} from './scene.js';
import {intersect} from './policy.js';
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
export class DOMScene {
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

/** Browser-shaped text runs are rasterized once, then sampled by GPU quads.
 * No font files, foreignObject snapshots, HTML rasterizers or network dependencies.
 */
export class TextAtlas {
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

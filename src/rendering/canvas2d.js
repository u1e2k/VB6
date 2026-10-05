import {physicalSize} from './policy.js';
import {rgbaCSS} from './scene.js';
export class CanvasPainter {
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

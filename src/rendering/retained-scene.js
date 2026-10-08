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
export function sameGeometry(a, b) {
  if (!a || !b || a.width !== b.width || a.height !== b.height || a.dpr !== b.dpr || a.pixelSnap !== b.pixelSnap || a.commands.length !== b.commands.length) return false;
  for (let i = 0; i < a.commands.length; i++) {
    const x = a.commands[i], y = b.commands[i];
    if (x.page !== y.page || x.hole !== y.hole || x.vertical !== y.vertical) return false;
    for (const key of ARRAY_KEYS) if (!equalArray(x[key], y[key])) return false;
  }
  return true;
}
export class RetainedScene {
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

import {retainRenderer} from './renderer.js';
import {normalizeRendering, readRendering, writeRendering} from './policy.js';
/** IDE-global preference. Exported applications use their own project snapshot. */
export function installStudioRendering(ide) {
  if (ide.rendering) return ide.rendering;
  const document = ide.root?.ownerDocument || globalThis.document;
  let storage; try { storage = document.defaultView.localStorage; } catch {}
  const main = retainRenderer(document, readRendering(storage)), children = new Map();
  ide.rendering = main.renderer;
  ide.setRenderingPolicy = value => {
    const policy = normalizeRendering(value); writeRendering(storage, policy);
    return Promise.all([main.renderer.setOptions(policy), ...[...children.values()].map(session => session.renderer.setOptions(policy))]);
  };
  // Install into the existing detach lifecycle, without creating any popups or
  // changing MDI mode, ownership, event dispatch or existing window cleanup.
  const host = ide.browserWindows;
  if (host) {
    const decorate = host.decorate;
    host.decorate = record => {
      const cleanup = decorate?.call(host, record);
      const session = retainRenderer(record.doc, main.renderer.policy); children.set(record, session);
      return () => { session.release(); children.delete(record); cleanup?.(); };
    };
    for (const record of host.windows.values()) {
      const session = retainRenderer(record.doc, main.renderer.policy); children.set(record, session);
      record.cleanups.push(() => { session.release(); children.delete(record); });
    }
  }
  document.defaultView.addEventListener('pagehide', () => {
    for (const session of children.values()) session.release(); children.clear(); main.release();
  }, {once: true});
  return main.renderer;
}

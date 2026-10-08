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
  ide.retryRendering = () => Promise.all([main.renderer.retry(), ...[...children.values()].map(session => session.renderer.retry())]);
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
  // A persisted page is suspended, not disposed. Keep our retained reference so
  // the renderer's pageshow handler can restore its device after BFCache return.
  // Do not use once:true: a persisted pagehide must not consume final cleanup.
  // Source: https://html.spec.whatwg.org/multipage/browsing-the-web.html#the-page-transition-events
  const release = event => {
    if (event.persisted) return;
    document.defaultView.removeEventListener('pagehide', release);
    for (const session of children.values()) session.release(); children.clear(); main.release();
  };
  document.defaultView.addEventListener('pagehide', release);
  return main.renderer;
}

import {el} from '../core/core.js';
import {renderingAdvice, renderingEnvironment} from './diagnostics.js';
/** Live status is separate from draft Options controls. All retries use saved policy. */
export function createRenderingStatus(ide, names) {
  const renderer = ide.rendering;
  const document = renderer?.document || globalThis.document, view = document.defaultView;
  const summary = el('p', {'data-renderer-status': '', 'aria-live': 'polite'});
  const failures = el('p', {class: 'tool-note', 'data-renderer-attempts': ''});
  const adapter = el('p', {class: 'tool-note', 'data-renderer-adapter': ''});
  const advice = el('p', {class: 'tool-note', 'data-renderer-advice': ''});
  const retry = el('button', {type: 'button'}, 'Retry Renderer');
  const save = el('button', {type: 'button'}, 'Save Diagnostics...');
  const node = el('fieldset', {}, el('legend', {}, 'Current renderer'), summary, failures, adapter, advice, retry, save,
    el('p', {class: 'tool-note'}, 'Performance counters measure CPU scene building and submission, not GPU execution time. A GPU API being available does not prove hardware acceleration.'));
  let disposed = false, retrying = false, connected = false, retryError = '';
  const write = (element, value) => { if (element.textContent !== value) element.textContent = value; };
  const refresh = () => {
    if (disposed) return;
    const status = renderer?.getStats();
    write(summary, status ? 'Requested: ' + names[status.requested] + '. Active: ' + names[status.active] + '.' + (status.initializing ? ' Checking backends...' : '') : 'Renderer is initializing.');
    write(failures, retryError || status?.attempts.map(a => a.backend + ': ' + a.reason).join(' • ') || 'Native-resolution device pixels; redraws are scheduled only after changes.');
    const info = status?.adapter;
    write(adapter, info ? 'Adapter: ' + (info.description || [info.vendor, info.architecture].filter(Boolean).join(' ') || 'Identity not exposed by browser') + (info.request?.featureLevel ? ' (' + info.request.featureLevel + ' request)' : '') + (info.warnings?.length ? '. Recovered attempts: ' + info.warnings.join(' • ') : '') : '');
    if (adapter.hidden !== !info) adapter.hidden = !info;
    const hints = renderingAdvice(status, status?.environment || renderingEnvironment(view));
    write(advice, hints.join(' ')); if (advice.hidden !== !hints.length) advice.hidden = !hints.length;
    const disabled = !!(retrying || !renderer || status?.initializing);
    if (retry.disabled !== disabled) retry.disabled = disabled;
  };
  retry.addEventListener('click', async () => {
    if (disposed || retrying) return;
    retrying = true; retryError = ''; refresh();
    try { await (ide.retryRendering ? ide.retryRendering() : renderer.retry()); }
    catch (error) { retryError = error.message || String(error); }
    finally { retrying = false; refresh(); }
  });
  save.addEventListener('click', () => {
    if (disposed) return;
    const status = renderer?.getStats(), environment = status?.environment || renderingEnvironment(view);
    const report = {schema: 1, environment, renderer: status || null, advice: renderingAdvice(status, environment),
      claims: {physicalHardwareCertified: false, wholeIDEPerformanceCompared: false}};
    const owner = node.ownerDocument, realm = owner.defaultView;
    const url = realm.URL.createObjectURL(new realm.Blob([JSON.stringify(report, null, 2)], {type: 'application/json'}));
    const link = owner.createElement('a'); link.href = url; link.download = 'vb6-rendering-diagnostics.json'; link.hidden = true;
    try { owner.body.append(link); link.click(); }
    finally { link.remove(); realm.setTimeout(() => realm.URL.revokeObjectURL(url), 3000); }
  });
  const dispose = () => {
    if (disposed) return; disposed = true;
    document.removeEventListener('vb-rendering-status', refresh); lifecycle.disconnect(); view.clearTimeout(mountCheck);
  };
  // The existing modal removes its subtree on both OK and Cancel. Observe only
  // lifetime here, never rebuild status on arbitrary DOM mutations or each frame.
  const lifecycle = new view.MutationObserver(() => {
    if (node.isConnected) connected = true; else if (connected) dispose();
  });
  lifecycle.observe(document.documentElement, {childList: true, subtree: true});
  const mountCheck = view.setTimeout(() => { if (!node.isConnected) dispose(); else connected = true; }, 0);
  document.addEventListener('vb-rendering-status', refresh);
  Promise.resolve(renderer?.ready).then(refresh, refresh);
  refresh();
  return {node, dispose};
}

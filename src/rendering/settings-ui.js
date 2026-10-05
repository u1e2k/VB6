import {el} from '../core/core.js';
import {normalizeRendering} from './policy.js';
/** Classic Options tab; nothing changes until the parent dialog validates OK. */
export function createRenderingOptions(ide) {
  const initial = normalizeRendering(ide.rendering?.policy);
  const names = {webgpu: 'WebGPU (default)', webgl2: 'WebGL2', canvas2d: 'Canvas2D', html: 'HTML / CSS'};
  const select = (label, items, value) => {
    const node = el('select', {'aria-label': label}, ...items.map(([key, text]) => el('option', {value: key}, text)));
    node.value = value; return node;
  };
  const backend = select('UI rendering backend', Object.entries(names), initial.backend);
  const fallbacks = [0, 1].map(index => select('Rendering fallback ' + (index + 1), [['', 'None'], ['webgl2', 'WebGL2'], ['canvas2d', 'Canvas2D']], initial.fallbacks.filter(name => name !== 'html')[index] || ''));
  const text = select('Text rendering', [['native', 'Native text (maximum font fidelity / IME)'], ['gpu', 'GPU atlas for eligible text (experimental)']], initial.text);
  const snap = el('input', {type: 'checkbox', checked: initial.pixelSnap, 'aria-label': 'Snap graphics to device pixels'});
  const exported = el('input', {type: 'checkbox', checked: false, 'aria-label': 'Use these settings in exported applications'});
  const status = ide.rendering?.getStats();
  const node = el('div', {},
    el('fieldset', {}, el('legend', {}, 'Rendering'),
      el('div', {class: 'dialog-grid'}, el('label', {}, 'Preferred backend:'), backend,
        el('label', {}, 'First fallback:'), fallbacks[0], el('label', {}, 'Second fallback:'), fallbacks[1],
        el('label', {}, 'Text:'), text),
      el('label', {class: 'option-check'}, snap, 'Snap graphics to device pixels'),
      el('label', {class: 'option-check'}, exported, 'Use these settings in exported applications')),
    el('p', {class: 'tool-note'}, 'HTML / CSS is always the final safety fallback. GPU mode paints classic UI geometry; native inputs, code editing, SVG icons and unsupported effects remain browser-rendered. Text-atlas mode is experimental. No screenshot rasterization is used.'),
    el('fieldset', {}, el('legend', {}, 'Current renderer'),
      el('p', {'data-renderer-status': ''}, status ? 'Requested: ' + names[status.requested] + '. Active: ' + names[status.active] + '.' : 'Renderer is initializing.'),
      el('p', {class: 'tool-note'}, status?.attempts.map(attempt => attempt.backend + ': ' + attempt.reason).join(' • ') || 'Native-resolution device pixels; redraws are scheduled only after changes.'),
      el('p', {class: 'tool-note'}, 'Performance counters measure CPU scene building and submission, not GPU execution time. A GPU API being available does not prove hardware acceleration.')));
  return {node, apply() {
    const policy = normalizeRendering({backend: backend.value, fallbacks: fallbacks.map(input => input.value), text: text.value, pixelSnap: snap.checked});
    if (exported.checked) ide.project.settings.rendering = policy;
    if (JSON.stringify(policy) !== JSON.stringify(initial)) ide.setRenderingPolicy?.(policy);
  }};
}

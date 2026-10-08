import test from 'node:test';
import assert from 'node:assert/strict';
import {UIRenderer} from '../src/rendering/renderer.js';

function fixture() {
  const r = Object.create(UIRenderer.prototype), callbacks = new Map(), calls = [];
  let id = 0;
  Object.assign(r, {
    generation: 1, disposed: false, driver: {}, adapter: {elements: new Set()},
    observedElements: new Set(), resizeTargetsTask: null, pendingResizeTargets: null,
    view: {setTimeout(fn) { callbacks.set(++id, fn); return id; }, clearTimeout(key) { callbacks.delete(key); }},
    resizeObserver: {observe(n) {calls.push(['observe', n]);}, unobserve(n) {calls.push(['unobserve', n]);}, disconnect() {calls.push(['disconnect']);}}
  });
  const flush = () => { const queued = [...callbacks.values()]; callbacks.clear(); for (const callback of queued) callback(); };
  return {r, callbacks, calls, flush};
}

test('resize registration runs outside synchronous scene/observer delivery', () => {
  const {r, calls, flush} = fixture(), node = {};
  r.adapter.elements.add(node); r.syncResizeTargets();
  assert.deepEqual(calls, []); assert.equal(r.observedElements.size, 0);
  flush(); assert.deepEqual(calls, [['observe', node]]); assert.equal(r.observedElements.has(node), true);
});
test('pending resize registration coalesces to the latest scene without retaining obsolete nodes', () => {
  const {r, callbacks, calls, flush} = fixture(), first = {}, last = {};
  r.adapter.elements = new Set([first]); r.syncResizeTargets();
  r.adapter.elements = new Set([last]); r.syncResizeTargets();
  assert.equal(callbacks.size, 1); flush(); assert.deepEqual(calls, [['observe', last]]);
  r.adapter.elements = new Set([last]); r.syncResizeTargets();
  assert.equal(callbacks.size, 0, 'An unchanged scene must not create idle tasks');
  r.adapter.elements.clear(); r.syncResizeTargets(); flush();
  assert.deepEqual(calls.at(-1), ['unobserve', last]); assert.equal(r.observedElements.size, 0);
});
test('HTML fallback disconnects and cancels pending targets, including an already queued callback', () => {
  const {r, callbacks, calls} = fixture();
  r.adapter.elements.add({}); r.syncResizeTargets(); const stale = [...callbacks.values()][0];
  r.disconnectResizeTargets(); r.driver = null; stale();
  assert.equal(callbacks.size, 0); assert.equal(r.pendingResizeTargets, null);
  assert.equal(r.observedElements.size, 0); assert.deepEqual(calls, [['disconnect']]);
});
test('an obsolete callback cannot install targets or clear a replacement backend task', () => {
  const {r, callbacks, calls, flush} = fixture(), node = {};
  r.adapter.elements.add({}); r.syncResizeTargets(); const stale = [...callbacks.values()][0];
  r.disconnectResizeTargets(); r.generation++; r.adapter.elements = new Set([node]); r.syncResizeTargets();
  const current = r.resizeTargetsTask; stale(); assert.equal(r.resizeTargetsTask, current);
  flush(); assert.deepEqual(calls, [['disconnect'], ['observe', node]]);
});
test('pending target snapshots cannot be changed by a later scene mutation', () => {
  const {r, calls, flush} = fixture(), node = {};
  r.adapter.elements.add(node); r.syncResizeTargets(); r.adapter.elements.clear(); flush();
  assert.deepEqual(calls, [['observe', node]]);
});

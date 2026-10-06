/** Reuse paint styles only when a mutation cannot change selector matching.
 * Text geometry is still rebuilt: this never caches layout across frames.
 * Sources (original implementation, not copied source):
 * https://www.w3.org/TR/selectors-4/#the-empty-pseudo
 * https://html.spec.whatwg.org/multipage/dom.html#the-dir-attribute
 * https://dom.spec.whatwg.org/#interface-mutationrecord
 */
export function canReuseTextStyles(record, parent) {
  if (!parent || parent.nodeType !== 1 || parent.closest('head,style,script,title,textarea,option,bdi,[dir="auto" i]')) return false;
  let before, after;
  if (record.type === 'characterData' && record.target.nodeType === 3) {
    before = record.oldValue; after = record.target.data;
  } else if (record.type === 'childList' && record.addedNodes.length === 1 && record.removedNodes.length === 1) {
    const a = record.addedNodes[0], b = record.removedNodes[0];
    if (a.nodeType !== 3 || b.nodeType !== 3) return false;
    before = b.data; after = a.data;
  } else return false;
  // Requiring visible text on both sides preserves :empty under both current
  // and whitespace-ignoring Selectors definitions. Direction-sensitive and
  // form/default-value ancestors above deliberately use full invalidation.
  return typeof before === 'string' && typeof after === 'string' && /\S/.test(before) && /\S/.test(after);
}


/** Ignore redundant pointer-over notifications, not actual boundary changes.
 * Layout/paint can dispatch boundary events even with a stationary pointer.
 * Reinvalidating all styles for repeated notifications of the same hit target
 * defeated text-style retention in headed Chromium. Keep one bounded record
 * per pointer; an out/cancel/leave or capture change always resets the record.
 * This does not cancel, redispatch or modify any application input event.
 * Source: https://www.w3.org/TR/pointerevents3/#boundary-events-caused-by-layout-changes
 */
export function redundantPointerOver(event, targets) {
  if (!event || !targets || !Number.isInteger(event.pointerId)) return false;
  const id = event.pointerId;
  if (['pointerout', 'pointerleave', 'pointercancel', 'lostpointercapture', 'gotpointercapture'].includes(event.type) ||
      (event.type === 'pointerup' && event.pointerType === 'touch')) {
    targets.delete(id); return false;
  }
  if (event.type !== 'pointerover') return false;
  const target = event.composedPath?.()[0] || event.target;
  if (!target) return false;
  if (targets.get(id) === target) return true;
  // Faulty/synthetic input must not retain an unbounded list of detached nodes.
  if (!targets.has(id) && targets.size >= 32) targets.clear();
  targets.set(id, target);
  return false;
}

/** Read-only startup barrier for cache/idle measurements, not a renderer API.
 * ready confirms submission, not the first ResizeObserver delivery. Waiting a
 * fixed number of animation frames can race the deferred registration task.
 * https://www.w3.org/TR/resize-observer/#broadcast-active-observations
 * https://drafts.csswg.org/css-font-loading/#font-face-set-ready
 */
export default async function awaitInitialLayout(renderer, timeoutMs = 3000) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Invalid startup deadline');
  const document = renderer.document, view = document.defaultView;
  let stopped = false, timer = null, observer = null, task = null, frame = null;
  const check = () => {
    if (stopped || renderer.disposed || !renderer.driver) throw new Error('Renderer stopped during startup');
  };
  const nextTask = () => new Promise(resolve => { task = view.setTimeout(() => { task = null; resolve(); }, 0); });
  const nextFrame = () => new Promise(resolve => { frame = view.requestAnimationFrame(() => { frame = null; resolve(); }); });
  const deadline = new Promise((_, reject) => {
    timer = view.setTimeout(() => reject(new Error('Initial renderer layout did not settle')), timeoutMs);
  });
  try {
    return await Promise.race([deadline, (async () => {
      check();
      await document.fonts?.ready; check();
      // The renderer deliberately registers observed targets in a separate task.
      // Drain that registration before establishing a layout-delivery barrier.
      while (renderer.resizeTargetsTask) { await nextTask(); check(); }
      await new Promise(resolve => {
        observer = new view.ResizeObserver(() => { observer.disconnect(); resolve(); });
        observer.observe(document.body);
      });
      check();
      // Initial resize/font invalidations must be consumed before taking the
      // baseline style identity. Do not resample styles or modify the renderer.
      do {
        await nextFrame(); check();
        await nextTask(); check();
      } while (renderer.resizeTargetsTask || renderer.frame != null || renderer.stylesDirty);
      return {initialLayoutSettled: true, observedTargets: renderer.observedElements.size};
    })()]);
  } finally {
    stopped = true; observer?.disconnect();
    if (timer != null) view.clearTimeout(timer);
    if (task != null) view.clearTimeout(task);
    if (frame != null) view.cancelAnimationFrame(frame);
  }
}

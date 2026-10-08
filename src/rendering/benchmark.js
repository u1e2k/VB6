import {renderingEnvironment} from './diagnostics.js';
import {PaintScene} from './scene.js';
import {createPainter} from './renderer.js';
import {deadline} from './device.js';

export function timingSummary(samples) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a,b) => a-b);
  return {samples: [...samples], count: samples.length, p50Ms: sorted[Math.floor(sorted.length*.5)], p95Ms: sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]};
}
/** Diagnostic-only pass timestamps. They are NOT frame latency or FPS.
 * Sources: https://www.w3.org/TR/webgpu/#timestamp-query
 * https://www.w3.org/TR/webgpu/#dom-gpurenderpasstimestampwrites
 * All resources are private to a benchmark; no normal-frame readbacks/waits.
 */
export class PassTimer {
  constructor(painter) {
    this.painter = painter; this.device = painter.device;
    if (!this.device?.features.has('timestamp-query')) return;
    const B = painter.view.GPUBufferUsage;
    try {
      this.querySet = this.device.createQuerySet({type:'timestamp', count:2});
      this.resolve = this.device.createBuffer({size:16, usage:B.QUERY_RESOLVE | B.COPY_SRC});
      this.readback = this.device.createBuffer({size:16, usage:B.COPY_DST | B.MAP_READ});
    } catch (error) { this.dispose(); throw error; }
  }
  async measure(scene) {
    const p = this.painter, now = () => p.view.performance.now(), start = now();
    p.render(scene, this.querySet ? {timing:this} : {});
    const cpuMs = now()-start;
    if (!this.querySet) return {cpuMs, gpuMs:null};
    await deadline(this.readback.mapAsync(p.view.GPUMapMode.READ), 3000, 'GPU timestamp readback timed out');
    try {
      const data = new BigUint64Array(this.readback.getMappedRange());
      return {cpuMs, gpuMs: data[1] >= data[0] ? Number(data[1]-data[0])/1e6 : null};
    } finally { this.readback.unmap(); }
  }
  dispose() { this.querySet?.destroy(); this.resolve?.destroy(); this.readback?.destroy(); this.querySet = this.resolve = this.readback = null; }
}
// The caller's AbortSignal, not an exception name from a driver, owns user
// cancellation. GPU startup/readback can independently reject with AbortError.
// Source: https://dom.spec.whatwg.org/#aborting-ongoing-activities
function cancellationError(view) {
  return new view.DOMException('Rendering measurement cancelled', 'AbortError');
}
function awaitMeasurement(pending, signal, view, releaseLate) {
  if (!signal) return Promise.resolve(pending);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, cancellationError(view));
    signal.addEventListener('abort', onAbort, {once: true});
    Promise.resolve(pending).then(value => {
      if (settled) {
        // Device acquisition cannot be cancelled. Dispose only this late
        // painter; other document owners may still use the shared GPU device.
        try { releaseLate?.(value); }
        catch (error) { view.reportError?.(error); }
      } else finish(resolve, value);
    }, error => finish(reject, error));
    if (signal.aborted) onAbort();
  });
}
/** Run on the actual user's adapter, preserving all IDE/project/render settings.
 * Opaque sealed primitives isolate painter submission and optional pass time.
 * The native HTML compositor is not comparable to a canvas submission call, so
 * this report explicitly does not invent an HTML FPS or whole-IDE speedup.
 */
export async function benchmarkRendering(document, {frames = 30, quads = 10000, backends = ['webgpu','webgl2','canvas2d'], signal, onProgress = () => {}} = {}) {
  if (!Number.isInteger(frames) || frames < 1 || frames > 120 || !Number.isInteger(quads) || quads < 1 || quads > 10000) throw new RangeError('Benchmark frames (1–120) and quads (1–10000) must be bounded integers');
  if (!Array.isArray(backends) || !backends.length || backends.some(b => !['webgpu','webgl2','canvas2d'].includes(b))) throw new TypeError('Invalid benchmark backends');
  const view = document.defaultView, results = [], now = () => view.performance.now();
  const abort = () => { if (signal?.aborted) throw cancellationError(view); };
  const wait = (pending, releaseLate) => awaitMeasurement(pending, signal, view, releaseLate);
  const scene = new PaintScene(512,512);
  for (let i=0;i<quads;i++) scene.add([(i%100)*5,Math.floor(i/100)*5,4,4],[.2,.4,.8,1]);
  scene.seal();
  for (const backend of [...new Set(backends)]) {
    abort(); onProgress(backend); abort();
    const canvas = document.createElement('canvas'); // Detached: no changes to IDE layout or hit testing.
    let painter, timer;
    try {
      painter = await wait(createPainter(backend,canvas), late => late.dispose()); abort();
      timer = new PassTimer(painter);
      const cpu = [], gpu = [];
      painter.render(scene); // Warm allocation/packing is not mixed into repeated submission timings.
      if (painter.device) await wait(deadline(painter.device.queue.onSubmittedWorkDone(),3000));
      for (let i=0;i<frames;i++) {
        abort();
        if (i%5 === 0) { await wait(new Promise(resolve => view.setTimeout(resolve,0))); abort(); } // Keep cancellation/UI responsive, including hidden tabs.
        if (painter.device) {
          const sample = await wait(timer.measure(scene)); cpu.push(sample.cpuMs);
          if (sample.gpuMs !== null) gpu.push(sample.gpuMs);
        } else { const start=now(); painter.render(scene); cpu.push(now()-start); }
      }
      if (painter.device) await wait(deadline(painter.device.queue.onSubmittedWorkDone(),3000));
      results.push({backend, available:true, adapter:painter.adapterInfo || null,
        cpuSubmission:timingSummary(cpu), gpuPass:timingSummary(gpu), counters:{...painter.stats}});
    } catch (error) {
      // Driver AbortError means this backend failed, not that the user
      // cancelled. A real cancellation wins even over a different driver error.
      abort();
      results.push({backend, available:false, reason:error.message || String(error), ...(typeof error.code === 'string' ? {code:error.code} : {}), ...(error.attempts?.length ? {attempts:error.attempts} : {})});
    } finally { timer?.dispose(); painter?.dispose(); canvas.width=canvas.height=1; }
  }
  abort();
  return {schema:1, completedAt:new Date().toISOString(), environment:renderingEnvironment(view), frames, quads, width:512, height:512, dpr:1, userAgent:view.navigator.userAgent, results,
    claims:{physicalHardwareCertified:false, nativeVB6PixelParityCertified:false, wholeIDEPerformanceCompared:false},
    note:'CPU submission and optional GPU pass timestamps for sealed primitives only. No presentation/FPS, input latency, power or native HTML compositor comparison. Adapter may be software. Timestamp values may be quantized.'};
}

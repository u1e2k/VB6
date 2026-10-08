import test from 'node:test';
import assert from 'node:assert/strict';
import {benchmarkRendering} from '../src/rendering/benchmark.js';

function fixture({requestAdapter, contextError, yieldTask} = {}) {
  let ticks = 0;
  const canvases = [], draws = [];
  const context = {setTransform() {}, clearRect() {}, save() {}, beginPath() {},
    rect() {}, clip() {}, fillRect() { draws.push(1); }, restore() {}};
  const view = {DOMException, performance: {now: () => ++ticks},
    navigator: {userAgent: 'deterministic renderer fixture', gpu: {requestAdapter}},
    setTimeout: yieldTask || (callback => setTimeout(callback, 0))};
  const document = {defaultView: view, createElement(name) {
    assert.equal(name, 'canvas');
    const canvas = {ownerDocument: document, width: 300, height: 150,
      getContext(kind) {
        if (contextError) throw contextError;
        return kind === '2d' ? context : null;
      }};
    canvases.push(canvas);return canvas;
  }};
  return {document, canvases, draws};
}
const small = {frames: 1, quads: 1};
const cancelled = error => error.name === 'AbortError' && error.message === 'Rendering measurement cancelled';

// Reproduces the CI failure without a GPU: the driver exception must become
// an unavailable backend entry, not terminate all subsequent measurements.
test('driver AbortError is reported and remaining backends are measured', async () => {
  const nativeError = new DOMException('A valid external Instance reference no longer exists.', 'AbortError');
  const f = fixture({requestAdapter: () => Promise.reject(nativeError)});
  const report = await benchmarkRendering(f.document, {...small, backends: ['webgpu','canvas2d']});
  assert.deepEqual(report.results.map(r => [r.backend,r.available]), [['webgpu',false],['canvas2d',true]]);
  assert.equal(report.results[0].reason, nativeError.message);
  assert.equal(report.results[1].cpuSubmission.count, 1);
  assert.equal(report.claims.physicalHardwareCertified, false);
  assert.ok(f.canvases.every(c => c.width === 1 && c.height === 1));
});

test('backend AbortError is not classified as cancellation with a live signal', async () => {
  const controller = new AbortController();
  const f = fixture({contextError: new DOMException('driver rejected draw surface', 'AbortError')});
  const report = await benchmarkRendering(f.document, {...small, backends: ['canvas2d'], signal: controller.signal});
  assert.equal(controller.signal.aborted, false);
  assert.deepEqual(report.results, [{backend:'canvas2d',available:false,reason:'driver rejected draw surface'}]);
});

test('pre-cancelled measurements allocate no canvas and notify no progress', async () => {
  const f = fixture(), controller = new AbortController();controller.abort();
  let progress = 0;
  await assert.rejects(benchmarkRendering(f.document, {...small,signal:controller.signal,onProgress(){progress++;}}), cancelled);
  assert.equal(f.canvases.length, 0);assert.equal(progress, 0);
});

test('cancellation from progress prevents backend allocation', async () => {
  const f = fixture(), controller = new AbortController();
  await assert.rejects(benchmarkRendering(f.document, {...small,signal:controller.signal,onProgress(){controller.abort();}}), cancelled);
  assert.equal(f.canvases.length, 0);
});

test('cancellation does not wait for unresolved device acquisition', {timeout: 1500}, async () => {
  let rejectAdapter;
  const pending = new Promise((_, reject) => {rejectAdapter = reject;});
  const f = fixture({requestAdapter: () => pending}), controller = new AbortController();
  const measurement = benchmarkRendering(f.document, {...small, backends:['webgpu','canvas2d'], signal:controller.signal});
  controller.abort();
  try {
    // Adapter deliberately stays pending until after the assertion.
    await assert.rejects(measurement, cancelled);
    assert.equal(f.canvases.length, 1);
    assert.ok(f.canvases.every(c => c.width === 1 && c.height === 1));
  } finally { rejectAdapter(new Error('late adapter shutdown')); }
  await new Promise(resolve => setImmediate(resolve));
});

test('cancellation after canvas acquisition disposes the late painter', async () => {
  const f = fixture(), controller = new AbortController();
  const measurement = benchmarkRendering(f.document, {...small,backends:['canvas2d'],signal:controller.signal});
  controller.abort();
  await assert.rejects(measurement, cancelled);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.draws.length, 0);
  assert.ok(f.canvases.every(c => c.width === 1 && c.height === 1));
});

test('cancellation during a pending event-loop yield is prompt and cleans up', {timeout:1500}, async () => {
  let releaseYield;
  const controller = new AbortController();
  const f = fixture({yieldTask(callback) { releaseYield = callback; controller.abort(); }});
  await assert.rejects(benchmarkRendering(f.document, {...small,backends:['canvas2d'],signal:controller.signal}), cancelled);
  assert.ok(releaseYield);assert.equal(f.draws.length, 1); // Warmup only.
  assert.ok(f.canvases.every(c => c.width === 1 && c.height === 1));
  releaseYield();
});

test('abort listeners are released after success and after backend rejection', async () => {
  for (const failure of [false,true]) {
    const controller = new AbortController(), listeners = new Set();
    const signal = {get aborted(){return controller.signal.aborted},
      addEventListener(type, fn, options) { listeners.add(fn);controller.signal.addEventListener(type,fn,options); },
      removeEventListener(type, fn) { listeners.delete(fn);controller.signal.removeEventListener(type,fn); }};
    const f = fixture(failure ? {contextError: new Error('no context')} : {});
    const report = await benchmarkRendering(f.document, {...small,backends:['canvas2d'],signal});
    assert.equal(report.results[0].available, !failure);assert.equal(listeners.size, 0);
  }
});

for (const cancelReadback of [false, true]) test(
  cancelReadback ? 'cancelling GPU timestamp readback releases private resources promptly' : 'GPU timestamp AbortError is backend failure, not user cancellation',
  {timeout: 1500}, async t => {
    const {WebGPUPainter} = await import('../src/rendering/webgpu.js');
    const controller = new AbortController();
    const f = fixture();let destroys=0,disposals=0,failReadback;
    const painter = {view:{...f.document.defaultView,GPUBufferUsage:{},GPUMapMode:{READ:1}},
      stats:{frames:0},render(){this.stats.frames++;},dispose(){disposals++;},
      device:{features:new Set(['timestamp-query']),queue:{onSubmittedWorkDone:async()=>{}},
        createQuerySet:()=>({destroy(){destroys++;}}),
        createBuffer:()=>({destroy(){destroys++;},mapAsync(){
          if (!cancelReadback) return Promise.reject(new DOMException('device lost during timestamps','AbortError'));
          const pending = new Promise((_,reject)=>{failReadback=reject;});
          controller.abort();return pending;
        }})}};
    t.mock.method(WebGPUPainter, 'create', async()=>painter);
    const measurement=benchmarkRendering(f.document,{...small,backends:['webgpu'],signal:controller.signal});
    try {
      if(cancelReadback) await assert.rejects(measurement,cancelled);
      else {
        const report=await measurement;
        assert.deepEqual(report.results,[{backend:'webgpu',available:false,reason:'device lost during timestamps'}]);
        assert.equal(controller.signal.aborted,false);
      }
      assert.equal(destroys,3);assert.equal(disposals,1);
      assert.ok(f.canvases.every(c=>c.width===1&&c.height===1));
    } finally {failReadback?.(new DOMException('mapping cancelled by disposal','AbortError'));}
    await new Promise(resolve=>setImmediate(resolve));
  });

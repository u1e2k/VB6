import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireDevice} from '../src/rendering/device.js';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
function device() { const loss = deferred(); return {lost: loss.promise, destroy() { this.destroyed = true; loss.resolve({reason:'destroyed'}); }}; }
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('null high-performance adapter does not discard a working browser-default adapter', async () => {
  const calls = [], gpu = device();
  const view = {navigator:{gpu:{async requestAdapter(options) {
    calls.push(options); return options.powerPreference ? null : {requestDevice: async () => gpu};
  }}}};
  assert.equal((await acquireDevice(view)).device, gpu);
  assert.deepEqual(calls, [{powerPreference:'high-performance'}, {}]);
});

test('optional timestamp rejection retries a fresh adapter without requiring profiling', async () => {
  const requests = [], gpu = device(); let adapters = 0;
  const view = {navigator:{gpu:{async requestAdapter() {
    const id = ++adapters;
    return {features:new Set(['timestamp-query']), async requestDevice(options) {
      requests.push({id, options});
      if (options.requiredFeatures.includes('timestamp-query')) throw new Error('profiling disabled');
      return gpu;
    }};
  }}}};
  const result = await acquireDevice(view);
  assert.equal(result.device, gpu);
  assert.deepEqual(requests.map(r => r.id), [1, 2], 'requestDevice consumes its adapter');
  assert.deepEqual(requests.map(r => r.options.requiredFeatures), [['timestamp-query'], []]);
  assert.match(result.info.warnings.join(' '), /profiling disabled/);
});

test('an expired adapter request is evicted and late completion cannot allocate a device', async () => {
  const stale = deferred(), gpu = device(); let calls = 0, oldDeviceCalls = 0;
  const view = {navigator:{gpu:{requestAdapter() {
    return ++calls === 1 ? stale.promise : Promise.resolve({requestDevice:async () => gpu});
  }}}};
  await assert.rejects(acquireDevice(view, 5), /timed out/);
  assert.equal((await acquireDevice(view, 100)).device, gpu);
  stale.resolve({requestDevice:async () => { oldDeviceCalls++; return device(); }});
  await tick();
  assert.equal(oldDeviceCalls, 0);
  assert.equal((await acquireDevice(view)).device, gpu);
  assert.equal(calls, 2);
});

test('a late device is destroyed without evicting or destroying the replacement', async () => {
  const stale = deferred(), old = device(), current = device(); let calls = 0;
  const view = {navigator:{gpu:{async requestAdapter() {
    return {requestDevice:() => ++calls === 1 ? stale.promise : Promise.resolve(current)};
  }}}};
  await assert.rejects(acquireDevice(view, 5), /timed out/);
  assert.equal((await acquireDevice(view, 100)).device, current);
  stale.resolve(old); await tick();
  assert.equal(old.destroyed, true);
  assert.notEqual(current.destroyed, true);
  assert.equal((await acquireDevice(view)).device, current);
});

test('a shorter caller timeout cannot cancel a shared longer acquisition', async () => {
  const pending = deferred(), gpu = device(); let calls = 0;
  const view = {navigator:{gpu:{requestAdapter() { calls++; return pending.promise; }}}};
  const owner = acquireDevice(view, 1000);
  await assert.rejects(acquireDevice(view, 5), /timed out/);
  pending.resolve({requestDevice:async () => gpu});
  assert.equal((await owner).device, gpu);
  assert.equal((await acquireDevice(view)).device, gpu);
  assert.equal(calls, 1); assert.notEqual(gpu.destroyed, true);
});

test('device enables the supported texture extent instead of an artificial default limit', async () => {
  let descriptor;
  const view = {navigator:{gpu:{requestAdapter:async () => ({limits:{maxTextureDimension2D:16384},
    requestDevice:async options => { descriptor=options; return device(); }})}}};
  await acquireDevice(view);
  assert.equal(descriptor.requiredLimits.maxTextureDimension2D, 16384);
});

test('low-power and compatibility adapter requests remain bounded and never force software', async () => {
  const requests = [], gpu = device();
  const view = {navigator:{gpu:{async requestAdapter(options) {
    requests.push(options);
    return options.featureLevel === 'compatibility' ? {requestDevice:async () => gpu} : null;
  }}}};
  assert.equal((await acquireDevice(view)).device, gpu);
  assert.deepEqual(requests, [{powerPreference:'high-performance'}, {}, {powerPreference:'low-power'}, {featureLevel:'compatibility'}]);
  assert.ok(requests.every(options => !options.forceFallbackAdapter));
});

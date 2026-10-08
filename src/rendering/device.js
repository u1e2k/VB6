const devices = new WeakMap();
export function deadline(promise, milliseconds, message = 'Renderer initialization timed out') {
  let timer;
  return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]).finally(() => clearTimeout(timer));
}
const adapterRequests = [{powerPreference: 'high-performance'}, {}, {powerPreference: 'low-power'}, {featureLevel: 'compatibility'}];
const reason = error => error?.message || String(error);
function failure(message, code, attempts = []) {
  return Object.assign(new Error(message), {code, attempts: attempts.map(a => ({...a, options: {...a.options}}))});
}
async function requestDevice(view, record) {
  let lastError;
  const check = () => { if (record.expired) throw failure('WebGPU device acquisition timed out', 'WEBGPU_TIMEOUT'); };
  // Power preferences are hints, not requirements. A null discrete adapter must
  // not hide a working integrated/default adapter. Compatibility is a final,
  // browser-controlled request, never a forced software/unsafe browser setting.
  // https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips
  // https://developer.chrome.com/blog/new-in-webgpu-146
  for (const options of adapterRequests) {
    let withoutTimestamps = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      check();
      let adapter;
      try { adapter = await view.navigator.gpu.requestAdapter({...options}); }
      catch (error) {
        check(); lastError = error;
        record.attempts.push({stage: 'adapter', options, reason: reason(error)}); break;
      }
      check();
      if (!adapter) { record.attempts.push({stage: 'adapter', options, reason: 'No WebGPU adapter'}); break; }
      const requiredFeatures = !withoutTimestamps && adapter.features?.has('timestamp-query') ? ['timestamp-query'] : [];
      const extent = adapter.limits?.maxTextureDimension2D;
      // Raising a supported limit does not allocate a texture. Keep the existing
      // physicalSize memory bound; do not unnecessarily fall back at 8192 pixels.
      const requiredLimits = Number.isInteger(extent) && extent > 0 ? {maxTextureDimension2D: Math.min(extent, 16384)} : {};
      let device;
      try { device = await adapter.requestDevice({requiredFeatures, requiredLimits}); }
      catch (error) {
        check(); lastError = error;
        record.attempts.push({stage: 'device', options, reason: reason(error), timestamps: requiredFeatures.length > 0});
        if (requiredFeatures.length) { withoutTimestamps = true; continue; }
        break;
      }
      // An abandoned request owns ONLY its late device, not another caller's
      // live shared device. Never allocate after late adapter completion.
      if (record.expired) { device.destroy(); check(); }
      let info = {};
      try { info = device.adapterInfo || adapter.info || {}; } catch {}
      device.lost.then(() => { if (devices.get(view) === record) devices.delete(view); });
      return {device, info: {vendor: info.vendor || '', architecture: info.architecture || '', description: info.description || '',
        isFallbackAdapter: info.isFallbackAdapter ?? adapter.isFallbackAdapter ?? null,
        request: {...options}, warnings: record.attempts.map(a => a.stage + ': ' + a.reason)}};
    }
  }
  throw failure(lastError ? reason(lastError) : 'No WebGPU adapter', 'WEBGPU_ACQUISITION_FAILED', record.attempts);
}
/** Devices belong to a browser Window, never a DOM node which can be adopted. */
export async function acquireDevice(view, timeout = 3000) {
  if (view.vb6NativeGPUUnavailable) throw failure('Native host disabled WebGPU', 'WEBGPU_HOST_DISABLED');
  if (view.vb6NativeGPUDevice) return {device: view.vb6NativeGPUDevice, info: {description: 'Native host device', isFallbackAdapter: null}};
  if (view.isSecureContext === false) throw failure('WebGPU requires a secure context (HTTPS or localhost)', 'WEBGPU_INSECURE_CONTEXT');
  if (!view.navigator?.gpu?.requestAdapter) throw failure('WebGPU is unavailable in this browser or origin', 'WEBGPU_API_UNAVAILABLE');
  let record = devices.get(view);
  if (!record) {
    record = {expired: false, attempts: [], promise: null};
    devices.set(view, record);
    // Bound the cached operation itself, not only its consumers. A hung promise
    // otherwise survives every Retry/Options apply for the lifetime of the page.
    record.promise = deadline(requestDevice(view, record), timeout, 'WebGPU device acquisition timed out').catch(error => {
      record.expired = true;
      if (devices.get(view) === record) devices.delete(view);
      throw failure(reason(error), error.code || 'WEBGPU_TIMEOUT', record.attempts);
    });
  }
  // A short-lived measurement caller must not expire a longer shared operation.
  return deadline(record.promise, timeout);
}

// One promise continuation per shared device, not one retained closure per
// disposed painter. Unsubscribing releases detached documents immediately.
const losses = new WeakMap();
export function subscribeDeviceLoss(device, callback) {
  let record = losses.get(device);
  if (!record) {
    record = {listeners: new Set(), info: null}; losses.set(device, record);
    device.lost.then(info => {
      record.info = info;
      const callbacks = [...record.listeners]; record.listeners.clear();
      for (const listener of callbacks) { try { listener(info); } catch (error) { globalThis.reportError?.(error); } }
    });
  }
  let active = true;
  if (record.info) queueMicrotask(() => { if (active) callback(record.info); });
  else record.listeners.add(callback);
  return () => { active = false; record.listeners.delete(callback); };
}

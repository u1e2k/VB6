const devices = new WeakMap();
export function deadline(promise, milliseconds, message = 'Renderer initialization timed out') {
  let timer;
  return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]).finally(() => clearTimeout(timer));
}
/** Devices belong to a browser Window, never a DOM node which can be adopted. */
export async function acquireDevice(view, timeout = 3000) {
  if (view.vb6NativeGPUUnavailable) throw new Error('Native host disabled WebGPU');
  if (view.vb6NativeGPUDevice) return {device: view.vb6NativeGPUDevice, info: {description: 'Native host device', isFallbackAdapter: null}};
  if (!view.navigator?.gpu) throw new Error('WebGPU is unavailable in this browser or origin');
  let pending = devices.get(view);
  if (!pending) {
    pending = (async () => {
      const adapter = await view.navigator.gpu.requestAdapter({powerPreference: 'high-performance'});
      if (!adapter) throw new Error('No WebGPU adapter');
      const device = await adapter.requestDevice();
      const info = adapter.info || {};
      device.lost.then(() => { if (devices.get(view) === pending) devices.delete(view); });
      return {device, info: {vendor: info.vendor || '', architecture: info.architecture || '', description: info.description || '', isFallbackAdapter: info.isFallbackAdapter ?? adapter.isFallbackAdapter ?? null}};
    })();
    devices.set(view, pending);
    pending.catch(() => { if (devices.get(view) === pending) devices.delete(view); });
  }
  return deadline(pending, timeout);
}

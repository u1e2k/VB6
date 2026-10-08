/** Side-effect-free diagnostics: never allocate probe contexts or request a GPU. */
export function renderingEnvironment(view) {
  return {secureContext: typeof view?.isSecureContext === 'boolean' ? view.isSecureContext : null,
    webgpuAPI: typeof view?.navigator?.gpu?.requestAdapter === 'function',
    nativeHostDisabled: !!view?.vb6NativeGPUUnavailable};
}
export function renderingAdvice(status, environment = {}) {
  if (!status) return [];
  if (status.forcedColors) return ['Forced-colors accessibility mode intentionally uses HTML / CSS.'];
  if (status.requested === 'html') return [];
  const advice = [], attempts = status.attempts || [];
  const webgpuFailed = attempts.some(a => a.backend === 'webgpu');
  const webglFailed = attempts.some(a => a.backend === 'webgl2');
  if (webgpuFailed) {
    if (environment.nativeHostDisabled) advice.push('The native host disabled WebGPU. Check its graphics configuration; the page cannot override it.');
    else if (environment.secureContext === false) advice.push('Open the IDE over HTTPS or localhost. WebGPU is not exposed in an insecure context.');
    else if (!environment.webgpuAPI) advice.push('This browser context does not expose WebGPU. Check browser support and updates.');
    else advice.push('Check browser graphics acceleration and browser/OS/GPU-driver updates. In Chromium, inspect chrome://gpu (Edge: edge://gpu) for disabled features or GPU-process errors.');
  }
  if (webgpuFailed && webglFailed) advice.push('Both GPU APIs failed. The page cannot enable a disabled, unavailable or browser-blocklisted GPU; the exact browser/driver cause is not exposed here.');
  else if (webglFailed) advice.push('The browser could not create a WebGL2 context. Check graphics acceleration, driver support and the context-creation details.');
  if (attempts.length) advice.push('Retry Renderer rechecks the saved backend order without changing the project or these draft options. A browser graphics-setting change may require restarting the browser.');
  if (status.adapter?.isFallbackAdapter === true) advice.push('The browser reports a fallback adapter. This does not certify hardware acceleration.');
  return advice;
}

/** Retry WebGL2 creation hints without locking the canvas to a different API.
 * https://registry.khronos.org/webgl/specs/latest/1.0/#5.2
 */
export function acquireWebGLContext(canvas) {
  const attempts = []; let message = '';
  const failed = event => { message = String(event.statusMessage || ''); };
  canvas.addEventListener('webglcontextcreationerror', failed);
  try {
    for (const powerPreference of ['high-performance', 'default', 'low-power']) {
      message = '';
      const options = {alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference};
      try {
        const gl = canvas.getContext('webgl2', options);
        if (gl) return {gl, request: {powerPreference}, warnings: attempts.map(a => a.reason)};
      } catch (error) { message = error.message || String(error); }
      attempts.push({stage: 'context', options: {powerPreference}, reason: message || 'WebGL2 context unavailable'});
    }
  } finally { canvas.removeEventListener('webglcontextcreationerror', failed); }
  const details = [...new Set(attempts.map(a => a.reason).filter(r => r !== 'WebGL2 context unavailable'))];
  throw Object.assign(new Error('WebGL2 unavailable' + (details.length ? ': ' + details.join('; ') : '')),
    {code: 'WEBGL2_CONTEXT_UNAVAILABLE', attempts});
}

/** Shared WebGPU/WebGL2 instance encoder. Colors remain unpremultiplied sRGB.
 * Clip against physical pixel centers, not CSS coordinates divided in a shader:
 * division introduced edge disagreements at fractional DPI.
 * Source: WebGPU fragment position and pixel-coordinate conventions:
 * https://gpuweb.github.io/gpuweb/#coordinate-systems
 * Original implementation; no third-party code copied.
 */
export const INSTANCE_FLOATS = 24;
export const INSTANCE_BYTES = INSTANCE_FLOATS * 4;
export function encodeInstances(commands, data, scaleX, scaleY) {
  let at = 0;
  for (const c of commands) {
    data.set(c.rect, at);
    const [x, y, w, h] = c.clip;
    const left = Math.ceil(x * scaleX - .5), top = Math.ceil(y * scaleY - .5);
    const right = Math.ceil((x + w) * scaleX - .5), bottom = Math.ceil((y + h) * scaleY - .5);
    data[at + 4] = left; data[at + 5] = top;
    data[at + 6] = right - left; data[at + 7] = bottom - top;
    data.set(c.color, at + 8); data.set(c.color2, at + 12); data.set(c.uv, at + 16);
    data[at + 20] = c.hole ? 2 : c.page ? 1 : 0;
    data[at + 21] = c.vertical ? 1 : 0;
    data[at + 22] = data[at + 23] = 0;
    at += INSTANCE_FLOATS;
  }
  return at;
}
/** Only sealed scenes can reuse encoded geometry; mutable public command arrays
 * continue to be observed on every draw. Image pixels are revisioned separately.
 */
export function canReuseInstances(painter, scene, size) {
  return scene.sealed === true && painter.encodedScene === scene &&
    painter.encodedWidth === size.width && painter.encodedHeight === size.height;
}
export function rememberInstances(painter, scene, size) {
  painter.encodedScene = scene.sealed ? scene : null;
  painter.encodedWidth = size.width; painter.encodedHeight = size.height;
}

/** Ordered batches keep page identities, not GPU handles, so a resized/revised
 * atlas page can refresh its texture without repacking immutable geometry. */
export function prepareBatches(painter, scene) {
  if (scene.sealed && painter.batchedScene === scene) return painter.batches;
  const groups = [], pages = new Set();
  for (let index = 0; index < scene.commands.length; index++) {
    const command = scene.commands[index], page = command.page || null;
    if (page) pages.add(page);
    const previous = groups.at(-1), hole = Boolean(command.hole);
    if (previous && previous.page === page && previous.hole === hole) previous.count++;
    else groups.push({first: index, count: 1, page, hole});
  }
  painter.batches = {groups, pages}; painter.batchedScene = scene.sealed ? scene : null;
  painter.stats.batchBuilds = (painter.stats.batchBuilds || 0) + 1;
  return painter.batches;
}

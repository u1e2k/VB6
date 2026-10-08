import {parseColor} from './scene.js';
/** A canvas overlay cannot alpha-blend a CSS paint over its already painted
 * DOM equivalent: that would apply its opacity twice. Opaque colors and fully
 * transparent no-ops are safe. All partial alpha stays browser-native.
 * https://www.w3.org/TR/compositing-1/#simplealphacompositing
 */
export function hasPartialAlpha(paint) {
  const partial = color => color && color[3] > 0 && color[3] < 1;
  return partial(paint.background) || (paint.gradient && (paint.gradient.start[3] < 1 || paint.gradient.end[3] < 1) && (paint.gradient.start[3] > 0 || paint.gradient.end[3] > 0)) ||
    paint.borders.some(edge => edge.width > 0 && partial(edge.color)) ||
    paint.shadows.some(shadow => partial(shadow.color)) ||
    (paint.layers || []).some(layer => partial(layer.color));
}

/** Root/background propagation uses used paint, not blindly the body's
 * computed background. A nontransparent root background prevents propagation.
 * Unknown/partial-alpha canvas paint stays transparent to the native backdrop.
 * https://www.w3.org/TR/css-backgrounds-3/#special-backgrounds
 */
export function canvasBackground(root, body) {
  const rootColor = parseColor(root.backgroundColor);
  const propagated = rootColor[3] === 0 && root.backgroundImage === 'none';
  const style = propagated ? body : root;
  const color = parseColor(style.backgroundColor);
  return {propagated, color, native: color[3] !== 1 || style.backgroundImage !== 'none'};
}

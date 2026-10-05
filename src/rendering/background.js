import {parseColor, splitCSS} from './scene.js';
const list = value => splitCSS(value || '');
function length(value) {
  const match = /^(-?(?:\d*\.)?\d+)(px|%)$/.exec(value);
  if (!match) throw new TypeError('Unsupported background dimension');
  return {value: Number(match[1]), percent: match[2] === '%'};
}
const resolve = (length, extent) => length.percent ? extent * (length.value / 100) : length.value;
/** Solid CSS background layers, used by the border-box classic staircase.
 * Layer order and positioning follow CSS Backgrounds, not DOM screenshots:
 * https://www.w3.org/TR/css-backgrounds-3/#layering
 * The staircase design attribution/license is retained in theme/bevels.css.
 */
export function solidBackgroundLayers(style) {
  const images = list(style.backgroundImage);
  if (images.length > 32) throw new RangeError('Background layer budget exceeded');
  const sizes=list(style.backgroundSize), positions=list(style.backgroundPosition);
  const repeats=list(style.backgroundRepeat), origins=list(style.backgroundOrigin), clips=list(style.backgroundClip);
  return images.map((image, index) => {
    if (!image.startsWith('linear-gradient(') || !image.endsWith(')')) throw new TypeError('Native background image');
    const stops=list(image.slice(16,-1));
    if(stops.length===3 && /^(?:-?[\d.]+deg|to (?:left|right|top|bottom))$/.test(stops[0])) stops.shift();
    if(stops.length!==2) throw new TypeError('Native background gradient');
    const color=parseColor(stops[0]), end=parseColor(stops[1]);
    if(!color.every((v,i)=>v===end[i])) throw new TypeError('Native multistop gradient');
    const at = values => values[index%values.length];
    if(at(repeats)!=='no-repeat' || at(origins)!=='border-box' || at(clips)!=='border-box') throw new TypeError('Native background repeat or box');
    const size=at(sizes).split(/\s+/), position=at(positions).split(/\s+/);
    if(size.length!==2 || position.length!==2) throw new TypeError('Native background sizing');
    const aliases=[{left:'0%',center:'50%',right:'100%'},{top:'0%',center:'50%',bottom:'100%'}];
    return {color, size:size.map(length), position:position.map((v,i)=>length(aliases[i][v] || v))};
  });
}
export function paintBackgroundLayers(scene, rect, clip, layers) {
  const [x,y,width,height]=rect;
  for(let i=layers.length-1;i>=0;i--) {
    const layer=layers[i], w=resolve(layer.size[0],width), h=resolve(layer.size[1],height);
    // Percent position applies to the remaining space, not the whole box.
    const left=x+resolve(layer.position[0],width-w), top=y+resolve(layer.position[1],height-h);
    scene.add([left,top,w,h],layer.color,{clip});
  }
}

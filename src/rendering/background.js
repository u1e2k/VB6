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
  const [x,y,width,height]=rect, painted=[];
  for(let i=layers.length-1;i>=0;i--) {
    const layer=layers[i], w=resolve(layer.size[0],width), h=resolve(layer.size[1],height);
    // Percent position applies to the remaining space, not the whole box.
    const left=x+resolve(layer.position[0],width-w), top=y+resolve(layer.position[1],height-h);
    const area=[left,top,w,h];
    scene.add(area,layer.color,{clip});
    if(layer.color[3]>0 && w>0 && h>0) painted.push(area);
  }
  return painted;
}

/** Preserve a thin device-pixel coverage strip at fractional edges of
 * authored background images. Image bounds need not match the layout border:
 * a two-CSS-pixel classic bevel can extend inside a one-pixel border. Rounding
 * only the outer box then loses the inner image's partial pixel at e.g. DPR 1.25.
 * CSS Backgrounds: https://www.w3.org/TR/css-backgrounds-3/#background-size
 * Interiors are still GPU quads. Clear these strips after the complete box paint
 * but before its children, so later siblings/children keep their stacking order.
 */
export function preserveBackgroundEdges(scene, rectangles, clip) {
  const dpr=scene.dpr, seen=new Set();
  const edge=(coordinate,start,extent,vertical,fractionalBox)=>{
    const pixel=coordinate*dpr;
    if((!fractionalBox && Math.abs(pixel-Math.round(pixel))<1e-6) || extent<=0) return;
    // CSS image origins and image extents may round independently. Include
    // a one-device-pixel halo around the coverage pixel, never the whole box.
    const low=(Math.floor(pixel)-1)/dpr;
    const rect=vertical?[low,start,3/dpr,extent]:[start,low,extent,3/dpr];
    const key=rect.join(',');if(seen.has(key))return;seen.add(key);
    scene.native(rect,clip,'fractional CSS background edge');
  };
  for(const [x,y,w,h] of rectangles || []){
    // Fractional CSS boxes may shift an otherwise integral device edge when
    // the browser computes its image positioning area from rounded box metrics.
    const fractionalBox=[x,y,w,h].some(value=>Math.abs(value-Math.round(value))>1e-6);
    edge(x,y,h,true,fractionalBox);edge(x+w,y,h,true,fractionalBox);
    edge(y,x,w,false,fractionalBox);edge(y+h,x,w,false,fractionalBox);
  }
}

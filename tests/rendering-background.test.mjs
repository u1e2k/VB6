import test from 'node:test';
import assert from 'node:assert/strict';
import {solidBackgroundLayers,paintBackgroundLayers,preserveBackgroundEdges} from '../src/rendering/background.js';
import {PaintScene} from '../src/rendering/scene.js';
import {UIRenderer} from '../src/rendering/renderer.js';
const style={backgroundImage:'linear-gradient(rgb(0, 0, 0), rgb(0, 0, 0)), linear-gradient(rgb(255, 255, 255), rgb(255, 255, 255))',backgroundSize:'1px 100%,100% 2px',backgroundPosition:'100% 0%,0% 0%',backgroundRepeat:'no-repeat',backgroundOrigin:'border-box',backgroundClip:'border-box'};
test('classic background layers preserve CSS stack order and percentage positioning',()=>{
 const layers=solidBackgroundLayers(style),scene=new PaintScene(100,100,{pixelSnap:false});
 paintBackgroundLayers(scene,[10,20,40,24],scene.clip,layers);
 assert.deepEqual(scene.commands.map(c=>c.rect),[[10,20,40,2],[49,20,1,24]]);
 assert.deepEqual(scene.commands.map(c=>c.color),[[1,1,1,1],[0,0,0,1]]);
});
test('fractional background bounds and mixed length positions remain precise',()=>{
 const layers=solidBackgroundLayers({...style,backgroundSize:'25% 50%',backgroundPosition:'center bottom'}),scene=new PaintScene(100,100,{pixelSnap:false});
 paintBackgroundLayers(scene,[.5,1.25,40.5,24.5],scene.clip,layers);
 assert.deepEqual(scene.commands[0].rect,[15.6875,13.5,10.125,12.25]);
});
test('unsupported background images, gradients and repeating effects are explicit native paths',()=>{
 for(const changes of [{backgroundImage:'url(example.png)'},{backgroundImage:'linear-gradient(red, blue)'},{backgroundRepeat:'repeat'},{backgroundClip:'padding-box'},{backgroundSize:'cover'},{backgroundPosition:'right 3px top 2px'}]) {
   assert.throws(()=>solidBackgroundLayers({...style,...changes}),TypeError);
 }
});
test('failed first paint disconnects mutation observation before HTML fallback',async()=>{
 let observed=0,disconnected=0,disposed=0,removed=0,resized=0,cleared=0;
 const r=Object.create(UIRenderer.prototype);
 Object.assign(r,{view:{},resizeObserver:{disconnect(){resized++}},observedElements:new Set([{}]),retained:{clear(){cleared++}},disposed:false,generation:1,policy:{backend:'webgpu',text:'native'},metrics:{frames:0,invalidations:0,builds:[],submissions:[]},attempts:[],observer:{observe(){observed++},disconnect(){disconnected++}},document:{documentElement:{}},factory:async()=>({dispose(){disposed++}}),canvasForBackend:()=>({remove(){removed++}}),cancelFrame(){},renderNow(){throw Error('first draw failed')},publish(){}});
 await r.activate(['webgpu','html'],0,1);
 assert.equal(r.backend,'html');assert.equal(r.driver,null);
 assert.deepEqual([observed,disconnected,disposed,removed],[1,1,1,1]);
 assert.deepEqual(r.attempts,[{backend:'webgpu',reason:'first draw failed'}]);
 assert.equal(resized,1);assert.equal(cleared,1);assert.equal(r.observedElements.size,0);
});

test('background layers return their unsnapped authored rectangles',()=>{
 const scene=new PaintScene(200,100,{dpr:1.25}),layers=solidBackgroundLayers(style);
 const rects=paintBackgroundLayers(scene,[3,7,74,51],scene.clip,layers);
 assert.deepEqual(rects,[[3,7,74,2],[76,7,1,51]]);
 assert.notDeepEqual(scene.commands[0].rect,rects[0]);
});
test('fractional inner bevel edges preserve bounded coverage, not the whole control',()=>{
 const scene=new PaintScene(200,100,{dpr:1.25});
 preserveBackgroundEdges(scene,[[75,8,2,40],[75,8,2,40]],scene.clip);
 assert.equal(scene.commands.length,2); // shared edges are deduplicated
 assert.deepEqual(scene.commands.map(c=>c.rect.map(v=>Math.round(v*1.25))),[[92,10,3,50],[95,10,3,50]]);
 assert.ok(scene.commands.every(c=>c.hole && Math.abs(c.rect[2]*1.25-3)<1e-9));
});
test('integer background edges need no native coverage and fractional edges stay clipped',()=>{
 for(const dpr of [1,2,3,4]){
   const scene=new PaintScene(200,100,{dpr});
   preserveBackgroundEdges(scene,[[3,7,74,51]],scene.clip);
   assert.equal(scene.commands.length,0);
 }
 const scene=new PaintScene(200,100,{dpr:1.5});
 preserveBackgroundEdges(scene,[[3,7,74,51]],[10,10,40,20]);
 assert.equal(scene.commands.length,0);
});

test('fractional CSS image edges preserve native coverage inside, not just outside, borders',()=>{
  const scene=new PaintScene(100,100,{dpr:1.5}),layers=solidBackgroundLayers(style);
  const rectangles=paintBackgroundLayers(scene,[3,3,74,70],scene.clip,layers);
  preserveBackgroundEdges(scene,rectangles,scene.clip);
  const holes=scene.commands.filter(c=>c.hole);
  assert.ok(holes.length>0);
  // The inner edge of a 2px horizontal strip at y=5 crosses device row 7.
  assert.ok(holes.some(c=>c.rect[1]<=7/1.5 && c.rect[1]+c.rect[3]>7/1.5));
  // The upstream renderer also preserves independently rounded CSS image origins.
  // Keep its one-device-pixel halo on either side of the crossed pixel.
  assert.ok(holes.every(c=>c.rect[2]<=3/1.5+1e-6 || c.rect[3]<=3/1.5+1e-6));
});
test('integral CSS image edges do not create unnecessary native islands',()=>{
  const scene=new PaintScene(100,100,{dpr:2}),layers=solidBackgroundLayers(style);
  const rectangles=paintBackgroundLayers(scene,[3,3,74,70],scene.clip,layers);
  preserveBackgroundEdges(scene,rectangles,scene.clip);
  assert.equal(scene.commands.filter(c=>c.hole).length,0);
  assert.equal(scene.commands.length,2);
});

test('native one-device-pixel holes do not expand from floating-point arithmetic residue',()=>{
  for(const dpr of [1.25,1.5,1.75,2.25,3]) {
    const s=new PaintScene(500,500,{dpr});
    s.native([115/dpr,109/dpr,1/dpr,1/dpr],s.clip);
    const r=s.commands[0].rect;
    assert.ok(Math.abs(r[2]*dpr-1)<1e-12);assert.ok(Math.abs(r[3]*dpr-1)<1e-12);
    const t=new PaintScene(500,500,{dpr});
    t.native([115/dpr,109/dpr,1/dpr+1e-7,1/dpr+1e-7],t.clip);
    assert.ok(t.commands[0].rect[2]*dpr>1.9);assert.ok(t.commands[0].rect[3]*dpr>1.9);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {solidBackgroundLayers,paintBackgroundLayers} from '../src/rendering/background.js';
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

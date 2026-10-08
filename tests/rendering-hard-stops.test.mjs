import test from 'node:test';
import assert from 'node:assert/strict';
import {solidBackgroundLayers,paintBackgroundLayers} from '../src/rendering/background.js';
import {PaintScene} from '../src/rendering/scene.js';
const style={backgroundRepeat:'no-repeat',backgroundOrigin:'border-box',backgroundClip:'border-box'};

for(const [direction,expected] of [
 ['left',[48,20,2,24]],['right',[10,20,2,24]],
 ['top',[10,42,40,2]],['bottom',[10,20,40,2]]
])test(`full-box hard-stop ${direction} gradient lowers to an opaque rectangle`,()=>{
 const layers=solidBackgroundLayers({...style,backgroundImage:`linear-gradient(to ${direction}, rgb(128, 128, 128) 2px, rgba(0, 0, 0, 0) 2px)`,backgroundSize:'100% 100%',backgroundPosition:'0px 0px'});
 const scene=new PaintScene(100,100,{pixelSnap:false});
 const rectangles=paintBackgroundLayers(scene,[10,20,40,24],scene.clip,layers);
 assert.deepEqual(rectangles,[expected]);
 assert.deepEqual(scene.commands.map(c=>c.rect),[expected]);
 assert.deepEqual(scene.commands[0].color,[128/255,128/255,128/255,1]);
});

test('hard-stop percentages resolve inside the image area and clamp oversized bands',()=>{
 for(const [stop,want] of [['25%',[32.5,21.25,10.5,26.5]],['200px',[1,21.25,42,26.5]],['0px',null]]){
  const layers=solidBackgroundLayers({...style,backgroundImage:`linear-gradient(to left, rgb(255, 0, 0) ${stop}, transparent ${stop})`,backgroundSize:'50% 50%',backgroundPosition:'0px 100%'});
  const scene=new PaintScene(100,100,{pixelSnap:false});
  const rects=paintBackgroundLayers(scene,[1,-5.25,84,53],scene.clip,layers);
  assert.deepEqual(rects,want?[want]:[]);
 }
});

test('hard-stop lowering rejects fades, negative stops, incompatible units and nonaxis gradients',()=>{
 for(const image of [
  'linear-gradient(to right, rgb(255, 0, 0) 1px, transparent 2px)',
  'linear-gradient(to right, rgb(255, 0, 0) -1px, transparent -1px)',
  'linear-gradient(to right, rgb(255, 0, 0) 1px, transparent 1%)',
  'linear-gradient(to right, rgb(255, 0, 0) 1px, rgb(0, 0, 255) 1px)',
  'linear-gradient(45deg, rgb(255, 0, 0) 1px, transparent 1px)',
  'linear-gradient(to right, rgb(255, 0, 0) 1px, transparent 1px, rgb(0, 0, 255) 2px)'
 ])assert.throws(()=>solidBackgroundLayers({...style,backgroundImage:image}),TypeError,image);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {CanvasPainter} from '../src/rendering/canvas2d.js';
import {PaintScene} from '../src/rendering/scene.js';
function fixture(){
  const calls={save:0,restore:0,clip:0,fill:0,gradient:0,draw:0,clear:0,depth:0};
  const context={setTransform(){},clearRect(){calls.clear++;},save(){calls.save++;calls.depth++;},restore(){calls.restore++;calls.depth--;},beginPath(){},rect(){},clip(){calls.clip++;},fillRect(){calls.draw++;},drawImage(){calls.draw++;},set fillStyle(value){calls.fill++;},createLinearGradient(){calls.gradient++;return {addColorStop(){}};}};
  const canvas={width:100,height:100,getContext:()=>context};return {calls,context,painter:new CanvasPainter(canvas)};
}
test('10,000 same-clip quads set up one clip and one fill, not 10,000',()=>{
  const {painter,calls}=fixture(),s=new PaintScene(100,100);
  for(let i=0;i<10000;i++)s.add([i%100,Math.floor(i/100),1,1],[.2,.4,.8,1]);
  painter.render(s.seal());assert.equal(calls.clip,1);assert.equal(calls.save,1);assert.equal(calls.restore,1);
  assert.equal(calls.fill,1);assert.equal(calls.draw,10000);assert.equal(calls.depth,0);
});
test('adjacent clip runs preserve order including holes and textures',()=>{
  const {painter,calls}=fixture(),s=new PaintScene(100,100),a=[0,0,10,10],b=[20,0,10,10];
  s.add(a,[1,0,0,1],{clip:a});s.native([1,1,2,2],a);s.add(b,[0,1,0,1],{clip:b});s.add(a,[1,1,1,1],{clip:a,page:{canvas:{},width:1,height:1}});
  painter.render(s);assert.equal(calls.clip,3);assert.equal(calls.draw,3);assert.equal(calls.clear,2);assert.equal(calls.depth,0);
});
test('equal endpoint colors use a solid fill regardless of array identity',()=>{
  const {painter,calls}=fixture(),s=new PaintScene(100,100);s.add([0,0,10,10],[1,0,0,1],{color2:[1,0,0,1]});
  painter.render(s);assert.equal(calls.gradient,0);
});
test('a failed draw restores clip state before the next frame',()=>{
  const {painter,context,calls}=fixture(),s=new PaintScene(100,100);s.add([0,0,10,10],[1,0,0,1]);
  context.fillRect=()=>{throw Error('draw failed');};assert.throws(()=>painter.render(s),/draw failed/);assert.equal(calls.depth,0);
  context.fillRect=()=>calls.draw++;painter.render(s);assert.equal(calls.depth,0);assert.equal(calls.draw,1);
});

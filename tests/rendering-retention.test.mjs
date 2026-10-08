import test from 'node:test';
import assert from 'node:assert/strict';
import {PaintScene} from '../src/rendering/scene.js';
import {encodeInstances, canReuseInstances, rememberInstances, prepareBatches} from '../src/rendering/instances.js';
import {physicalSize} from '../src/rendering/policy.js';
import {subscribeDeviceLoss} from '../src/rendering/device.js';
import {WebGPUPainter} from '../src/rendering/webgpu.js';

test('sealed scenes snapshot caller arrays and prohibit untracked geometry changes', () => {
  const color=[1,0,0,1],rect=[0,0,10,10],s=new PaintScene(100,100);
  s.add(rect,color);s.seal();rect[0]=50;color[0]=0;
  assert.equal(s.commands[0].rect[0],0);assert.equal(s.commands[0].color[0],1);
  assert.equal(s.commands[0].color,s.commands[0].color2);
  assert.throws(()=>s.add([0,0,1,1],color),TypeError);
  assert.throws(()=>s.native([0,0,1,1],s.clip),TypeError);
  assert.throws(()=>{s.commands[0].rect[0]=90;},TypeError);
  assert.throws(()=>{s.width=50;},TypeError);assert.equal(s.seal(),s);
});
test('mutable scenes never use the sealed geometry cache', () => {
  const scene=new PaintScene(100,100),painter={},size=physicalSize(100,100);
  rememberInstances(painter,scene,size);assert.equal(canReuseInstances(painter,scene,size),false);
  scene.seal();rememberInstances(painter,scene,size);assert.equal(canReuseInstances(painter,scene,size),true);
  assert.equal(canReuseInstances(painter,scene,physicalSize(100,100,2)),false);
});
test('instance packing uses stable physical sample bounds at all supported DPI', () => {
  for(const dpr of [1,1.25,1.5,2,3,4]){
    const scene=new PaintScene(200,100,{dpr});scene.native([3.2,6.3,14.1,20.8],scene.clip);
    const data=new Float32Array(24);encodeInstances(scene.commands,data,dpr,dpr);
    const c=scene.commands[0];
    assert.equal(data[4],Math.ceil(c.clip[0]*dpr-.5));
    assert.equal(data[6],Math.ceil((c.clip[0]+c.clip[2])*dpr-.5)-data[4]);
    assert.equal(data[20],2);assert.equal(data[21],0);
  }
});
test('device-loss subscriptions release disposed painters and share one promise continuation', () => {
  let calls=0,notify;const device={lost:{then(fn){calls++;notify=fn;}}},seen=[];
  const off=subscribeDeviceLoss(device,i=>seen.push('gone'));
  subscribeDeviceLoss(device,i=>seen.push(i.reason));off();notify({reason:'destroyed'});
  assert.equal(calls,1);assert.deepEqual(seen,['destroyed']);
});
test('unsubscribing from an already-lost device suppresses the queued callback', async () => {
  let notify;const device={lost:{then(fn){notify=fn;}}};subscribeDeviceLoss(device,()=>{});notify({reason:'destroyed'});
  let calls=0;subscribeDeviceLoss(device,()=>calls++)();await Promise.resolve();assert.equal(calls,0);
});
function fakePainter(){
  const operations=[],buffers=[],view={GPUBufferUsage:{VERTEX:1,COPY_DST:2,MAP_READ:4},GPUMapMode:{READ:1}};
  const canvas={ownerDocument:{defaultView:view},width:0,height:0};
  const p=new WebGPUPainter(canvas,()=>{});
  p.context={getCurrentTexture(){operations.push('texture');return {createView(){return {};}};}};
  p.format='rgba8unorm';p.image=()=>({});p.decodeReadback=async()=>({data:new Uint8Array(16)});
  p.device={limits:{maxTextureDimension2D:8192,maxBufferSize:1<<24},queue:{writeBuffer(buffer,...args){operations.push(buffer===p.uniform?'uniform':'instances');},submit(){operations.push('submit');}},
    createBuffer(descriptor){const b={descriptor,destroy(){}};buffers.push(b);return b;},
    createCommandEncoder(){return {beginRenderPass(){return {setBindGroup(){},setVertexBuffer(){},setPipeline(){},draw(){},end(){operations.push('end');}};},copyTextureToBuffer(){operations.push('copy');},finish(){operations.push('finish');return {};}};}};
  p.uniform={};return {p,operations,buffers};
}
test('static geometry uploads once, while mutable scenes always upload', () => {
  const {p,operations}=fakePainter(),s=new PaintScene(10,10);s.add([0,0,10,10],[1,0,0,1]);s.seal();
  p.render(s);p.render(s);assert.equal(p.stats.geometryPacks,1);assert.equal(p.stats.instanceUploads,1);
  assert.equal(operations.filter(x=>x==='instances').length,1);
  const mutable=new PaintScene(10,10);mutable.add([0,0,10,10],[1,0,0,1]);p.render(mutable);mutable.commands[0].color[0]=.5;p.render(mutable);
  assert.equal(p.stats.instanceUploads,3);assert.equal(p.data[8],.5);
});
test('GPU readback copy is encoded before submission and uses a single current texture', async () => {
  const {p,operations,buffers}=fakePainter(),s=new PaintScene(10,10);s.add([0,0,10,10],[1,0,0,1]);
  await p.render(s,{readback:true});assert.equal(operations.filter(x=>x==='texture').length,1);
  assert.ok(operations.indexOf('end')<operations.indexOf('copy'));assert.ok(operations.indexOf('copy')<operations.indexOf('submit'));
  assert.equal(buffers.at(-1).descriptor.size,256*10);
});
test('GPU readback strips padded rows, swizzles BGRA, and frees staging memory', async () => {
  const bytes=new Uint8Array(512);bytes.set([3,2,1,255]);bytes.set([6,5,4,128],256);
  let destroyed=false,unmapped=false;const buffer={mapState:'mapped',mapAsync:async()=>{},getMappedRange:()=>bytes.buffer,unmap(){unmapped=true;},destroy(){destroyed=true;}};
  const p=new WebGPUPainter({ownerDocument:{defaultView:{GPUMapMode:{READ:1}}}},()=>{});p.format='bgra8unorm';
  const result=await p.decodeReadback({buffer,stride:256},{width:1,height:2});assert.deepEqual([...result.data],[1,2,3,255,4,5,6,128]);assert.ok(destroyed&&unmapped);
});
test('GPU startup rejects a blank output rather than advertising WebGPU success', async () => {
  const {p}=fakePainter();p.render=async()=>({data:new Uint8Array(16)});
  await assert.rejects(p.verifyOutput(100),/verification failed/);assert.equal(p.stats.outputVerified,false);
});

test('sealed scenes retain ordered batches while revised texture resources stay live', () => {
  const page={revision:1,width:2,height:2},s=new PaintScene(100,100);
  for(let i=0;i<10000;i++)s.add([0,0,1,1],[1,1,1,1]);
  s.add([1,1,2,2],[1,1,1,1],{page});s.native([3,3,2,2],s.clip);s.seal();
  const p={stats:{}},first=prepareBatches(p,s);page.revision++;
  for(let i=0;i<60;i++)assert.equal(prepareBatches(p,s),first);
  assert.equal(p.stats.batchBuilds,1);assert.equal(first.groups.length,3);
  assert.equal(first.groups[0].count,10000);assert.equal(first.groups[1].first,10000);
  assert.equal(first.groups[1].page.revision,2);assert.equal(first.groups[2].hole,true);
  const mutable=new PaintScene(10,10);prepareBatches(p,mutable);mutable.add([0,0,2,2],[1,0,0,1]);
  assert.equal(prepareBatches(p,mutable).groups.length,1);assert.equal(p.stats.batchBuilds,3);
});

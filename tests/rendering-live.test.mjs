import test from 'node:test';
import assert from 'node:assert/strict';
import {PaintScene} from '../src/rendering/scene.js';
import {RetainedScene, sameGeometry} from '../src/rendering/retained-scene.js';
function fixture(page = null) {
  const scene = new PaintScene(40,30,{dpr:1.5});
  scene.add([1,2,8,9],[.2,.3,.4,1],{page});return scene;
}
test('retained scene compares exact commands and retains one immutable snapshot',()=>{
  const cache=new RetainedScene(), first=cache.update(fixture());
  assert.equal(first.changed,true);assert.equal(first.scene.sealed,true);
  for(let i=0;i<100;i++){
    const next=cache.update(fixture());assert.equal(next.changed,false);assert.equal(next.scene,first.scene);
  }
  cache.clear();assert.equal(cache.scene,null);assert.equal(cache.resources.size,0);assert.equal(cache.update(fixture()).changed,true);
});
for(const field of ['rect','clip','color','color2','uv']) test(`retention detects an exact ${field} change`,()=>{
  const cache=new RetainedScene();cache.update(fixture());
  const next=fixture();next.commands[0][field]=[...next.commands[0][field]];next.commands[0][field][0]+=.00001;
  assert.equal(cache.update(next).geometryChanged,true);
});
for(const field of ['width','height','dpr','pixelSnap']) test(`retention detects ${field} changes`,()=>{
  const cache=new RetainedScene();cache.update(fixture());
  const next=fixture();next[field]=field==='pixelSnap'?false:next[field]+1;
  assert.equal(cache.update(next).changed,true);
});
for(const field of ['hole','vertical','page']) test(`retention detects command ${field}`,()=>{
  const cache=new RetainedScene();cache.update(fixture());const next=fixture();next.commands[0][field]=field==='page'?{}:true;
  assert.equal(cache.update(next).changed,true);
});
test('revised image pixels, source and dimensions resubmit without repacking geometry',()=>{
  const page={revision:1,width:2,height:2,canvas:{}},cache=new RetainedScene();
  const first=cache.update(fixture(page)).scene;
  for(const field of ['revision','width','height','canvas']){
    page[field]=field==='canvas'?{}:page[field]+1;const next=cache.update(fixture(page));
    assert.equal(next.changed,true);assert.equal(next.geometryChanged,false);assert.equal(next.scene,first);
    assert.equal(cache.update(fixture(page)).changed,false);
  }
  cache.update(fixture());assert.equal(cache.resources.size,0);assert.equal(cache.pages.size,0);
});
test('mutable caller arrays and command order cannot mutate cached frames',()=>{
  const cache=new RetainedScene(),original=fixture(),rect=original.commands[0].rect;
  cache.update(original);rect[0]=30;assert.equal(cache.scene.commands[0].rect[0],4/3);
  const next=fixture();next.add([1,2,8,9],[1,1,1,1]);assert.equal(cache.update(next).changed,true);
  const swapped=fixture();swapped.add([1,2,8,9],[1,1,1,1]);swapped.commands.reverse();assert.equal(cache.update(swapped).changed,true);
  assert.equal(sameGeometry(null,next),false);
});
test('custom mutable scenes cannot claim retained-pixel reuse',()=>{
  const cache=new RetainedScene(),scene={width:1,height:1,commands:[]};
  cache.update(fixture());assert.equal(cache.update(scene).changed,true);assert.equal(cache.scene,null);
  assert.equal(cache.update(scene).changed,true);
});

test('classic mnemonic continuity is explicit and does not change general prose styling', async()=>{
  const {readFile}=await import('node:fs/promises');
  const css=await readFile(new URL('../src/theme/bevels.css',import.meta.url),'utf8');
  assert.match(css,/\.menubar u[^{}]*\{[^}]*text-decoration-skip-ink:none;[^}]*text-decoration-line:none;[^}]*background-image:linear-gradient\(currentColor,currentColor\);/);
  assert.match(css,/background-size:100% 1px;\s*background-position:left bottom 1px;/);
  assert.match(css,/@media \(forced-colors: active\)\s*\{\s*\.menubar u[^{}]*\{[^}]*text-decoration-line:underline;\s*background-image:none;/);
  assert.doesNotMatch(css,/(?:^|\n)u\s*\{/);
  assert.match(css,/https:\/\/drafts\.csswg\.org\/css-text-decor-4\//);
});

for (const backend of ['webgpu','webgl2']) test(`${backend} reuploads a replaced canvas even when dimensions and revision are unchanged`, async()=>{
  let uploads=0;const source={},page={canvas:source,width:2,height:2,revision:1};let painter;
  if(backend==='webgpu'){
    const {WebGPUPainter}=await import('../src/rendering/webgpu.js');
    painter=Object.create(WebGPUPainter.prototype);
    Object.assign(painter,{textures:new Map(),stats:{uploadedBytes:0},view:{GPUTextureUsage:{TEXTURE_BINDING:1,COPY_DST:2,RENDER_ATTACHMENT:4}},device:{createTexture:()=>({createView:()=>({}),destroy(){}}),createBindGroup:()=>({}),queue:{copyExternalImageToTexture(){uploads++;}}}});
  }else{
    const {WebGLPainter}=await import('../src/rendering/webgl2.js');
    painter=Object.create(WebGLPainter.prototype);
    Object.assign(painter,{textures:new Map(),stats:{uploadedBytes:0},texture:()=>({}),gl:{bindTexture(){},pixelStorei(){},texImage2D(){uploads++;}}});
  }
  const resource=painter.image(page);painter.image(page);assert.equal(uploads,1);
  page.canvas={};assert.equal(painter.image(page),resource);assert.equal(uploads,2);
  painter.image(page);assert.equal(uploads,2);
  page.revision++;painter.image(page);assert.equal(uploads,3);assert.equal(painter.stats.uploadedBytes,48);
});

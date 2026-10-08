import test from 'node:test';
import assert from 'node:assert/strict';
import {PE32Image} from '../src/native/pe32.js';
import {compileWin32} from '../src/native/compiler.js';
import {newProject,createControl} from '../src/project/model.js';
import {NativeX86Machine} from './support/native-x86-machine.mjs';
import {nativeTestBitmap,nativeTestIcon,nativeDataUri} from './support/native-picture-fixtures.mjs';
function machine(t,{icon=false,optimization=0,code='Dim h As Long\nh=Image1.Picture.Handle'}={}){const p=newProject('PictureAbi'),image=createControl('Image','Image1');image.properties.Picture=nativeDataUri(icon?nativeTestIcon():nativeTestBitmap(),icon?'image/x-icon':'image/bmp');p.modules[0].form.controls=[image];p.modules[0].code=`Private Sub Form_Load()\n${code}\nEnd Sub`;let linked;const finish=PE32Image.prototype.finish;t.mock.method(PE32Image.prototype,'finish',function(...args){linked=finish.apply(this,args);return linked;});const result=compileWin32(p,{optimization});return {vm:new NativeX86Machine(linked),result,linked};}
function rasterHooks(vm,{fail='',width=2,height=2}={}){const lifecycle=[],streams=[],vtable=vm.memory.alloc(12,'IStream vtable');vm.memory.write(vtable+8,vm.function(1,([p])=>{assert.ok(streams.includes(p));lifecycle.push('stream-release');vm.memory.free(p);return 0;},'IStream.Release'));
 vm.hook('gdiplus.dll','GdiplusStartup',3,([out,input,extra])=>{assert.equal(vm.memory.read(input),1);assert.equal(vm.memory.read(input+12),1);assert.equal(extra,0);if(fail==='startup')return 1;vm.memory.write(out,7);return 0;});
 vm.hook('shlwapi.dll','SHCreateMemStream',2,([data,size])=>{assert.ok(size>=54);assert.equal(vm.memory.read(data,16),0x4d42);if(fail==='stream')return 0;const ptr=vm.memory.alloc(4,'IStream');vm.memory.write(ptr,vtable);streams.push(ptr);return ptr;});
 vm.hook('gdiplus.dll','GdipCreateBitmapFromStream',2,([stream,out])=>{assert.ok(streams.includes(stream));if(fail==='decode')return 3;vm.memory.write(out,0x12345678);return 0;});
 for(const [name,n]of [['Width',width],['Height',height]])vm.hook('gdiplus.dll','GdipGetImage'+name,2,([image,out])=>{assert.equal(image,0x12345678);if(fail===name)return 3;vm.memory.write(out,n);return 0;});
 vm.hook('gdiplus.dll','GdipDisposeImage',1,([image])=>{assert.equal(image,0x12345678);lifecycle.push('image-dispose');return 0;});
 vm.hook('gdiplus.dll','GdipCreateHBITMAPFromBitmap',3,([image,out,color])=>{assert.equal(image,0x12345678);assert.equal(color,0);vm.memory.write(out,900);return 0;});
 vm.hook('gdi32.dll','DeleteObject',1,([image])=>{assert.equal(image,900);lifecycle.push('bitmap-delete');return 1;});return lifecycle;
}
const records=vm=>vm.memory.regions.filter(r=>r.label==='native-owned-record').length;
for(const optimization of [0,1,2])test(`emitted bitmap helpers retain ownership and dispose image before stream O${optimization}`,t=>{
 const {vm}=machine(t,{optimization}),events=rasterHooks(vm),data=vm.symbol('native:picture:data:0'),size=nativeTestBitmap().length;
 const p=vm.invoke('native:picture:load',[data,size,1,2,2]);assert.equal(records(vm),1);assert.equal(vm.memory.read(p),1);assert.equal(vm.memory.read(p+20),2);assert.equal(vm.memory.read(p+24),2);
 assert.equal(vm.invoke('native:picture:retain',[p]),p);assert.equal(vm.memory.read(p),2);assert.equal(vm.invoke('native:picture:handle',[p]),900);assert.equal(vm.invoke('native:picture:handle',[p]),900);assert.equal(vm.calls.filter(c=>c.name==='iat:gdiplus.dll!GdipCreateHBITMAPFromBitmap').length,1);
 vm.invoke('native:picture:release',[p]);assert.equal(vm.memory.read(p),1);assert.deepEqual(events,[]);vm.invoke('native:picture:release',[p]);assert.deepEqual(events,['image-dispose','stream-release','bitmap-delete']);assert.equal(records(vm),0);
});
for(const fail of ['startup','stream','decode','Width','Height','dimensions'])test(`emitted bitmap failure ${fail} frees all acquired ownership`,t=>{
 const {vm}=machine(t),events=rasterHooks(vm,{fail,width:fail==='dimensions'?0:2}),data=vm.symbol('native:picture:data:0');assert.throws(()=>vm.invoke('native:picture:load',[data,nativeTestBitmap().length,1,2,2]),e=>e.number===481);assert.equal(records(vm),0);assert.equal(vm.memory.regions.filter(r=>r.label==='IStream').length,0);
 assert.deepEqual(events,fail==='startup'||fail==='stream'?[]:fail==='decode'?['stream-release']:['image-dispose','stream-release']);
});
for(const optimization of [0,1,2])test(`emitted icon-only helper uses HICON without importing raster codecs O${optimization}`,t=>{
 const {vm,result}=machine(t,{icon:true,optimization});assert.equal(result.report.imports.some(i=>i.dll==='gdiplus.dll'||i.dll==='shlwapi.dll'),false);let deleted=0;
 vm.hook('user32.dll','CreateIconFromResourceEx',7,([bits,size,isIcon,version,w,h,flags])=>{assert.equal(bits%4,0);assert.equal(vm.memory.read(bits),40);assert.equal(size,64);assert.equal(isIcon,1);assert.equal(version,0x30000);assert.deepEqual([w,h,flags],[2,2,0]);return 55;});
 vm.hook('user32.dll','DestroyIcon',1,([h])=>{assert.equal(h,55);deleted++;return 1;});const p=vm.invoke('native:picture:load',[vm.symbol('native:picture:data:0'),64,3,2,2]);assert.equal(vm.invoke('native:picture:handle',[p]),55);vm.invoke('native:picture:release',[p]);assert.equal(deleted,1);assert.equal(records(vm),0);
});
test('picture-free projects do not emit decoders or memory streams; unused assets are omitted',()=>{
 const p=newProject('Lean');p.assets={'unused.bmp':{encoding:'base64',data:Buffer.from(nativeTestBitmap()).toString('base64')}};const r=compileWin32(p);assert.equal(r.report.imports.some(i=>['gdiplus.dll','shlwapi.dll'].includes(i.dll)),false);assert.equal(Buffer.from(r.bytes).includes(Buffer.from(nativeTestBitmap())),false);
});

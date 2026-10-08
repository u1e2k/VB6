import assert from 'node:assert/strict';
import {PE32Image} from '../../src/native/pe32.js';import {compileWin32} from '../../src/native/compiler.js';
import {newProject,createControl} from '../../src/project/model.js';import {NativeX86Machine} from './native-x86-machine.mjs';
import {NATIVE_GRID_FIELDS as F} from '../../src/native/control-grid-contract.js';
export function emittedGrid(t,code='',optimization=0,events=''){
 const p=newProject('GridABI'),c=createControl('MSFlexGrid','G');p.modules[0].form.controls=[c];p.modules[0].code=`Private Sub Form_Load()\n${code}\nEnd Sub\n${events}`;
 let linked;const finish=PE32Image.prototype.finish;t.mock.method(PE32Image.prototype,'finish',function(...args){linked=finish.apply(this,args);return linked;});
 const result=compileWin32(p,{optimization}),vm=new NativeX86Machine(linked),m=vm.memory,arrays=new Map();
 const create=(kind,bounds)=>{const size=kind===8||kind===3?4:0;assert.ok(size);const count=bounds.reduce((v,b)=>v*b.count,1),data=m.alloc(Math.max(4,count*size),'array-data'),handle=m.alloc(16+8*bounds.length,'SAFEARRAY');
  const a={kind,bounds,data,count,handle};arrays.set(handle,a);for(let i=0;i<count;i++)m.write(data+4*i,0);
  m.write(handle,bounds.length,16);m.write(handle+2,kind===8?0x100:0,16);m.write(handle+4,4);m.write(handle+8,0);m.write(handle+12,data);
  bounds.toReversed().forEach((b,i)=>{m.write(handle+16+8*i,b.count);m.write(handle+20+8*i,b.lower);});return handle;};
 const pointer=(handle,indices)=>{const a=arrays.get(handle);assert.ok(a,'valid SAFEARRAY');let offset=0,stride=1;for(const b of a.bounds){const i=m.read(indices)|0;indices+=4;if(i<b.lower||i>=b.lower+b.count)return null;offset+=(i-b.lower)*stride;stride*=b.count;}return a.data+offset*4;};
 vm.hook('oleaut32.dll','SafeArrayCreateVector',3,([kind,lower,count])=>create(kind,[{lower:lower|0,count}]));
 vm.hook('oleaut32.dll','SafeArrayCreate',3,([kind,rank,bounds])=>create(kind,Array.from({length:rank},(_,i)=>({count:m.read(bounds+i*8),lower:m.read(bounds+i*8+4)|0}))));
 vm.hook('oleaut32.dll','SafeArrayGetDim',1,([h])=>arrays.get(h).bounds.length);
 vm.hook('oleaut32.dll','SafeArrayLock',1,([h])=>{m.write(h+8,m.read(h+8)+1);return 0;});
 vm.hook('oleaut32.dll','SafeArrayUnlock',1,([h])=>{assert.ok(m.read(h+8)>0);m.write(h+8,m.read(h+8)-1);return 0;});
 vm.hook('oleaut32.dll','SafeArrayPtrOfIndex',3,([h,idx,out])=>{const at=pointer(h,idx);if(at===null)return 0x8002000b;m.write(out,at);return 0;});
 vm.hook('oleaut32.dll','SafeArrayGetElement',3,([h,idx,out])=>{const at=pointer(h,idx);if(at===null)return 0x8002000b;const a=arrays.get(h),v=m.read(at);m.write(out,a.kind===8?(v?m.string(m.bstr(v)):0):v);return 0;});
 vm.hook('oleaut32.dll','SafeArrayPutElement',3,([h,idx,input])=>{const at=pointer(h,idx);if(at===null)return 0x8002000b;const a=arrays.get(h);if(a.kind===8){const old=m.read(at),copy=input?m.string(m.bstr(input)):0;if(old)m.free(old-4);m.write(at,copy);}else m.write(at,m.read(input));return 0;});
 vm.hook('oleaut32.dll','SafeArrayDestroy',1,([h])=>{if(!h)return 0;const a=arrays.get(h);assert.ok(a,'single SAFEARRAY destruction');assert.equal(m.read(h+8),0,'array is not locked at destruction');if(a.kind===8)for(let i=0;i<a.count;i++){const v=m.read(a.data+4*i);if(v)m.free(v-4);}arrays.delete(h);m.free(a.data);m.free(h);return 0;});
 vm.hook('user32.dll','InvalidateRect',3,()=>1);
 const state=vm.symbol('control-state:Form1:g');vm.hook('user32.dll','GetWindowLongW',2,([hwnd,index])=>{assert.equal(hwnd,101);assert.equal(index|0,-21);return state;});
 vm.hook('user32.dll','SendMessageW',4,()=>0);
 for(const [symbol,value]of [['hwnd:Form1',100],['hwnd:Form1:g',101],['initialized:Form1',1],['loaded:Form1',1]])m.write(vm.symbol(symbol),value);

 const invoke=(name,args)=>vm.invoke('proc:VB6NativeGrid:'+name,args);
 invoke('Initialize',[0,101,3,3]);const epoch=invoke('Stamp',[0]);m.write(state+76,0);m.write(state+80,epoch);m.write(state+140,100);
 return {vm,m,result,arrays,invoke,epoch,args:[0,101,epoch],state};
}

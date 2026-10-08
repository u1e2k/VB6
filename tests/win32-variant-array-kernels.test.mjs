import test from 'node:test';
import assert from 'node:assert/strict';
import {PE32Image} from '../src/native/pe32.js';
import {X86} from '../src/native/x86.js';
import {emitNativeVariantArrayHelpers} from '../src/native/variant-array-kernels.js';
import {NATIVE_VARIANT_ARRAY_WIDTHS as widths} from '../src/native/variant-types.js';
import {NativeX86Machine} from './support/native-x86-machine.mjs';
const P='native:variant-array:',A='native:array:',V='native:variant:';
function harness(){
 const image=new PE32Image(),x=new X86(image.section('.text',0x60000020),image);
 emitNativeVariantArrayHelpers({x,nativeVariantArrayFeatures:new Set(['element','bound','take','erase','redim'])});
 for(const prefix of [A,V]){const okay=x.unique();x.label(prefix+'check').test().branch('ns',okay);for(const [hr,n] of [[0x8002000b,9],[0x8002000d,10],[0x8007000e,7]])x.compare(hr).branch('e','error:'+n);x.jump('error:13').label(okay).ret();}
 for(const [name,args]of [['upper',2],['lower',2],['destroy',1],['redim',6]])x.label(A+name).ret(args*4);
 x.label(V+'publish').ret(8);for(const n of [5,6,7,9,10,13,91,94])x.label('error:'+n).value(n).jump('native:error:raise');x.label('native:error:raise').ret();
 const cpu=new NativeX86Machine(image.finish(P+'slot')),m=cpu.memory,arrays=new Map(),fault={type:0,lock:0,index:0,destroy:0},redims=[];
 const alloc=n=>{const p=m.alloc(n);m.region(p).bytes.fill(0);return p;};
 const array=(tag=3,bounds=[[0,2]],{fixed=false,width=widths[tag]}={})=>{const p=alloc(16+bounds.length*8),count=bounds.reduce((n,[l,u])=>n*(u-l+1),1),data=count?alloc(count*width):0;
  m.write(p,bounds.length,16);m.write(p+2,fixed?16:0,16);m.write(p+4,width);m.write(p+12,data);bounds.forEach(([l,u],i)=>{m.write(p+16+8*i,u-l+1);m.write(p+20+8*i,l);});arrays.set(p,{tag,bounds,width,data});return p;};
 const variant=(tag=0,value=0)=>{const p=alloc(16);m.write(p,tag,16);m.write(p+8,value);return p;};
 const destroy=p=>{if(!p)return 0;assert.ok(arrays.has(p));if(m.read(p+8)||fault.destroy)return fault.destroy||0x8002000d;const a=arrays.get(p);if(a.data)m.free(a.data);m.free(p);arrays.delete(p);return 0;};
 const error=n=>{const e=new Error('mock VB error '+n);e.number=n;throw e;};
 const hook=(name,args,callback)=>cpu.hooks.set(cpu.symbol(name),{args,callback,name});
 cpu.hook('oleaut32.dll','SafeArrayGetDim',1,([p])=>arrays.get(p).bounds.length);
 cpu.hook('oleaut32.dll','SafeArrayGetVartype',2,([p,out])=>{m.write(out,arrays.get(p).tag,16);return fault.type;});
 cpu.hook('oleaut32.dll','SafeArrayGetElemsize',1,([p])=>arrays.get(p).width);
 cpu.hook('oleaut32.dll','SafeArrayLock',1,([p])=>{if(fault.lock)return fault.lock;m.write(p+8,m.read(p+8)+1);return 0;});
 cpu.hook('oleaut32.dll','SafeArrayPtrOfIndex',3,([p,indices,out])=>{if(fault.index)return fault.index;const a=arrays.get(p);let offset=0,stride=1;for(let i=0;i<a.bounds.length;i++){const n=m.read(indices+4*i)|0,[l,u]=a.bounds[i];if(n<l||n>u)return 0x8002000b;offset+=(n-l)*stride;stride*=u-l+1;}m.write(out,a.data+a.width*offset);return 0;});
 cpu.hook('oleaut32.dll','SafeArrayDestroy',1,([p])=>destroy(p));
 for(const upper of [false,true])hook(A+(upper?'upper':'lower'),2,([slot,dim])=>{const p=m.read(slot);if(!p)error(9);const a=arrays.get(p);if(dim<1||dim>a.bounds.length)error(9);return a.bounds[dim-1][upper?1:0];});
 hook(A+'destroy',1,([slot])=>{const hr=destroy(m.read(slot));if(hr)error(10);m.write(slot,0);return 0;});
 hook(A+'redim',6,([slot,tag,rank,bounds,preserve,fixed])=>{assert.equal(fixed,0);const b=Array.from({length:rank},(_,i)=>{const l=m.read(bounds+8*i+4)|0;return[l,l+m.read(bounds+8*i)-1];});redims.push({slot,tag,rank,bounds:b,preserve});const old=m.read(slot);if(old&&(m.read(old+8)||m.read(old+2,16)&16))error(10);const p=array(tag,b);destroy(old);m.write(slot,p);return 0;});
 hook(V+'publish',2,([dest,source])=>{assert.equal(m.read(dest,16),0);for(let i=0;i<16;i+=4){m.write(dest+i,m.read(source+i));m.write(source+i,0);}return dest;});
 const call=(name,args)=>{const esp=cpu.get('esp');try{return cpu.invoke(name.startsWith('native:')?name:P+name,args);}finally{cpu.set('esp',esp);}};
 const element=(value,indices=[0])=>{const v=alloc(16),pin=alloc(4),ix=alloc(indices.length*4);indices.forEach((n,i)=>m.write(ix+4*i,n));return {args:[value,indices.length,ix,pin,v],view:v,pin,indices:ix};};
 const bounds=values=>{const p=alloc(values.length*8);values.forEach(([l,u],i)=>{m.write(p+8*i,u-l+1);m.write(p+8*i+4,l);});return p;};
 return {m,cpu,alloc,array,arrays,variant,call,element,bounds,redims,fault};
}
for(const tag of Object.keys(widths).map(Number))test('Variant-array slot accepts exact supported element tag '+tag,()=>{
 const h=harness(),p=h.array(tag),v=h.variant(0x2000|tag,p);assert.equal(h.call('slot',[v]),v+8);assert.equal(h.cpu.get('edx'),tag);
 const slot=h.alloc(4);h.m.write(slot,p);const ref=h.variant(0x6000|tag,slot);assert.equal(h.call('slot',[ref]),slot);assert.equal(h.cpu.get('edx'),tag);
});
for(const tag of [0,1,3,8,12,0x2009,0x200d,0x200e,0x2010,0x3003,0xa003])test('Variant-array slot rejects non-array or unsupported tag '+tag,()=>{
 const h=harness();assert.throws(()=>h.call('slot',[h.variant(tag)]),e=>e.number===13);
});
test('Variant-array slot follows borrowed Variant chains without copying values',()=>{
 const h=harness(),v=h.variant(0x2003,h.array()),a=h.variant(0x400c,v),b=h.variant(0x400c,a);assert.equal(h.call('slot',[b]),v+8);assert.equal(h.cpu.calls.length,0);
});
test('Variant-array slot rejects null reference and cyclic Variant chains deterministically',()=>{
 const h=harness(),v=h.variant(0x400c);assert.throws(()=>h.call('slot',[0]),e=>e.number===91);assert.throws(()=>h.call('slot',[v]),e=>e.number===91);h.m.write(v+8,v);assert.throws(()=>h.call('slot',[v]),e=>e.number===13);
});
for(const tag of Object.keys(widths).map(Number))test('Variant-array element pins and exposes correct ABI for VARTYPE '+tag,()=>{
 const h=harness(),p=h.array(tag,[[-1,1]]),v=h.variant(0x2000|tag,p),e=h.element(v,[0]),actual=h.call('element',e.args),data=h.arrays.get(p).data+widths[tag];
 assert.equal(h.m.read(e.pin),p);assert.equal(h.m.read(p+8),1);
 if(tag===12)assert.equal(actual,data);else{assert.equal(actual,e.view);assert.equal(h.m.read(actual,16),0x4000|tag);assert.equal(h.m.read(actual+8),data);}
});
test('Variant-array multidimensional element lookup uses evaluated declaration-order indices',()=>{
 const h=harness(),p=h.array(3,[[-2,0],[3,4]]),v=h.variant(0x2003,p),e=h.element(v,[-1,4]);h.call('element',e.args);assert.equal(h.m.read(e.view+8),h.arrays.get(p).data+(1+3)*4);
});
for(const [option,n]of [['type',13],['width',13],['rank',9],['nil',9],['lock',10]])test('Variant-array '+option+' failure precedes pin publication',()=>{
 const h=harness(),p=h.array(3),v=h.variant(0x2003,option==='nil'?0:p),e=h.element(v,option==='rank'?[0,0]:[0]);
 if(option==='type')h.arrays.get(p).tag=2;if(option==='width')h.arrays.get(p).width=8;if(option==='lock')h.fault.lock=0x8002000d;
 assert.throws(()=>h.call('element',e.args),err=>err.number===n);assert.equal(h.m.read(e.pin),0);assert.equal(h.m.read(p+8),0);
});
test('Variant-array index failure leaves its acquired pin visible for statement cleanup',()=>{
 const h=harness(),p=h.array(),v=h.variant(0x2003,p),e=h.element(v,[99]);assert.throws(()=>h.call('element',e.args),err=>err.number===9);assert.equal(h.m.read(e.pin),p);assert.equal(h.m.read(p+8),1);
});
test('Variant array bounds forward the descriptor slot and requested dimension',()=>{
 const h=harness(),v=h.variant(0x2003,h.array(3,[[-2,0],[8,9]]));assert.equal(h.call('lower',[v,1])|0,-2);assert.equal(h.call('upper',[v,2]),9);assert.throws(()=>h.call('lower',[v,3]),e=>e.number===9);
});
test('erasing an owned array Variant retains its VARTYPE and empties its pointer',()=>{
 const h=harness(),v=h.variant(0x2003,h.array());h.call('erase',[v]);assert.equal(h.m.read(v,16),0x2003);assert.equal(h.m.read(v+8),0);h.call('erase',[v]);assert.throws(()=>h.call('upper',[v,1]),e=>e.number===9);
});
for(const fault of ['type','fixed','lock','destroy'])test('Variant-array extraction '+fault+' rejection preserves both old and new owners',()=>{
 const h=harness(),old=h.array(3,[[0,2]],{fixed:fault==='fixed'}),copy=h.array(3),dest=h.alloc(4),source=h.variant(0x2003,copy);h.m.write(dest,old);
 if(fault==='lock')h.m.write(old+8,1);if(fault==='destroy')h.fault.destroy=0x8002000d;
 assert.throws(()=>h.call('take',[dest,source,fault==='type'?2:3]),e=>e.number===(fault==='type'?13:10));assert.equal(h.m.read(dest),old);assert.equal(h.m.read(source+8),copy);assert.equal(h.arrays.size,2);
});
test('Variant-array extraction transfers the owned snapshot and drops copied fixedness',()=>{
 const h=harness(),old=h.array(),copy=h.array(3,[[0,1]],{fixed:true}),dest=h.alloc(4),source=h.variant(0x2003,copy);h.m.write(dest,old);h.call('take',[dest,source,3]);
 assert.equal(h.m.read(dest),copy);assert.equal(h.m.read(source+8),0);assert.equal(h.m.read(source,16),0x2003);assert.equal(h.m.read(copy+2,16)&16,0);assert.equal(h.arrays.size,1);
});
for(const type of [0,2,3,4,5,6,7,8,11,12,17])test('Variant ReDim of Empty publishes the allocated VARTYPE '+type,()=>{
 const h=harness(),v=h.variant();h.call('redim',[v,type,2,h.bounds([[-2,1],[7,8]]),0]);assert.equal(h.m.read(v,16),0x2000|(type||12));assert.deepEqual(h.redims[0].bounds,[[-2,1],[7,8]]);assert.equal(h.redims[0].tag,type||12);
});
test('Variant ReDim retains its existing array type when no As clause is supplied',()=>{
 const h=harness(),v=h.variant(0x2008,h.array(8));h.call('redim',[v,0,1,h.bounds([[1,4]]),1]);assert.equal(h.m.read(v,16),0x2008);assert.equal(h.redims[0].tag,8);assert.equal(h.redims[0].preserve,1);
});
test('Variant ReDim cannot change a preserved element type or a borrowed declaration',()=>{
 const h=harness(),p=h.array(3),v=h.variant(0x2003,p),b=h.bounds([[0,5]]);assert.throws(()=>h.call('redim',[v,8,1,b,1]),e=>e.number===13);
 const r=h.variant(0x6003,v+8);assert.throws(()=>h.call('redim',[r,8,1,b,0]),e=>e.number===13);assert.equal(h.m.read(v+8),p);assert.equal(h.redims.length,0);
});
test('Variant ReDim commits a new element tag only after successful replacement',()=>{
 const h=harness(),p=h.array(3),v=h.variant(0x2003,p),b=h.bounds([[0,5]]);h.m.write(p+8,1);assert.throws(()=>h.call('redim',[v,8,1,b,0]),e=>e.number===10);assert.equal(h.m.read(v,16),0x2003);assert.equal(h.m.read(v+8),p);
 h.m.write(p+8,0);h.call('redim',[v,8,1,b,0]);assert.equal(h.m.read(v,16),0x2008);assert.equal(h.arrays.get(h.m.read(v+8)).tag,8);
});

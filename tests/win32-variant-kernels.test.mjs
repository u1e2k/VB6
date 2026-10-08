import test from 'node:test';
import assert from 'node:assert/strict';
import {PE32Image} from '../src/native/pe32.js';
import {X86} from '../src/native/x86.js';
import {emitNativeVariantHelpers} from '../src/native/variant-kernels.js';
import {NativeX86Machine} from './support/native-x86-machine.mjs';
const P='native:variant:';
const operations={add:'VarAdd',subtract:'VarSub',multiply:'VarMul',divide:'VarDiv',idiv:'VarIdiv',mod:'VarMod',pow:'VarPow',and:'VarAnd',or:'VarOr',xor:'VarXor',eqv:'VarEqv',imp:'VarImp',cat:'VarCat',negate:'VarNeg',not:'VarNot',abs:'VarAbs',fix:'VarFix',int:'VarInt'};
function harness(){
 const image=new PE32Image(),x=new X86(image.section('.text',0x60000020),image);
 emitNativeVariantHelpers({x,nativeVariantsUsed:new Set(['copy','change','condition','compare',...Object.keys(operations)])});
 for(const n of [5,6,7,9,10,11,13,94,449])x.label('error:'+n).value(n).jump('native:error:raise');
 x.label('native:error:raise').ret().label('native:string:compare').ret();
 const cpu=new NativeX86Machine(image.finish(P+'copy')),mem=cpu.memory,fault={copy:0,clear:0,change:0,operation:0,partial:false};
 function read(p){const vt=mem.read(p,16),bits=mem.read(p+8);return {vt,value:vt===8?mem.bstr(bits):bits|0};}
 function clear(p){if(fault.clear===p)return 0x8002000d;if(mem.read(p,16)===8){const value=mem.read(p+8);if(value)mem.free(value-4);}for(let i=0;i<16;i+=4)mem.write(p+i,0);return 0;}
 function write(p,vt,value){for(let i=0;i<16;i+=4)mem.write(p+i,0);mem.write(p,vt,16);mem.write(p+8,vt===8?mem.string(value):value||0);}
 const slot=(vt=0,value=0)=>{const p=mem.alloc(16,'VARIANT');write(p,vt,value);return p;};
 cpu.hook('oleaut32.dll','VariantClear',1,([p])=>clear(p));
 cpu.hook('oleaut32.dll','VariantCopyInd',2,([out,source])=>{const v=read(source);if(!fault.copy||fault.partial)write(out,v.vt,v.value);return fault.copy;});
 cpu.hook('oleaut32.dll','VariantChangeTypeEx',5,([out,source,lcid,flags,vt])=>{
  assert.equal(lcid,0x400);assert.equal(flags,2);const v=read(source);if(!fault.change||fault.partial)write(out,vt,vt===8?String(v.value):vt===11?(v.value?-1:0):Number(v.value));return fault.change;
 });
 for(const [name,api]of Object.entries(operations))cpu.hook('oleaut32.dll',api,['negate','not','abs','fix','int'].includes(name)?2:3,args=>{
  const out=args.at(-1),left=read(args[0]),right=args.length===3?read(args[1]):null;
  if(!fault.operation||fault.partial){if(fault.partial)write(out,8,'partial');else write(out,left.vt===1||right?.vt===1?1:3,123);}
  return fault.operation;
 });
 cpu.hook('oleaut32.dll','VarCmp',4,([a,b,lcid,flags])=>{assert.equal(lcid,0x400);assert.ok(flags===0||flags===1);let av=read(a),bv=read(b);if(av.vt===1||bv.vt===1)return 3;if(flags&&av.vt===8&&bv.vt===8){av.value=av.value.toLowerCase();bv.value=bv.value.toLowerCase();}return av.value===bv.value?1:av.value<bv.value?0:2;});
 cpu.hooks.set(cpu.symbol('native:string:compare'),{args:2,name:'ordinal-counted-compare',callback:([a,b])=>{a=mem.bstr(a);b=mem.bstr(b);return a===b?0:a<b?-1:1;}});
 const call=(name,args)=>{const esp=cpu.get('esp');try{return cpu.invoke(P+name,args);}finally{cpu.set('esp',esp);}};
 return {cpu,mem,fault,read,write,slot,call};
}
for(const [vt,value]of [[0,0],[1,0],[2,-7],[3,65536],[8,'a\0b\ud800'],[10,2042],[11,-1],[14,123]])test('Variant deep copy and self-copy, tag '+vt,()=>{
 const h=harness(),a=h.slot(vt,value),b=h.slot(8,'old');h.call('copy',[b,a]);assert.deepEqual(h.read(b),h.read(a));
 if(vt===8)assert.notEqual(h.mem.read(a+8),h.mem.read(b+8));h.call('copy',[b,b]);assert.deepEqual(h.read(b),h.read(a));h.call('clear',[a]);assert.deepEqual(h.read(b),{vt,value});h.call('clear',[b]);
});
for(const partial of [false,true])test('failed VariantCopyInd releases partial output and preserves destination '+partial,()=>{
 const h=harness(),a=h.slot(8,'source'),b=h.slot(8,'destination'),regions=h.mem.regions.length;h.fault.copy=0x8007000e;h.fault.partial=partial;
 assert.throws(()=>h.call('copy',[b,a]),e=>e.number===7);assert.deepEqual(h.read(b),{vt:8,value:'destination'});assert.equal(h.mem.regions.length,regions);
});
test('failed destination clear leaves source and old destination intact',()=>{
 const h=harness(),a=h.slot(8,'source'),b=h.slot(8,'old'),regions=h.mem.regions.length;h.fault.clear=b;
 assert.throws(()=>h.call('copy',[b,a]),e=>e.number===10);assert.equal(h.mem.regions.length,regions);assert.deepEqual(h.read(a),{vt:8,value:'source'});assert.deepEqual(h.read(b),{vt:8,value:'old'});
});
for(const [source,vt,value,expected]of [[8,3,'123',123],[3,8,123,'123'],[0,11,0,0],[3,11,7,-1]])test('checked Variant coercion '+JSON.stringify([source,vt,value]),()=>{
 const h=harness(),a=h.slot(source,value),out=h.slot(8,'old');h.call('change',[out,a,vt,0]);assert.deepEqual(h.read(out),{vt,value:expected});
});
for(const [vt,value,error]of [[1,0,94],[10,2042,13],[10,0x80020004,449]])test('implicit Variant conversion error '+error,()=>{
 const h=harness(),source=h.slot(vt,value),out=h.slot(8,'old');assert.throws(()=>h.call('change',[out,source,3,0]),e=>e.number===error);assert.deepEqual(h.read(out),{vt:8,value:'old'});
});
test('explicit Error conversion uses a borrowed I4 view, but Missing remains an error',()=>{
 const h=harness(),source=h.slot(10,2042),out=h.slot();h.call('change',[out,source,3,1]);assert.deepEqual(h.read(out),{vt:3,value:2042});assert.deepEqual(h.read(source),{vt:10,value:2042});
 const missing=h.slot(10,0x80020004);assert.throws(()=>h.call('change',[out,missing,3,1]),e=>e.number===449);
});
for(const [hr,error]of [[0x8002000a,6],[0x8007000e,7],[0x8002000b,9],[0x8002000d,10],[0x80020012,11],[0x80070057,5],[0x80020005,13]])test('failed coercion maps HRESULT '+hr.toString(16)+' transactionally',()=>{
 const h=harness(),a=h.slot(3,12),b=h.slot(8,'old'),regions=h.mem.regions.length;h.fault.change=hr;h.fault.partial=true;assert.throws(()=>h.call('change',[b,a,8,0]),e=>e.number===error);assert.deepEqual(h.read(b),{vt:8,value:'old'});assert.equal(h.mem.regions.length,regions);
});
for(const name of Object.keys(operations))test(name+' uses owned result ABI and releases a failed partial result',()=>{
 const h=harness(),a=h.slot(3,2),b=h.slot(3,3),out=h.slot(8,'old');const args=['negate','not','abs','fix','int'].includes(name)?[out,a]:[out,a,b];
 h.call(name,args);assert.deepEqual(h.read(out),{vt:3,value:123});h.fault.operation=0x8002000a;h.fault.partial=true;const regions=h.mem.regions.length;
 assert.throws(()=>h.call(name,args),e=>e.number===6);assert.deepEqual(h.read(out),{vt:3,value:123});assert.equal(h.mem.regions.length,regions);
});
for(const [mask,op]of [[1,(a,b)=>a<b],[2,(a,b)=>a===b],[4,(a,b)=>a>b],[3,(a,b)=>a<=b],[6,(a,b)=>a>=b],[5,(a,b)=>a!==b]])test('comparison mask '+mask+' handles less/equal/greater and Null',()=>{
 const h=harness(),out=h.slot();for(const [a,b]of [[1,2],[2,2],[3,2]]){h.call('compare',[out,h.slot(3,a),h.slot(3,b),mask,0]);assert.deepEqual(h.read(out),{vt:11,value:op(a,b)?-1:0});}
 h.call('compare',[out,h.slot(1),h.slot(3,0),mask,0]);assert.deepEqual(h.read(out),{vt:1,value:0});
});
test('Variant String binary comparison stays ordinal and includes embedded NUL',()=>{
 const h=harness(),out=h.slot(),a=h.slot(8,'a\0B'),b=h.slot(8,'a\0b');h.call('compare',[out,a,b,2,0]);assert.equal(h.read(out).value,0);assert.ok(h.cpu.calls.some(c=>c.name==='ordinal-counted-compare'));h.call('compare',[out,a,b,2,1]);assert.equal(h.read(out).value,-1);
});
test('Null conditions are false; explicit Boolean conversion still rejects Null',()=>{
 const h=harness(),a=h.slot(1),out=h.slot();assert.equal(h.call('condition',[a]),0);assert.throws(()=>h.call('change',[out,a,11,1]),e=>e.number===94);assert.equal(h.call('condition',[h.slot(3,12)])|0,-1);
});
test('unused Variant subsystem emits no runtime code or imports',()=>{
 const image=new PE32Image(),section=image.section('.text',0x60000020),x=new X86(section,image);emitNativeVariantHelpers({x});assert.equal(section.length,0);assert.equal(image.imports.size,0);
});

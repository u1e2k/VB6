import test from 'node:test';
import assert from 'node:assert/strict';
import {PE32Image} from '../src/native/pe32.js';
import {X86} from '../src/native/x86.js';
import {emitNativeVariantHelpers} from '../src/native/variant-kernels.js';
import {NativeX86Machine} from './support/native-x86-machine.mjs';
const P='native:variant:';
// Execute emitted IA-32 instructions against explicit API mocks. The failure
// input is the observed x86 Windows VarDiv HRESULT, not a replacement OS oracle.
function harness({hr=0x8002000a,partial=true,conversionFailure=0}={}){
 const image=new PE32Image(),x=new X86(image.section('.text',0x60000020),image);
 emitNativeVariantHelpers({x,nativeVariantsUsed:new Set(['divide'])});
 for(const n of [5,6,7,9,10,11,13,94,449])x.label('error:'+n).value(n).jump('native:error:raise');
 x.label('native:error:raise').ret();
 const cpu=new NativeX86Machine(image.finish(P+'divide')),mem=cpu.memory;
 const zero=p=>{for(let i=0;i<16;i+=4)mem.write(p+i,0);};
 const fp=(p,value)=>{const b=new DataView(new ArrayBuffer(8));b.setFloat64(0,value,true);mem.write(p,b.getUint32(0,true));mem.write(p+4,b.getUint32(4,true));};
 const number=p=>{const vt=mem.read(p,16);if(vt===0)return 0;if(vt===8)return Number(mem.bstr(mem.read(p+8)));
  if(vt===5||vt===7){const b=new DataView(new ArrayBuffer(8));b.setUint32(0,mem.read(p+8),true);b.setUint32(4,mem.read(p+12),true);return b.getFloat64(0,true);}
  if(vt===4){const b=new DataView(new ArrayBuffer(4));b.setUint32(0,mem.read(p+8),true);return b.getFloat32(0,true);}
  if(vt===6)return Number(BigInt.asIntN(64,BigInt(mem.read(p+8))|(BigInt(mem.read(p+12))<<32n)))/10000;
  if(vt===14)return mem.read(p+8);return mem.read(p+8)|0;};
 const slot=(vt,value=0)=>{const p=mem.alloc(16,'VARIANT');zero(p);mem.write(p,vt,16);
  if(vt===8)mem.write(p+8,mem.string(String(value)));
  else if(vt===5||vt===7)fp(p+8,value);
  else if(vt===4){const b=new DataView(new ArrayBuffer(4));b.setFloat32(0,value,true);mem.write(p+8,b.getUint32(0,true));}
  else if(vt===6){const bits=BigInt.asUintN(64,BigInt(value)*10000n);mem.write(p+8,Number(bits&0xffffffffn));mem.write(p+12,Number(bits>>32n));}
  else mem.write(p+8,value);return p;};
 cpu.hook('oleaut32.dll','VarDiv',3,([a,b,out])=>{if(partial){zero(out);mem.write(out,8,16);mem.write(out+8,mem.string('partial result'));}return hr;});
 cpu.hook('oleaut32.dll','VariantChangeTypeEx',5,([out,source,lcid,flags,vt])=>{
  assert.equal(lcid,0x400);assert.equal(flags,2);assert.equal(vt,5);
  if(conversionFailure){zero(out);mem.write(out,8,16);mem.write(out+8,mem.string('partial conversion'));return conversionFailure;}
  const value=number(source);if(!Number.isFinite(value)||[1,9,10,13].includes(mem.read(source,16)))return 0x80020005;
  zero(out);mem.write(out,5,16);fp(out+8,value);return 0;
 });
 cpu.hook('oleaut32.dll','VariantClear',1,([p])=>{if(mem.read(p,16)===8)mem.free(mem.read(p+8)-4);zero(p);return 0;});
 cpu.hook('oleaut32.dll','SysStringLen',1,([p])=>mem.bstr(p).length);
 return {cpu,mem,slot};
}
const numeric=[2,3,4,5,6,7,11,14,17];
for(const vt of numeric)for(const numerator of [0,1])test(`observed VarDiv overflow: subtype ${vt}, ${numerator}/0`,()=>{
 const {cpu,mem,slot}=harness(),left=slot(vt,numerator),right=slot(vt,0),out=slot(8,'old\0owner'),regions=mem.regions.length;
 assert.throws(()=>cpu.invoke(P+'divide',[out,left,right]),e=>e.number===(numerator||vt===14?11:6));
 assert.equal(mem.bstr(mem.read(out+8)),'old\0owner');assert.equal(mem.regions.length,regions);
});
for(const left of [0,2,3,4,5,6,7,8,11,14,17])test(`zero subtype ${left} over Empty preserves MS-VBAL distinction`,()=>{
 const {cpu,slot}=harness(),out=slot(),a=slot(left,left===8?'0':0),b=slot(0);
 assert.throws(()=>cpu.invoke(P+'divide',[out,a,b]),e=>e.number===([4,5,7,8,14].includes(left)?11:6));
});
for(const other of [0,2,3,4,5,6,7,8,11,14,17])for(const swap of [false,true])test(`Decimal zero effective type with ${other}, swap ${swap}`,()=>{
 const {cpu,slot}=harness(),a=slot(14),b=slot(other,other===8?'0':0),out=slot();
 assert.throws(()=>cpu.invoke(P+'divide',[out,...(swap?[b,a]:[a,b])]),e=>e.number===([5,6,7,8].includes(other)?6:11));
});
for(const sign of [0,-0])test('signed Double zero divisor '+Object.is(sign,-0),()=>{
 const {cpu,slot}=harness(),out=slot();assert.throws(()=>cpu.invoke(P+'divide',[out,slot(5,-1),slot(5,sign)]),e=>e.number===11);
});
for(const hr of [0x8002000a,0x80020012])test('zero over zero classification is independent of platform HRESULT '+hr,()=>{
 const {cpu,slot}=harness({hr});assert.throws(()=>cpu.invoke(P+'divide',[slot(),slot(3,0),slot(3,0)]),e=>e.number===6);
});
for(const [hr,error]of [[0x8007000e,7],[0x80020005,13],[0x8002000b,9]])test('unrelated API failure is never reclassified '+hr,()=>{
 const {cpu,slot}=harness({hr});assert.throws(()=>cpu.invoke(P+'divide',[slot(),slot(3,1),slot(3,0)]),e=>e.number===error);
 assert.ok(!cpu.calls.some(c=>c.name==='VariantChangeTypeEx'));
});
test('genuine overflow with a nonzero denominator remains error 6',()=>{
 const {cpu,slot}=harness();assert.throws(()=>cpu.invoke(P+'divide',[slot(),slot(5,1e308),slot(5,1e-308)]),e=>e.number===6);
});
test('classification conversion failure preserves the original arithmetic error and releases partial values',()=>{
 const {cpu,mem,slot}=harness({conversionFailure:0x80020005}),out=slot(8,'retained'),a=slot(8,'not numeric'),b=slot(3),regions=mem.regions.length;
 assert.throws(()=>cpu.invoke(P+'divide',[out,a,b]),e=>e.number===6);assert.equal(mem.regions.length,regions);assert.equal(mem.bstr(mem.read(out+8)),'retained');
});
test('success returns the original API result without secondary conversion',()=>{
 const {cpu,mem,slot}=harness({hr:0}),out=slot(8,'old');cpu.invoke(P+'divide',[out,slot(3,4),slot(3,2)]);
 assert.equal(mem.bstr(mem.read(out+8)),'partial result');assert.ok(!cpu.calls.some(c=>c.name==='VariantChangeTypeEx'));
});
test('unused division correction emits no code or coercion import',()=>{
 const image=new PE32Image(),x=new X86(image.section('.text',0x60000020),image);
 emitNativeVariantHelpers({x,nativeVariantsUsed:new Set(['copy'])});
 assert.ok(!x.s.labels.has(P+'divide-api'));assert.ok(!JSON.stringify([...image.imports]).includes('VariantChangeTypeEx'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {PE32Image} from '../src/native/pe32.js';
import {X86} from '../src/native/x86.js';
import {emitNativeVariantHelpers} from '../src/native/variant-kernels.js';
import {compileWin32} from '../src/native/compiler.js';
import {newProject} from '../src/project/model.js';
import {NativeX86Machine} from './support/native-x86-machine.mjs';
const P='native:variant:';
function harness(){
 const image=new PE32Image(),x=new X86(image.section('.text',0x60000020),image);
 emitNativeVariantHelpers({x,nativeVariantsUsed:new Set(['assign','change'])});
 for(const n of [5,6,7,9,10,11,13,91,94,449])x.label('error:'+n).value(n).jump('native:error:raise');
 x.label('native:error:raise').ret();const cpu=new NativeX86Machine(image.finish(P+'assign')),mem=cpu.memory,fault={change:0};
 const zero=p=>{for(let i=0;i<16;i+=4)mem.write(p+i,0);};
 const clear=p=>{if(mem.read(p,16)===8&&mem.read(p+8))mem.free(mem.read(p+8)-4);zero(p);return 0;};
 const value=p=>{let depth=0;while(mem.read(p,16)===0x400c){assert.ok(depth++<64);p=mem.read(p+8);}const vt=mem.read(p,16),base=vt&~0x4000,at=vt&0x4000?mem.read(p+8):p+8;
  return {vt:base,bits:mem.read(at,base===17?8:[2,11].includes(base)?16:32),high:[5,6,7].includes(base)?mem.read(at+4):0};};
 const copy=(out,source)=>{const v=value(source);zero(out);mem.write(out,v.vt,16);mem.write(out+8,v.vt===8?mem.string(mem.bstr(v.bits)):v.bits);mem.write(out+12,v.high);return 0;};
 const slot=(vt=0,bits=0,high=0)=>{const p=mem.alloc(16,'VARIANT');zero(p);mem.write(p,vt,16);mem.write(p+8,vt===8?mem.string(bits):bits);mem.write(p+12,high);return p;};
 cpu.hook('oleaut32.dll','VariantCopyInd',2,([out,source])=>copy(out,source));
 cpu.hook('oleaut32.dll','VariantClear',1,([p])=>clear(p));
 cpu.hook('oleaut32.dll','SysFreeString',1,([p])=>{if(p)mem.free(p-4);return 0;});
 cpu.hook('oleaut32.dll','SysStringLen',1,([p])=>p?mem.bstr(p).length:0);
 cpu.hook('oleaut32.dll','VariantChangeTypeEx',5,([out,source,lcid,flags,vt])=>{
  assert.equal(lcid,0x400);assert.equal(flags,2);const v=value(source);zero(out);
  if(fault.change){mem.write(out,8,16);mem.write(out+8,mem.string('failed conversion'));return fault.change;}
  mem.write(out,vt,16);mem.write(out+8,vt===8?mem.string(v.vt===8?mem.bstr(v.bits):String(v.bits)):vt===11?(v.bits?0xffff:0):v.bits);mem.write(out+12,v.high);return 0;
 });
 const call=(name,args)=>{const esp=cpu.get('esp');try{return cpu.invoke(P+name,args);}finally{cpu.set('esp',esp);}};
 return {cpu,mem,slot,call,fault,value};
}
for(const [vt,width]of [[17,1],[2,2],[11,2],[3,4],[4,4],[5,8],[6,8],[7,8]])test('typed ByRef Variant assignment preserves width and surrounding storage: '+vt,()=>{
 const h=harness(),buffer=h.mem.alloc(24,'guarded referent'),target=buffer+8,ref=h.slot(0x4000|vt,target),source=h.slot(vt,123,0x12345678);
 h.call('assign',[ref,source]);assert.equal(h.mem.read(target,width===1?8:width===2?16:32),vt===11?0xffff:123);
 if(width===8)assert.equal(h.mem.read(target+4),0x12345678);
 for(let i=0;i<24;i++)if(i<8||i>=8+width)assert.equal(h.mem.read(buffer+i,8),0xa5);
 assert.equal(h.mem.read(ref,16),0x4000|vt);assert.equal(h.mem.read(ref+8),target);
});
test('borrowed String writes transfer one counted BSTR and retain both descriptor and source ownership',()=>{
 const h=harness(),target=h.mem.alloc(4),old=h.mem.string('old'),source=h.slot(8,'new\0value');h.mem.write(target,old);
 const ref=h.slot(0x4008,target),regions=h.mem.regions.length;h.call('assign',[ref,source]);
 assert.equal(h.mem.bstr(h.mem.read(target)),'new\0value');assert.notEqual(h.mem.read(target),h.mem.read(source+8));assert.equal(h.mem.regions.length,regions);
 assert.equal(h.mem.read(ref,16),0x4008);assert.equal(h.mem.read(ref+8),target);
 h.call('assign',[ref,ref]);assert.equal(h.mem.bstr(h.mem.read(target)),'new\0value');assert.equal(h.mem.regions.length,regions);
});
test('nested ByRef Variant aliases update the live ultimate owner without replacing borrowed descriptors',()=>{
 const h=harness(),target=h.slot(8,'before'),a=h.slot(0x400c,target),b=h.slot(0x400c,a),value=h.slot(3,42);h.call('assign',[b,value]);
 assert.deepEqual(h.value(target),{vt:3,bits:42,high:0});assert.equal(h.mem.read(a,16),0x400c);assert.equal(h.mem.read(b+8),a);
});
for(const [hr,error]of [[0x8002000a,6],[0x8007000e,7],[0x80020005,13]])test('failed typed coercion keeps referent and descriptor and clears partial conversion '+hr,()=>{
 const h=harness(),p=h.mem.alloc(4),ref=h.slot(0x4003,p),source=h.slot(8,'invalid');h.mem.write(p,777);h.fault.change=hr;const regions=h.mem.regions.length;
 assert.throws(()=>h.call('assign',[ref,source]),e=>e.number===error);assert.equal(h.mem.read(p),777);assert.equal(h.mem.read(ref,16),0x4003);assert.equal(h.mem.regions.length,regions);
});
for(const [vt,bits,error]of [[1,0,94],[10,2042,13],[10,0x80020004,449]])test('implicit assignment rejects incompatible Variant subtype '+vt+'/'+bits,()=>{
 const h=harness(),p=h.mem.alloc(4),ref=h.slot(0x4003,p);h.mem.write(p,91);assert.throws(()=>h.call('assign',[ref,h.slot(vt,bits)]),e=>e.number===error);assert.equal(h.mem.read(p),91);
});
test('invalid borrowed tags and reference cycles fail without writes',()=>{
 const h=harness(),cycle=h.slot(0x400c),source=h.slot(3,7);h.mem.write(cycle+8,cycle);
 assert.throws(()=>h.call('assign',[cycle,source]),e=>e.number===13);assert.throws(()=>h.call('assign',[h.slot(0x4003,0),source]),e=>e.number===91);
 assert.throws(()=>h.call('assign',[h.slot(0x600c,123),source]),e=>e.number===13);
});
const project=code=>({...newProject('VariantReference'),startup:'Sub Main',modules:[{id:'m',name:'Entry',kind:'module',code}]});
for(const type of ['Byte','Integer','Long','Single','Double','Currency','Date','Boolean','String','Variant'])for(const optimization of [0,2])test(`compile typed ${type} actual for ByRef Variant at O${optimization}`,()=>{
 const p=project(`Sub Main()\nDim actual As ${type}\nWriteValue actual\nEnd Sub\nSub WriteValue(ByRef value As Variant)\nvalue=42\nEnd Sub`),before=JSON.stringify(p),r=compileWin32(p,{optimization});
 assert.equal(r.report.extraction,false);assert.equal(r.report.architecture,'x86');assert.equal(JSON.stringify(p),before);
});
test('incompatible typed ByRef and whole-array contracts remain diagnosed',()=>{
 assert.throws(()=>compileWin32(project('Sub Main()\nDim v As Variant\nWriteValue v\nEnd Sub\nSub WriteValue(ByRef value As Long)\nEnd Sub')),/exact declared type/);
 assert.throws(()=>compileWin32(project('Sub Main()\nDim v() As Long\nWriteValue v\nEnd Sub\nSub WriteValue(ByRef value As Variant)\nEnd Sub')),/Whole-array ByRef Variant/);
});

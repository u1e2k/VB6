import test from 'node:test';
import assert from 'node:assert/strict';
import {PE32Image} from '../src/native/pe32.js';
import {X86} from '../src/native/x86.js';
import {emitNativeStringArrayHelpers} from '../src/native/string-array-kernels.js';
import {NativeX86Machine} from './support/native-x86-machine.mjs';
const P='native:string-array:';
function harness(maxArrayBytes=1048576){
 const image=new PE32Image(),text=image.section('.text',0x60000020),x=new X86(text,image);
 emitNativeStringArrayHelpers({x,maxArrayBytes,nativeStringArraysUsed:new Set(['split','filter','join','snapshot','publish','element','lbound','ubound'])});
 for(const n of [5,7,9,10,13])x.label('error:'+n).value(n).jump('native:error:raise');
 x.label('native:array:check').test().branch('ns','checked').compare(0x8002000d).branch('e','error:10').compare(0x8002000b).branch('e','error:9').compare(0x8007000e).branch('e','error:7').jump('error:5').label('checked').ret();
 x.label('native:error:raise').ret();
 const machine=new NativeX86Machine(image.finish(P+'split')),mem=machine.memory,arrays=new Map(),faults={allocation:0,nls:false,destroy:0},counts={strings:0};
 const alloc=(source,n)=>{if(++counts.strings===faults.allocation)return 0;return mem.string(source?Array.from({length:n},(_,i)=>String.fromCharCode(mem.read(source+2*i,16))).join(''):'\0'.repeat(n));};
 machine.hook('oleaut32.dll','SysAllocStringLen',2,([source,n])=>alloc(source,n));
 function create(n,lower=0){
  const p=mem.alloc(24,'SAFEARRAY'),data=mem.alloc(Math.max(4,4*n),'SAFEARRAY.data');mem.region(p).bytes.fill(0);mem.region(data).bytes.fill(0);
  mem.write(p,1,16);mem.write(p+2,0x180,16);mem.write(p+4,4);mem.write(p+12,data);mem.write(p+16,n);mem.write(p+20,lower);arrays.set(p,{n,data,lower});return p;
 }
 function destroy(p){
  if(!p)return 0;assert.ok(arrays.has(p),'destroy an owned descriptor');if(mem.read(p+8)||p===faults.destroy)return 0x8002000d;
  const {n,data}=arrays.get(p);for(let i=0;i<n;i++){const bstr=mem.read(data+4*i);if(bstr)mem.free(bstr-4);}mem.free(data);mem.free(p);arrays.delete(p);return 0;
 }
 machine.hook('oleaut32.dll','SafeArrayCreate',3,([vt,rank,bounds])=>{assert.equal(vt,8);assert.equal(rank,1);return create(mem.read(bounds),mem.read(bounds+4)|0);});
 machine.hook('oleaut32.dll','SafeArrayDestroy',1,([p])=>destroy(p));
 machine.hook('oleaut32.dll','SafeArrayCopy',2,([p,out])=>{const {n,data,lower}=arrays.get(p),copy=create(n,lower);for(let i=0;i<n;i++){const src=mem.read(data+4*i),b=alloc(src,src?mem.read(src-4)/2:0);if(!b){destroy(copy);return 0x8007000e;}mem.write(arrays.get(copy).data+4*i,b);}mem.write(out,copy);return 0;});
 for(const upper of [false,true])machine.hook('oleaut32.dll',upper?'SafeArrayGetUBound':'SafeArrayGetLBound',3,([p,rank,out])=>{assert.equal(rank,1);const {n,lower}=arrays.get(p);mem.write(out,upper?lower+n-1:lower);return 0;});
 machine.hook('oleaut32.dll','SafeArrayGetElement',3,([p,index,out])=>{const {n,data,lower}=arrays.get(p),i=(mem.read(index)|0)-lower;if(i<0||i>=n)return 0x8002000b;const src=mem.read(data+4*i),b=alloc(src,src?mem.read(src-4)/2:0);if(!b)return 0x8007000e;mem.write(out,b);return 0;});
 machine.hook('kernel32.dll','CompareStringW',6,([locale,flags,a,an,b,bn])=>{assert.equal(locale,0x400);assert.equal(flags,1);if(faults.nls)return 0;const text=(p,n)=>Array.from({length:n},(_,i)=>String.fromCharCode(mem.read(p+2*i,16))).join('').toLowerCase();const left=text(a,an),right=text(b,bn);return left===right?2:left<right?1:3;});
 function array(values,lower=0){const p=create(values.length,lower),data=arrays.get(p).data;values.forEach((s,i)=>mem.write(data+4*i,s===null?0:mem.string(s)));return p;}
 const values=p=>{const {n,data}=arrays.get(p);return Array.from({length:n},(_,i)=>mem.bstr(mem.read(data+4*i)));};
 const call=(name,args=[])=>{const esp=machine.get('esp');try{return machine.invoke(P+name,args);}finally{machine.set('esp',esp);}};
 return {machine,mem,arrays,faults,counts,array,values,call};
}
for(const [source,delimiter,limit,expected] of [
 ['a,b,c',',',-1,['a','b','c']],['a,,b,',',',-1,['a','','b','']],
 ['',',',-1,[]],['x',',',0,[]],['abc','',-1,['abc']],['a,b,c',',',1,['a,b,c']],
 ['a,b,c',',',2,['a','b,c']],['a,b,c',',',9,['a','b','c']],
 ['aaa','aa',-1,['','a']],['a\0b\0','\0',-1,['a','b','']],['x\ud800y\ud800z','\ud800',-1,['x','y','z']]
])test('native Split '+JSON.stringify([source,delimiter,limit]),()=>{
 const h=harness(),p=h.call('split',[h.mem.string(source),h.mem.string(delimiter),limit,0]);assert.deepEqual(h.values(p),expected);assert.equal(h.mem.read(p+2,16)&0x10,0,'result remains resizable');h.call('release',[p]);assert.equal(h.arrays.size,0);
});
for(const values of [[],[''],['a','b','c'],['a\0b','\ud800',''],[null,'x',null]])for(const delimiter of ['',' ','--','\0'])test('native Join '+JSON.stringify([values,delimiter]),()=>{
 const h=harness(),source=h.array(values,-5),out=h.call('join',[source,h.mem.string(delimiter)]);assert.equal(h.mem.bstr(out),values.map(v=>v??'').join(delimiter));assert.deepEqual(h.values(source),values.map(v=>v??''));h.mem.free(out-4);h.call('release',[source]);
});
for(const [needle,include,mode,expected] of [['a',-1,0,['alpha','Beta']],['a',0,0,['','ALPHA']],['a',-1,1,['alpha','Beta','ALPHA']],['',-1,0,['alpha','','Beta','ALPHA']],['',0,0,[]],['none',-1,0,[]]])test('native Filter '+JSON.stringify([needle,include,mode]),()=>{
 const h=harness(),input=h.array(['alpha','','Beta','ALPHA'],10),out=h.call('filter',[input,h.mem.string(needle),include,mode]);assert.deepEqual(h.values(out),expected);assert.equal(h.arrays.get(out).lower,0);h.call('release',[out]);assert.deepEqual(h.values(input),['alpha','','Beta','ALPHA']);
});
test('binary and text Split differ without treating NUL as a terminator',()=>{
 const h=harness(),s=h.mem.string('aXbxc\0X'),d=h.mem.string('x');assert.deepEqual(h.values(h.call('split',[s,d,-1,0])),['aXb','c\0X']);assert.deepEqual(h.values(h.call('split',[s,d,-1,1])),['a','b','c\0','']);
});
test('snapshot deep copies BSTR elements and keeps source lower bounds',()=>{
 const h=harness(),input=h.array(['a\0b',''],-4),copy=h.call('snapshot',[input]);assert.deepEqual(h.values(copy),h.values(input));assert.notEqual(h.mem.read(h.arrays.get(copy).data),h.mem.read(h.arrays.get(input).data));assert.equal(h.arrays.get(copy).lower,-4);h.call('release',[input]);assert.deepEqual(h.values(copy),['a\0b','']);
});
test('publish transfers ownership and empties its temporary slot',()=>{
 const h=harness(),old=h.array(['old']),fresh=h.array(['new']),slot=h.mem.alloc(4),owner=h.mem.alloc(4);h.mem.write(slot,old);h.mem.write(owner,fresh);h.call('publish',[slot,owner]);assert.equal(h.mem.read(slot),fresh);assert.equal(h.mem.read(owner),0);assert.ok(!h.arrays.has(old));assert.deepEqual(h.values(fresh),['new']);
});
for(const kind of ['locked','fixed','destroy-failed'])test('publish is transactional for '+kind+' destination',()=>{
 const h=harness(),old=h.array(['old']),fresh=h.array(['new']),slot=h.mem.alloc(4),owner=h.mem.alloc(4);h.mem.write(slot,old);h.mem.write(owner,fresh);
 if(kind==='locked')h.mem.write(old+8,1);else if(kind==='fixed')h.mem.write(old+2,0x190,16);else h.faults.destroy=old;
 assert.throws(()=>h.call('publish',[slot,owner]),e=>e.number===10);assert.equal(h.mem.read(slot),old);assert.equal(h.mem.read(owner),fresh);assert.deepEqual(h.values(old),['old']);
});
for(const operation of ['split','filter'])for(const at of [1,2,3])test(operation+' partial BSTR allocation '+at+' releases all result memory',()=>{
 const h=harness(),input=operation==='split'?h.mem.string('a,b,c'):h.array(['a','ab','abc']),needle=h.mem.string(operation==='split'?',':'a'),regions=h.mem.regions.length;h.faults.allocation=at;
 assert.throws(()=>h.call(operation,[input,needle,-1,0]),e=>e.number===7);assert.equal(h.mem.regions.length,regions,'no partial descriptor/BSTR leak');
});
for(const operation of ['split','filter'])test(operation+' NLS failure preserves inputs without result leaks',()=>{
 const h=harness(),input=operation==='split'?h.mem.string('abc'):h.array(['abc']),needle=h.mem.string('x'),regions=h.mem.regions.length;h.faults.nls=true;
 assert.throws(()=>h.call(operation,[input,needle,-1,1]),e=>e.number===5);assert.equal(h.mem.regions.length,regions);
});
test('count and string budgets reject results before allocating',()=>{
 const h=harness(8),s=h.mem.string('a,b,c'),d=h.mem.string(','),regions=h.mem.regions.length;assert.throws(()=>h.call('split',[s,d,-1,0]),e=>e.number===7);assert.equal(h.mem.regions.length,regions);
 const a=h.array(['a']),text=h.mem.string('x');h.mem.write(text-4,2*1048577);assert.throws(()=>h.call('join',[a,text]),e=>e.number===7);
});
test('empty bounds, copied elements, and bounds errors use real helper ABIs',()=>{
 const h=harness(),empty=h.array([]),a=h.array(['a\0b','c'],4);assert.equal(h.call('lbound',[empty,1]),0);assert.equal(h.call('ubound',[empty,1])|0,-1);assert.equal(h.mem.bstr(h.call('element',[a,4])),'a\0b');assert.throws(()=>h.call('element',[a,3]),e=>e.number===9);assert.throws(()=>h.call('lbound',[empty,2]),e=>e.number===9);
});
for(const name of ['split','filter'])test(name+' rejects invalid comparison and limit',()=>{
 const h=harness(),input=name==='split'?h.mem.string('x'):h.array(['x']),d=h.mem.string(',');assert.throws(()=>h.call(name,[input,d,-1,2]),e=>e.number===5);if(name==='split')assert.throws(()=>h.call(name,[input,d,-2,0]),e=>e.number===5);
});

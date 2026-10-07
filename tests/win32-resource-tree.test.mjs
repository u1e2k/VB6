import test from 'node:test';
import assert from 'node:assert/strict';
import {PE32Image,BinarySection} from '../src/native/pe32.js';
import {writeNativeResources} from '../src/native/pe-resources.js';
function build(entries){const pe=new PE32Image(),code=pe.section('.text',0x60000020);code.label('start').emit(0xff,0x25).reference(pe.import('kernel32.dll','ExitProcess'));pe.manifest('<assembly/>',entries);return pe.finish('start');}
function read(result){const r=result.sections.find(s=>s.name==='.rsrc'),v=new DataView(result.bytes.buffer),base=r.offset,seen=new Set(),output=[];const u32=at=>v.getUint32(base+at,true),u16=at=>v.getUint16(base+at,true);
 function walk(at,path){assert.ok(!seen.has(at));seen.add(at);const count=u16(at+12)+u16(at+14),keys=[];
  for(let i=0;i<count;i++){let key=u32(at+16+i*8),value=u32(at+20+i*8);if(key&0x80000000){const text=key&0x7fffffff;key=Array.from({length:u16(text)},(_,j)=>String.fromCharCode(u16(text+2+j*2))).join('');}keys.push(key);
   if(value&0x80000000)walk(value&0x7fffffff,[...path,key]);else{const data=u32(value)-r.rva,size=u32(value+4);assert.ok(data>=0&&data+size<=r.size);output.push({path:[...path,key],bytes:Array.from(result.bytes.slice(base+data,base+data+size)),codepage:u32(value+8)});}
  }return keys;
 }const keys=walk(0,[]);return {output,keys};}
test('linked PE resource directory preserves named/ordinal identities, language leaves and exact data',()=>{
 const entries=[{type:10,name:'β/name',language:1045,bytes:new Uint8Array([1,2,3])},{type:'CUSTOM',name:9,bytes:new Uint8Array([4])},{type:10,name:'β/name',language:0,bytes:new Uint8Array([5])},{type:3,name:101,bytes:new Uint8Array([6,7])}];
 const result=read(build(entries));assert.deepEqual(result.keys,['CUSTOM',3,10,24]);assert.equal(result.output.length,5);
 for(const e of entries)assert.ok(result.output.some(o=>JSON.stringify(o.path)===JSON.stringify([e.type,e.name,e.language??0])&&JSON.stringify(o.bytes)===JSON.stringify([...e.bytes])));
 assert.deepEqual(build(entries).bytes,build([...entries].reverse()).bytes);
});
test('PE resources reject duplicates, reserved application manifests, invalid IDs and unbounded data',()=>{
 const e={type:10,name:1,bytes:new Uint8Array([1])};assert.throws(()=>build([e,e]),/Duplicate/);assert.throws(()=>build([{...e,type:24,name:1}]),/reserved/);
 for(const bad of [{...e,type:-1},{...e,name:'x\0y'},{...e,language:65536},{...e,bytes:[1]}])assert.throws(()=>writeNativeResources(new BinarySection('.rsrc',0),[bad]));
});

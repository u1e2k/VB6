import test from 'node:test';import assert from 'node:assert/strict';
import {gridKernel} from './support/native-grid-kernel.mjs';import {NATIVE_GRID_FIELDS as F} from '../src/native/control-grid-contract.js';
const error=n=>e=>e.number===n;
test('private grid kernel owns per-control counted cells, dimensions and row insertion/removal',async()=>{
 const k=await gridKernel();try{
 await k.initialize(0,3,3);await k.initialize(1,1,2);
 await k.put(0,0,0,'header');await k.put(0,1,1,'a\0b日本');await k.put(1,0,0,'other');
 assert.equal(await k.text(0,1,1),'a\0b日本');assert.equal(await k.text(1,0,0),'other');
 await k.call(0,'setindexed',F.widths,1,2000);await k.call(0,'setindexed',F.rowdata,1,91);
 await k.call(0,'additem','first\tsecond\tthird',1);assert.equal(await k.get(0,'rows'),4);assert.equal(await k.text(0,1,2),'third');assert.equal(await k.text(0,2,1),'a\0b日本');assert.equal(await k.call(0,'getindexed',F.rowdata,2),91);
 await k.call(0,'removeitem',0);assert.equal(await k.text(0,1,1),'a\0b日本');assert.equal(await k.get(0,'rows'),3);assert.equal(await k.call(0,'getindexed',F.widths,1),2000);
 await k.set(0,'cols',2);assert.equal(await k.text(0,1,1),'a\0b日本');await k.set(0,'cols',4);assert.equal(await k.text(0,1,3),'');await k.call(0,'clear');assert.equal(await k.text(0,1,1),'');assert.equal(await k.get(0,'rows'),3);
 }finally{await k.close();}
});
test('grid Resize failure frees all staging buffers and retains the previous schema/cells',async()=>{
 const k=await gridKernel(1);try{await k.initialize(0,2,2);await k.put(0,1,1,'preserved');const before=[...k.buffers.keys()];
 for(let fail=0;fail<6;fail++){k.failAfter(fail);await assert.rejects(k.set(0,'cols',3),error(7));k.failAfter(Infinity);assert.equal(await k.get(0,'cols'),2);assert.equal(await k.text(0,1,1),'preserved');assert.deepEqual([...k.buffers.keys()],before);}
 await assert.rejects(k.call(0,'resize',100001,10000,0,-1),error(7));
 }finally{k.failAfter(Infinity);await k.close();}
});
test('grid Clip supports rectangular/reversed selections, CRLF/LF and embedded NUL without leaking into neighbors',async()=>{
 const k=await gridKernel(1);try{await k.initialize(0,4,4);await k.set(0,'row',1);await k.set(0,'col',1);await k.call(0,'setclip','A\tB\r\nC\0D\tE\nF\tG');await k.set(0,'rowsel',3);await k.set(0,'colsel',2);
 assert.equal(await k.call(0,'clip'),'A\tB\r\nC\0D\tE\r\nF\tG');assert.equal(await k.text(0,1,0),'');
 await k.set(0,'row',3);await k.set(0,'col',2);await k.set(0,'rowsel',1);await k.set(0,'colsel',1);assert.equal(await k.call(0,'clip'),'A\tB\r\nC\0D\tE\r\nF\tG');
 await k.call(0,'formatstring','<Left|^Center|>Right|Last');assert.equal(await k.text(0,0,1),'Center');assert.equal(await k.call(0,'getindexed',F.alignment,1),2);assert.equal(await k.call(0,'getindexed',F.alignment,2),1);
 }finally{await k.close();}
});
test('grid virtualization paints visible fixed/scrolled cells, skips hidden dimensions and preserves native selection flags',async()=>{
 const k=await gridKernel(1);try{await k.initialize(0,400,8);await k.set(0,'fixedrows',1);await k.set(0,'fixedcols',1);await k.set(0,'toprow',100);await k.set(0,'leftcol',3);await k.call(0,'setindexed',F.widths,3,0);await k.put(0,100,4,'visible');await k.set(0,'row',100);await k.set(0,'col',4);
 await k.call(0,'paint',7,2400,945);assert.ok(k.draws.length<=9);assert.ok(k.draws.some(d=>d.text==='visible'&&(d.flags&2)));assert.ok(k.draws.every(d=>d.x<2400&&d.y<945&&d.width>0));assert.equal(k.draws[0].flags&1,1);
 await k.call(0,'mouseselect',1201,316,0,8);assert.equal(await k.get(0,'row'),100);assert.equal(await k.get(0,'col'),4);assert.ok(k.notices.some(n=>n.flags&8));
 await k.call(0,'scroll',1,5,350);assert.equal(await k.get(0,'toprow'),350);await k.call(0,'scroll',1,7,0);assert.equal(await k.get(0,'toprow'),399);
 }finally{await k.close();}
});
test('stale grid receivers are rejected after disposal or same-HWND recreation',async()=>{
 const k=await gridKernel(1);try{await k.initialize(0,2,2,42);const epoch=await k.raw('stamp',0);await k.raw('dispose',0);await assert.rejects(k.raw('settext',0,42,epoch,0,0,'stale'),error(91));await k.initialize(0,2,2,42);await assert.rejects(k.raw('settext',0,42,epoch,0,0,'stale'),error(91));assert.equal(await k.text(0,0,0),'');
 }finally{await k.close();}
});
test('empty/invalid grid dimensions and indexed members fail with explicit VB errors',async()=>{
 const k=await gridKernel(1);try{await k.initialize(0,0,3);assert.equal(await k.call(0,'clip'),'');await assert.rejects(k.text(0,0,0),error(381));await k.call(0,'additem','x\ty',-1);assert.equal(await k.text(0,0,0),'x');await assert.rejects(k.call(0,'setindexed',F.widths,0,-1),error(380));await assert.rejects(k.call(0,'removeitem',5),error(381));await k.call(0,'removeitem',0);assert.equal(await k.get(0,'rows'),0);
 }finally{await k.close();}
});
test('grid inserts and rectangular paste are failure-atomic when BSTR copying fails',async()=>{
 const k=await gridKernel(1);try{await k.initialize(0,2,2);await k.put(0,0,0,'old');const owners=[...k.buffers.keys()];
 k.failWrites(4);await assert.rejects(k.call(0,'additem','new\trow',1),error(7));k.failWrites(Infinity);assert.equal(await k.get(0,'rows'),2);assert.equal(await k.text(0,0,0),'old');assert.deepEqual([...k.buffers.keys()],owners);
 k.failWrites(1);await assert.rejects(k.call(0,'setclip','first\tsecond'),error(7));k.failWrites(Infinity);assert.equal(await k.text(0,0,0),'old');assert.equal(await k.text(0,0,1),'');assert.deepEqual([...k.buffers.keys()],owners);
 }finally{k.failWrites(Infinity);await k.close();}
});
test('grid keyboard scrolls a selected cell into view using variable sizes and retains partial wheel deltas',async()=>{
 const k=await gridKernel(1);try{await k.initialize(0,50,10);await k.set(0,'fixedrows',1);await k.set(0,'fixedcols',1);await k.call(0,'paint',1,3600,1260);
 await k.call(0,'selectcell',20,8,0,0);assert.equal(await k.get(0,'toprow'),18);assert.equal(await k.get(0,'leftcol'),7);
 await k.call(0,'wheel',40);assert.equal(await k.get(0,'toprow'),18);await k.call(0,'wheel',80);assert.equal(await k.get(0,'toprow'),15);
 await k.call(0,'keymove',40,0);assert.equal(await k.get(0,'row'),21);assert.equal(await k.get(0,'toprow'),19);
 }finally{await k.close();}
});
test('deterministic randomized matrix edits agree with an independent JavaScript reference',async()=>{
 const k=await gridKernel(1);let state=0x61473592;const random=n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;};
 try{let rows=4,cols=3,reference=Array.from({length:rows},()=>Array(cols).fill(''));await k.initialize(0,rows,cols);
 for(let i=0;i<120;i++){
  const op=random(4);
  if(op===0&&rows){const r=random(rows),c=random(cols),v=`${i}\0${String.fromCodePoint(0x1f600+random(50))}`;await k.put(0,r,c,v);reference[r][c]=v;}
  if(op===1){const newCols=1+random(6);await k.set(0,'cols',newCols);reference=reference.map(a=>Array.from({length:newCols},(_,j)=>a[j]??''));cols=newCols;}
  if(op===2){const at=random(rows+1),value=['a'+i,'b'+i].join('\t');await k.call(0,'additem',value,at);reference.splice(at,0,Array.from({length:cols},(_,c)=>value.split('\t')[c]??''));rows++;}
  if(op===3&&rows){const at=random(rows);await k.call(0,'removeitem',at);reference.splice(at,1);rows--;}
  assert.equal(await k.get(0,'rows'),rows);assert.equal(await k.get(0,'cols'),cols);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)assert.equal(await k.text(0,r,c),reference[r][c]);
 }
 }finally{await k.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {PE32Image,PE32_BASE} from '../src/native/pe32.js';
import {X86} from '../src/native/x86.js';
import {optimizeNativeSections} from '../src/native/optimizer.js';
import {threadNativeBranches} from '../src/native/branch-threading.js';
import {pruneNativeImports} from '../src/native/import-reachability.js';
const setup=()=>{const image=new PE32Image(),s=image.section('.text',0x60000020),x=new X86(s,image);image.import('kernel32.dll','ExitProcess');return {image,s,x};};
const read=(r,label)=>{const sec=r.sections.find(s=>r.symbols[label]>=s.rva&&r.symbols[label]<s.rva+s.size);return new DataView(r.bytes.buffer).getUint32(sec.offset+r.symbols[label]-sec.rva,true);};
test('O2 jump-chain forwarding preserves calls, labels and data addresses',()=>{
 const {image,s,x}=setup(),data=image.section('.data',0xc0000040);
 x.label('entry').branch('e','a').nop().label('a').jump('b').nop().label('b').jump('done').nop().label('done').ret().label('caller').call('a').ret();
 data.label('address').reference('a');const r=image.finish('entry',{optimization:2});
 assert.equal(r.optimization.branchesThreaded,2);assert.equal(s.fixups.find(f=>f.offset===1).label,'done');
 assert.equal(s.fixups.find(f=>f.kind==='rel'&&!f.branch).label,'a');
 assert.equal(read(r,'address'),PE32_BASE+r.symbols.a);assert.ok(r.symbols.b<r.symbols.done);
});
test('cycles, external targets and nonzero addends are not threaded',()=>{
 const {s,x}=setup();x.label('entry').jump('a').label('a').jump('b').label('b').jump('a');
 const plans=s.fixups.map(f=>({fixup:f,start:f.offset-1})),before=structuredClone(s.fixups);
 assert.equal(threadNativeBranches(s,plans),0);assert.deepEqual(s.fixups,before);
 const other=setup();other.x.label('entry').jump('a').label('a').jump('external');
 assert.equal(optimizeNativeSections([other.s],2).branchesThreaded,0);
 const third=setup();third.x.label('entry').jump('a').nop().label('a').jump('end').nop().label('end').ret();third.s.fixups[0].addend=1;
 assert.equal(optimizeNativeSections([third.s],2).branchesThreaded,0);
});
test('raw JMP and side-effecting intermediary blocks are not skipped',()=>{
 const {s,x}=setup();x.label('entry').jump('a').nop().label('a').emit(0xe9);s.reference('b','rel');x.label('b').inc('eax').jump('done').label('done').ret();
 assert.equal(optimizeNativeSections([s],2).branchesThreaded,0);
});
test('O0/O1 leave threading disabled',()=>{
 for(const level of [0,1]){const {s,x}=setup();x.label('entry').jump('a').label('a').jump('b').label('b').ret();assert.equal(optimizeNativeSections([s],level).branchesThreaded,0);}
});
test('unused import pruning is opt-in and keeps exact name/ordinal relocations',()=>{
 const {image,x}=setup();image.import('unused.dll','Missing');const ordinal=image.import('ordinal.dll',7);
 const data=image.section('.data',0xc0000040);data.label('ordinal-pointer').reference(ordinal);
 x.label('entry').api('kernel32.dll','ExitProcess',[0]);
 const r=image.finish('entry',{optimization:2,pruneUnusedImports:true});
 assert.equal(r.optimization.unusedImportsRemoved,1);assert.deepEqual(r.optimization.removedImports,['unused.dll!Missing']);
 assert.equal(read(r,'ordinal-pointer'),PE32_BASE+r.symbols[ordinal]);assert.equal(r.imports.length,2);
 const keep=setup();keep.image.import('unused.dll','Missing');keep.x.label('entry').ret();assert.equal(keep.image.finish('entry',{optimization:2}).imports.length,2);
});
test('addressing import-table layout keeps all entries including indirect neighbors',()=>{
 for(const target of ['iat:kernel32.dll!ExitProcess','iat:kernel32.dll','iat-start','imports','hint:iat:kernel32.dll!ExitProcess']){
  const {image,s}=setup();image.import('unused.dll','Missing');s.reference(target,'va',target.includes('!ExitProcess')?4:0);
  const report=pruneNativeImports(image.imports,image.sections);assert.equal(report.importTableAddressed,true);assert.equal(image.imports.size,2);
 }
});
test('a fully unreferenced import table has zero PE directories',()=>{
 const {image,x}=setup();x.label('entry').mov('eax',0).ret();const r=image.finish('entry',{optimization:2,pruneUnusedImports:true}),v=new DataView(r.bytes.buffer);
 assert.deepEqual(r.imports,[]);for(const index of [1,12]){assert.equal(v.getUint32(0x98+96+index*8,true),0);assert.equal(v.getUint32(0x98+100+index*8,true),0);}
});
test('procedure pruning enables import pruning and an explicit false retains imports',()=>{
 for(const keep of [false,true]){
  const {image,x}=setup();image.import('unused.dll','Missing');x.label('entry').api('kernel32.dll','ExitProcess',[0]);
  const r=image.finish('entry',{optimization:2,pruneUnusedProcedures:true,...(keep?{pruneUnusedImports:false}:{})});assert.equal(r.imports.length,keep?2:1);
 }
});
for(const options of [{pruneUnusedImports:'yes',optimization:2},{pruneUnusedImports:true,optimization:1},{pruneUnusedProcedures:1,optimization:2}])test('pruning rejects invalid options before altering imports '+JSON.stringify(options),()=>{
 const {image,x}=setup();x.label('entry').ret();assert.throws(()=>image.finish('entry',options),/pruning/);assert.equal(image.imports.size,1);assert.equal(image.sections.length,1);
});

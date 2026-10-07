import test from 'node:test';
import assert from 'node:assert/strict';
import {compileWin32} from '../src/native/compiler.js';
import {BinarySection} from '../src/native/pe32.js';
import {X86} from '../src/native/x86.js';
import {emitNativeCountedEqual} from '../src/native/string-kernels.js';
import {speedSizeFixture,compactAssemblerFixture} from '../tools/win32-speed-size-fixtures.mjs';
for(const level of [0,1,2])test('speed/size contracts lower at O'+level,()=>{
 const fixture=speedSizeFixture(),r=compileWin32(fixture.project,{optimization:level});
 assert.ok(fixture.checks.length>=130);assert.equal(r.report.optimization.level,level);
 assert.ok(r.report.imports.some(i=>i.dll==='version.dll'));
 if(level===2)assert.ok(r.report.optimization.constantsPropagated>=5);
 const a=compactAssemblerFixture(level);assert.ok(a.checks.length>=50);assert.equal(a.bytes[0],77);
});
test('pruned compiler report removes an actual procedure-only Win32 import',()=>{
 const fixture=speedSizeFixture(),r=compileWin32(fixture.project,{optimization:2,pruneUnusedProcedures:true});
 assert.ok(r.report.optimization.removedImports.includes('version.dll!GetFileVersionInfoSizeW'));
 assert.ok(!r.report.imports.some(i=>i.dll==='version.dll'));
 assert.ok(r.report.sourceMap.some(s=>s.optimizedOut));
});
test('counted kernel rejects invalid width without emitting partial instructions',()=>{
 const s=new BinarySection('.text',0x60000020),x=new X86(s,null);assert.throws(()=>emitNativeCountedEqual(x,64),/width/);assert.equal(s.length,0);assert.equal(s.labels.size,0);
});

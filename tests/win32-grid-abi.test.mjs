import test from 'node:test';import assert from 'node:assert/strict';import {emittedGrid} from './support/native-grid-abi.mjs';
for(const optimization of [0,1,2])test(`actual emitted grid matrix code preserves BSTRs, indexes and callee-save registers O${optimization}`,t=>{
 const {vm,m,result,arrays,invoke,args}=emittedGrid(t,'Dim sample As String, width As Long, count As Long\nG.TextMatrix(1,2)="cell" & vbNullChar & "日本"\nG.ColWidth(2)=1800\nG.Rows=4\nsample=G.TextMatrix(1,2)\nwidth=G.ColWidth(2)\ncount=G.Rows',optimization);
 vm.invoke('proc:Form1:Form_Load');
 const h=invoke('GetText',[...args,1,2]);assert.equal(m.bstr(h),'cell\0日本');m.free(h-4);
 assert.equal(invoke('GetIndexed',[...args,15,2]),1800);assert.equal(invoke('GetField',[...args,2]),4);
 invoke('Dispose',[0]);assert.equal(arrays.size,0,'all owned grid SAFEARRAYs are released');
 assert.ok(!result.report.controls.runtime.grids.procedures.includes('clip'),'unused Clip code is not emitted');
});

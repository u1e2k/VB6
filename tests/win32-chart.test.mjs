import test from 'node:test';import assert from 'node:assert/strict';import {newProject,createControl} from '../src/project/model.js';import {compileWin32} from '../src/native/compiler.js';import {nativeChartSeed} from '../src/native/control-chart.js';import {chartKernel} from './support/native-chart-kernel.mjs';
const project=(code='',props={})=>{const p=newProject('ChartNative'),c=createControl('MSChart','Plot');Object.assign(c.properties,props);p.modules[0].form.controls=[c];p.modules[0].code='Private Sub Form_Load()\n'+code+'\nEnd Sub';return p;};
for(const optimization of [0,1,2])test(`native chart storage and native drawing are integrated at O${optimization}`,()=>{
 const p=project('Dim v As Double, text As String\nPlot.RowCount=4\nPlot.ColumnCount=2\nPlot.Row=2\nPlot.Column=2\nPlot.Data=-12.5\nv=Plot.Data\nPlot.RowLabel="日本"\ntext=Plot.RowLabel\nPlot.ColumnLabel="Series"\nPlot.ChartType=3');const before=JSON.stringify(p),r=compileWin32(p,{optimization});assert.equal(JSON.stringify(p),before);assert.deepEqual(r.bytes,compileWin32(p,{optimization}).bytes);assert.equal(r.report.controls.runtime.charts.instances,1);assert.equal(r.report.controls.runtime.grids,null);
 for(const symbol of ['SafeArrayCreateVector','SafeArrayPutElement','SafeArrayGetElement','MoveToEx','LineTo','FillRect'])assert.ok(r.report.imports.some(i=>i.symbol===symbol));assert.ok(r.bytes.length<65536);
});
test('chart seeds enforce finite data, used dimensions and honest plot-type boundaries',()=>{for(const props of [{ChartType:2},{RowCount:-1},{ColumnCount:10001},{RowCount:10000,ColumnCount:10000},{GridData:[[Infinity]]}])assert.throws(()=>nativeChartSeed(props));assert.equal(nativeChartSeed({}).values.length,5);});
test('chart numerical storage preserves doubles and failure-atomic resize/labels',async()=>{
 const k=await chartKernel();await k.init(0,2,2);await k.init(1,1,1);await k.set(0,'row',2);await k.set(0,'col',2);await k.call(0,'setdata',-123.125);await k.call(0,'setlabel',7,'日本\0label');
 for(let fail=0;fail<3;fail++){k.failAfter(fail);await assert.rejects(k.set(0,'rows',4),e=>e.number===7);assert.equal(k.buffers.size,6);assert.equal(await k.get(0,'rows'),2);assert.equal(await k.call(0,'getdata'),-123.125);}
 k.failAfter(Infinity);await k.set(0,'rows',4);assert.equal(await k.call(0,'getdata'),-123.125);assert.equal(await k.call(0,'getlabel',7),'日本\0label');assert.equal(await k.call(1,'getdata'),0);
 k.failWrites(0);await assert.rejects(k.set(0,'cols',3),e=>e.number===7);k.failWrites(Infinity);assert.equal(await k.get(0,'cols'),2);assert.equal(k.buffers.size,6);await k.close();
});
test('chart plot handles positive/negative/extreme finite values without overflowing coordinates',async()=>{
 const k=await chartKernel();await k.init(0,3,1);for(const [i,value]of [-Number.MAX_VALUE,0,Number.MAX_VALUE].entries()){await k.set(0,'row',i+1);await k.call(0,'setdata',value);}
 await k.call(0,'paint',123,400,200);assert.ok(k.draws.length>10);for(const d of k.draws)for(const n of d.slice(3,7))assert.ok(Number.isFinite(n)&&Math.abs(n)<1000);
 assert.ok(k.draws.some(d=>d[2]===1&&d[4]>18));await k.set(0,'charttype',3);k.draws.length=0;await k.call(0,'paint',123,400,200);assert.equal(k.draws.filter(d=>d[2]===1).length,3);await k.close();
});
test('empty charts and stale receiver stamps are checked',async()=>{const k=await chartKernel();await k.init(0,0,0);await assert.rejects(k.call(0,'getdata'),e=>e.number===381);await k.init(0,1,1);const epoch=await k.raw('stamp',0);await k.init(0,1,1);await assert.rejects(k.raw('getdata',0,100,epoch),e=>e.number===91);await k.close();});

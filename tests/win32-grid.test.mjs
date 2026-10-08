import test from 'node:test';import assert from 'node:assert/strict';
import {newProject,createControl} from '../src/project/model.js';import {compileWin32} from '../src/native/compiler.js';
const project=(type,code='',props={})=>{const p=newProject('NativeGrid');const c=createControl(type,'Grid');Object.assign(c.properties,props);p.modules[0].form.controls=[c];p.modules[0].code=`Private Sub Form_Load()\n${code}\nEnd Sub`;return p;};
for(const type of ['MSFlexGrid','MSHFlexGrid','DataGrid'])for(const optimization of [0,1,2])test(`native ${type} emits real private storage/GDI/input at O${optimization}`,()=>{
 const p=project(type,`Dim v As String, n As Long
Grid.TextMatrix(1,1)="Hello"
v=Grid.TextMatrix(1,1)
Grid.Rows=10
Grid.Cols=4
Grid.ColWidth(-1)=1200
Grid.RowHeight(1)=420
n=Grid.RowHeight(1)
Grid.RowData(1)=35
n=Grid.RowData(1)
Grid.ColData(2)=16
Grid.ColAlignment(1)=2
Grid.Row=1
Grid.Col=1
Grid.RowSel=2
Grid.ColSel=3
Grid.Clip="a" & vbTab & "b" & vbCrLf & "c"
v=Grid.Clip
Grid.FormatString="<Name|^Count|>Price|Last"
v=Grid.FormatString
Grid.AddItem "more" & vbTab & "data",2
Grid.RemoveItem 2
Grid.Redraw=False
Grid.Clear
Grid.Redraw=True`,{GridData:[['Header','Title'],['a','b']]});const before=JSON.stringify(p),r=compileWin32(p,{optimization});
 assert.equal(JSON.stringify(p),before);assert.deepEqual(compileWin32(p,{optimization}).bytes,r.bytes);assert.equal(r.report.controls.runtime.grids.instances,1);
 for(const name of ['SafeArrayCreateVector','SafeArrayPutElement','DrawTextW','BeginPaint','EndPaint','GetScrollInfo'])assert.ok(r.report.imports.some(i=>i.symbol===name),name);
 assert.ok(r.report.sourceMap.every(e=>!e.source.startsWith('VB6NativeGrid')));assert.equal(r.report.extraction,false);
});
test('projects without grids omit every grid procedure and grid-only GDI helper',()=>{const r=compileWin32(project('CommandButton'));assert.equal(r.report.controls.runtime.grids,null);assert.ok(!r.report.imports.some(i=>i.symbol==='SafeArrayCreateVector'));});
test('grid native member arity, scalar schema and data-provider boundaries remain explicit',()=>{
 for(const source of ['Grid.TextMatrix(1)="x"','Grid.ColWidth(0,1)=4','Grid.RemoveItem','Grid.ColWidth(0,1)','Grid.FakeProperty=1'])assert.throws(()=>compileWin32(project('MSFlexGrid',source)));
 assert.throws(()=>compileWin32(project('DataGrid','',{DataSource:'Connection1'})),/data runtime/);
});
test('indexed nested grid With receivers retain their original HWND and use private indexes',()=>{
 const p=project('MSFlexGrid','Dim i As Long, text As String\ni=2\nWith Grid(i)\n.TextMatrix(1,1)="one"\ni=0\ntext=.TextMatrix(1,1)\nEnd With');p.settings.anchoring=true;p.modules[0].form.controls[0].properties.Index=0;const b=createControl('MSFlexGrid','Grid');b.properties.Index=2;b.properties.Anchor=15;p.modules[0].form.controls.push(b);const r=compileWin32(p);assert.equal(r.report.controls.runtime.grids.instances,2);assert.equal(r.report.layout.nodes,3);
});

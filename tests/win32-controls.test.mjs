import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,createControl} from '../src/project/model.js';
import {compileWin32} from '../src/native/compiler.js';
import {NATIVE_CONTROL_CATALOG} from '../src/native/control-catalog.js';
import {nativeTreePlan} from '../src/native/control-collections.js';
import {nativeLayoutSeed} from '../src/native/layout-seed.js';
import {nativeControlFixtures} from '../tools/win32-control-fixtures.mjs';
function project(type,properties={},code=''){
  const p=newProject('NativeControlRegression');p.modules[0].code=code;
  if(type){const control=createControl(type,'Control1');Object.assign(control.properties,properties);p.modules[0].form.controls=[control];}
  return p;
}
function imports(result){return new Set(result.report.imports.map(i=>i.dll+':'+i.symbol));}
for(const type of Object.keys(NATIVE_CONTROL_CATALOG))test('AOT emits an actual deterministic PE32 for '+type,()=>{
  const p=project(type),before=JSON.stringify(p),a=compileWin32(p),b=compileWin32(p);
  assert.equal(a.bytes[0],0x4d);assert.equal(a.bytes[1],0x5a);assert.equal(a.report.extraction,false);
  assert.deepEqual(a.bytes,b.bytes);assert.equal(JSON.stringify(p),before);assert.ok(a.bytes.length<64*1024);
  const text=Buffer.from(a.bytes),descriptor=NATIVE_CONTROL_CATALOG[type];
  if(descriptor.className)assert.ok(text.includes(Buffer.from(descriptor.className+'\0','utf16le')));
  assert.equal(imports(a).has('comctl32.dll:InitCommonControlsEx'),!!descriptor.commonControls);
  assert.equal(imports(a).has('kernel32.dll:LoadLibraryExW'),type==='RichTextBox');
});
test('ordinary EXEs omit unused common-control, RichEdit, file-enumeration and mutable-font machinery',()=>{
  const result=compileWin32(project('CommandButton'));
  const names=imports(result);
  for(const name of ['comctl32.dll:InitCommonControlsEx','kernel32.dll:LoadLibraryExW','kernel32.dll:FindFirstFileW','shlwapi.dll:PathMatchSpecExW'])assert.equal(names.has(name),false,name);
  for(const literal of ['RICHEDIT50W','SysTreeView32','msftedit.dll'])assert.equal(Buffer.from(result.bytes).includes(Buffer.from(literal,'utf16le')),false,literal);
  assert.equal(result.report.controls.runtime.mutableFonts,false);assert.deepEqual(result.report.controls.runtime.fileFamilies,[]);assert.ok(result.bytes.length<24*1024);
});
test('RichEdit and file-control system dependencies are selective and explicit',()=>{
  assert.ok(imports(compileWin32(project('RichTextBox'))).has('kernel32.dll:LoadLibraryExW'));
  const files=imports(compileWin32(project('FileListBox'))),dirs=imports(compileWin32(project('DirListBox')));
  for(const name of ['FindFirstFileW','FindNextFileW','FindClose','GetFullPathNameW'])assert.ok(files.has('kernel32.dll:'+name),name);
  assert.ok(files.has('shlwapi.dll:PathMatchSpecExW'));assert.equal(dirs.has('shlwapi.dll:PathMatchSpecExW'),false);
  assert.equal(files.has('kernel32.dll:SetCurrentDirectoryW'),false);
});
test('mutable fonts emit real native allocation only when accessed and preserve indexed With bindings',()=>{
  const p=project('TextBox',{},'Private Sub Form_Load()\nControl1.FontSize=12.75\nControl1.FontBold=True\nControl1.FontName="Segoe UI"\nEnd Sub');
  assert.ok(imports(compileWin32(p)).has('gdi32.dll:GetDeviceCaps'));
  const read=project('TextBox',{},'Private Sub Form_Load()\nDim n As Double\nn=Control1.FontSize\nEnd Sub');
  assert.equal(compileWin32(read).report.controls.runtime.mutableFonts,false);assert.equal(compileWin32(p).report.controls.runtime.mutableFonts,true);
});
test('native tree persistence validates keys, parents, cycles and declaration order before linking',()=>{
  assert.deepEqual(nativeTreePlan([{Key:'child',Parent:'root',Text:'Child'},{Key:'root',Text:'Root'}]).map(n=>n.index),[1,0]);
  for(const nodes of [[{Key:'a'},{Key:'A'}],[{Key:'child',Parent:'missing'}],[{Key:'a',Parent:'b'},{Key:'b',Parent:'a'}]])assert.throws(()=>nativeTreePlan(nodes),/Duplicate|Missing|Cyclic/);
  assert.throws(()=>compileWin32(project('TreeView',{Nodes:[{Key:'bad',Parent:'absent'}]})),/Missing native tree parent/);
});
for(const type of ['PictureBox','TabStrip','SSTab'])test('all sixteen anchor masks retain native containment for '+type,()=>{
  const p=project(type,{Width:4500,Height:3000});p.settings.anchoring=true;const form=p.modules[0].form;
  for(let mask=0;mask<16;mask++){const child=createControl('ProgressBar','Progress'+mask);child.parent='Control1';Object.assign(child.properties,{Anchor:mask,Left:300,Top:300,Width:1500,Height:300});form.controls.push(child);}
  const result=compileWin32(p);assert.equal(result.report.layout.nodes,18);assert.ok(imports(result).has('user32.dll:MoveWindow'));
  assert.equal(compileWin32({...p,settings:{...p.settings,anchoring:false}}).report.layout,undefined);
});
test('native layout retains drop-down height policy for drive lists',()=>{
  const p=project('DriveListBox');p.settings.anchoring=true;const seed=nativeLayoutSeed(p),id=seed.forms.get('form1').controls.get(p.modules[0].form.controls[0].id);
  assert.equal(seed.rows[id][29],2);
});
for(const {project:p,checks}of nativeControlFixtures())test('self-checking native control executable matrix: '+p.name,()=>{
  assert.ok(checks.length>=4);
  for(const optimization of [0,1,2]){const result=compileWin32(p,{optimization});assert.ok(result.bytes.length<100*1024);assert.equal(result.report.extraction,false);assert.ok(result.report.sourceMap.length);}
});
test('unimplemented resources, item-object methods and native hosting still fail explicitly',()=>{
  for(const type of ['OLE','Data','Adodc','MSFlexGrid','MSHFlexGrid','DataGrid','MSChart','ImageList','CommonDialog'])assert.throws(()=>compileWin32(project(type)),/Unsupported native control|does not implement the data runtime/);
  assert.throws(()=>compileWin32(project('Image',{Picture:'missing.bmp'})),/picture\/icon resources/);
  assert.throws(()=>compileWin32(project('TreeView',{},'Private Sub Form_Load()\nControl1.Nodes.Add\nEnd Sub')),/collection method.*not lowered/);
});
test('range design values are checked before producing any executable',()=>{
  for(const props of [{Min:10,Max:1},{Min:0,Max:10,Value:11},{Min:0,Max:10,Value:0.5},{Min:-2147483649}])assert.throws(()=>compileWin32(project('HScrollBar',props)),/range|integer|outside/);
});

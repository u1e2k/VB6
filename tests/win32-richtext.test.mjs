import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,createControl} from '../src/project/model.js';
import {compileWin32} from '../src/native/compiler.js';
function project(code='',properties={},type='RichTextBox'){
  const p=newProject('NativeRichText');p.modules[0].code=code;
  const c=createControl(type,'Editor');Object.assign(c.properties,properties);p.modules[0].form.controls=[c];return p;
}
const body=s=>'Private Sub Form_Load()\n'+s+'\nEnd Sub';
const imports=r=>new Set(r.report.imports.map(i=>i.dll+':'+i.symbol));
test('persisted RTF becomes a used-only UTF-8 native RichEdit stream without editing the project',()=>{
  const rtf='{\\rtf1\\ansi Unicode \\u261? text}',p=project('',{TextRTF:rtf}),before=JSON.stringify(p);
  for(const optimization of [0,1,2]){const a=compileWin32(p,{optimization}),b=compileWin32(p,{optimization});assert.deepEqual(a.bytes,b.bytes);assert.deepEqual(a.report.controls.runtime.richTextFeatures,['set']);assert.ok(Buffer.from(a.bytes).includes(Buffer.from(rtf)));assert.equal(JSON.stringify(p),before);assert.ok(a.bytes.length<32768);}
});
test('TextRTF and SelRTF are String values, including indexed and nested With receivers',()=>{
  const p=project(body('Dim s As String\ns=Editor.TextRTF\nEditor.TextRTF=s\ns=Editor.SelRTF\nEditor.SelRTF=s'));
  const r=compileWin32(p);assert.deepEqual(r.report.controls.runtime.richTextFeatures,['get','set','set-selection']);
  const names=imports(r);for(const n of ['kernel32.dll:WideCharToMultiByte','kernel32.dll:MultiByteToWideChar','oleaut32.dll:SysAllocStringByteLen'])assert.ok(names.has(n),n);
  for(const n of ['kernel32.dll:CreateFileW','kernel32.dll:ReadFile','kernel32.dll:WriteFile'])assert.equal(names.has(n),false,n);
  const first=p.modules[0].form.controls[0];first.properties.Index=0;const second=createControl('RichTextBox','Editor');second.properties.Index=5;p.modules[0].form.controls.push(second);
  p.modules[0].code=body('Dim i As Long, s As String\ni=5\nWith Editor(i)\ns=.TextRTF\n.TextRTF=s\nEnd With');assert.doesNotThrow(()=>compileWin32(p));
});
test('RichTextBox LoadFile and SaveFile emit only their requested Win32 stream direction',()=>{
  for(const [method,api,absent]of [['LoadFile','ReadFile','WriteFile'],['SaveFile','WriteFile','ReadFile']]){
    for(const value of ['',',0',',1']){const r=compileWin32(project(body(`Editor.${method} "roundtrip.rtf"${value}`))),names=imports(r);assert.ok(names.has('kernel32.dll:CreateFileW'));assert.ok(names.has('kernel32.dll:CloseHandle'));assert.ok(names.has('kernel32.dll:'+api));assert.equal(names.has('kernel32.dll:'+absent),false);assert.deepEqual(r.report.controls.runtime.richTextFeatures,[method.toLowerCase()]);}
  }
});
test('RTF file methods reject invalid arity and literal file types before linking',()=>{
  for(const code of ['Editor.LoadFile','Editor.SaveFile "a",0,1','Editor.LoadFile "a",2','Editor.SaveFile "a",-1'])assert.throws(()=>compileWin32(project(body(code))),/expects|file type/);
  assert.doesNotThrow(()=>compileWin32(project(body('Dim n As Long\nn=1\nEditor.LoadFile "a",n'))));
});
test('plain controls and untouched RichEdit controls omit RTF runtime and conversion families',()=>{
  for(const type of ['CommandButton','TextBox','RichTextBox']){const r=compileWin32(project('',{},type));assert.deepEqual(r.report.controls.runtime.richTextFeatures,[]);assert.equal(imports(r).has('kernel32.dll:WideCharToMultiByte'),false);assert.equal(imports(r).has('kernel32.dll:CreateFileW'),false);}
});
test('large native Text and selection reads use an owned dynamic BSTR, not a 4096-unit scratch buffer',()=>{
  for(const type of ['TextBox','RichTextBox']){const p=project(body('Dim s As String\ns=Editor.Text\nEditor.SelStart=4500\nEditor.SelLength=500\ns=Editor.SelText'),{Text:'a'.repeat(5000)},type),r=compileWin32(p);assert.ok(imports(r).has('oleaut32.dll:SysReAllocStringLen'));assert.deepEqual(r.report.controls.runtime.richTextFeatures,[]);assert.ok(r.bytes.length<49152);}
});
test('RTF persistence validates types and the native string allocation ceiling',()=>{
  for(const TextRTF of [{rtf:'bad'},0,false])assert.throws(()=>compileWin32(project('',{TextRTF})),/TextRTF must be a String/);
  assert.throws(()=>compileWin32(project('',{TextRTF:'a'.repeat(1024*1024+1)})),/TextRTF must be a String/);
});

test('RichEdit selection change is validated and lowered as a native WM_NOTIFY event',()=>{
  const p=project('Private Sub Editor_SelChange()\nDim s As String\ns=Editor.SelText\nEnd Sub');
  for(const optimization of [0,1,2])assert.doesNotThrow(()=>compileWin32(p,{optimization}));
});

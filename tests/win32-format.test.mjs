import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,createControl} from '../src/project/model.js';
import {compileWin32} from '../src/native/compiler.js';
const project=(code,type='RichTextBox')=>{const p=newProject('NativeFormatting');p.modules[0].code=`Private Sub Form_Load()\n${code}\nEnd Sub`;p.modules[0].form.controls=[createControl(type,'Editor')];return p;};
const props={SelBold:['Boolean','True'],SelItalic:['Boolean','True'],SelUnderline:['Boolean','True'],SelStrikeThru:['Boolean','True'],SelColor:['Long','255'],SelBackColor:['Long','65535'],SelFontName:['String','"Arial"'],SelFontSize:['Double','12.5'],SelAlignment:['Long','2'],SelIndent:['Long','360'],SelRightIndent:['Long','180'],SelHangingIndent:['Long','120']};
for(const optimization of [0,1,2])for(const [prop,[type,value]] of Object.entries(props))test(`native ${prop} get/set emits selection format at O${optimization}`,()=>{
 const p=project(`Dim v As ${type}\nEditor.${prop}=${value}\nv=Editor.${prop}`),before=JSON.stringify(p),r=compileWin32(p,{optimization});
 assert.ok(r.report.controls.runtime.selectionFormatting.includes(prop.toLowerCase()));assert.equal(JSON.stringify(p),before);assert.deepEqual(r.bytes,compileWin32(p,{optimization}).bytes);
});
test('untouched controls omit selection-format helpers',()=>{for(const type of ['CommandButton','TextBox','RichTextBox']){const r=compileWin32(project('',type));assert.deepEqual(r.report.controls.runtime.selectionFormatting,[]);}});
test('selection formatting is rejected on controls without the RichEdit contract',()=>{assert.throws(()=>compileWin32(project('Editor.SelBold=True','TextBox')),/not lowered/);});
test('selection formatting supports indexed With receivers without duplicating the index expression',()=>{const p=project('Dim i As Long, n As Double\ni=3\nWith Editor(i)\n.SelBold=True\nn=.SelFontSize\nEnd With');const a=p.modules[0].form.controls[0];a.properties.Index=0;const b=createControl('RichTextBox','Editor');b.properties.Index=3;p.modules[0].form.controls.push(b);assert.doesNotThrow(()=>compileWin32(p));});

import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,createControl} from '../src/project/model.js';
import {compileWin32} from '../src/native/compiler.js';
import {NATIVE_RICH_FORMAT} from '../src/native/control-richformat.js';
const project=code=>{const p=newProject('RichFormatting');p.modules[0].form.controls=[createControl('RichTextBox','Editor')];p.modules[0].code='Private Sub Form_Load()\n'+code+'\nEnd Sub';return p;};
for(const optimization of [0,1,2]){
  test('native rich character and paragraph formatting at O'+optimization,()=>{
    for(const [name,f]of Object.entries(NATIVE_RICH_FORMAT)){
      const value=f.string?'"Arial"':f.points?'12.5':f.effect||f.bullet?'True':f.alignment?'2':'120';
      const code=`Dim value As ${f.string?'String':f.points?'Double':'Long'}\nEditor.${name}=${value}\nvalue=Editor.${name}\nIf IsNull(Editor.${name}) Then value=${value}`;
      const p=project(code),snapshot=JSON.stringify(p),result=compileWin32(p,{optimization});assert.ok(result.report.controls.runtime.richTextFeatures.includes('format'));assert.equal(JSON.stringify(p),snapshot);
    }
  });
  test('native rich find, undo/redo and line methods at O'+optimization,()=>{
    const p=project('Dim value As Long\nvalue=Editor.Find("needle",0,-1,6)\nvalue=Editor.GetLineFromChar(3)\nvalue=Editor.CanUndo()\nEditor.Undo\nvalue=Editor.CanRedo()\nEditor.Redo');assert.doesNotThrow(()=>compileWin32(p,{optimization}));
  });
}
test('native formatting rejects unsupported Find flag arity and preserves plain-control dependency budget',()=>{
  assert.throws(()=>compileWin32(project('Editor.Find')),/expects/);
  const p=project('');p.modules[0].form.controls[0]=createControl('TextBox','Editor');const result=compileWin32(p);assert.deepEqual(result.report.controls.runtime.richTextFeatures,[]);
});

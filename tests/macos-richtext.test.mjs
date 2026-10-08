import test from 'node:test';
import assert from 'node:assert/strict';
import {createForm,createControl} from '../src/project/model.js';
import {compileMacOS,createMacOSBuildKit} from '../packages/macos-native/dist/index.js';

function project() {
  const form=createForm('RichForm');
  form.form.controls.push(createControl('RichTextBox','Editor'));
  form.code=`Option Explicit
Private Sub Form_Load()
  Editor.Text = "plain"
  Editor.SelStart = 0
  Editor.SelLength = 5
  Editor.SelBold = True
  Editor.SelItalic = True
  Editor.SelUnderline = True
  Editor.SelStrikeThru = True
  Editor.SelColor = vbRed
  Editor.SelBackColor = vbGreen
  Editor.SelFontName = "Helvetica"
  Editor.SelFontSize = 12.5
  Editor.SelAlignment = 2
  Dim fragment As String
  fragment = Editor.SelRTF
  Editor.SelRTF = fragment
  fragment = Editor.TextRTF
  Editor.TextRTF = fragment
End Sub`;
  return {schema:1,name:'NativeRichSelection',startup:'RichForm',modules:[form]};
}

test('native RichTextBox selection properties lower through the shared frontend', () => {
  const input=project(),before=JSON.stringify(input),a=compileMacOS(input),b=compileMacOS(input);
  assert.equal(a.files['main.cpp'],b.files['main.cpp']);
  assert.equal(JSON.stringify(input),before);
  for(const name of ['SelBold','SelItalic','SelUnderline','SelStrikeThru','SelColor','SelBackColor',
    'SelFontName','SelFontSize','SelAlignment','SelRTF','TextRTF'])
    assert.ok(a.files['main.cpp'].includes(`memberRef(f.runtime,f.get("Editor"),"${name}")`),name);
});

test('standalone source kit enrolls native rich formatting and editor cell hooks', () => {
  const kit=createMacOSBuildKit(project()),manifest=JSON.parse(kit.files['build.json']);
  for(const source of ['native/appkit-richtext.mm','native/appkit-edit-fields.mm']) {
    assert.ok(manifest.sources.includes(source),source);
    assert.ok(kit.files[source]?.length,source);
  }
  assert.ok(manifest.headers.includes('native/appkit-richtext.hpp'));
  assert.ok(kit.files['native/appkit-richtext.hpp']);
  assert.equal(kit.report.artifact,'native-source-build-kit');
});

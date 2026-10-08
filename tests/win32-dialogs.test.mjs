import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,createControl} from '../src/project/model.js';
import {compileWin32} from '../src/native/compiler.js';
import {nativeDialogFilter,nativeDialogSeed,NATIVE_DIALOG_RECORDS} from '../src/native/dialog-contract.js';
const project=code=>{const p=newProject('NativeDialogs');p.modules[0].form.controls=[createControl('CommonDialog','Dialog')];p.modules[0].code=`Private Sub Form_Load()\n${code}\nEnd Sub`;return p;};
test('native file filter contract preserves pairs, wildcards and the final double-NUL',()=>{
 assert.equal(nativeDialogFilter('Text|*.txt;*.bas|All|*.*'),'Text\0*.txt;*.bas\0All\0*.*\0\0');
 assert.equal(nativeDialogFilter('Text|*.txt|'),'Text\0*.txt\0\0');assert.equal(nativeDialogFilter(''),'\0\0');
 for(const value of ['Only description','Text||All|*.*','|*.*','Text|*.txt\0evil'])assert.throws(()=>nativeDialogFilter(value));
});
test('dialog seeds and native x86 records are checked before code generation',()=>{
 assert.deepEqual(NATIVE_DIALOG_RECORDS,{OPENFILENAMEW:88,CHOOSECOLORW:36,CHOOSEFONTW:60,LOGFONTW:92,PRINTDLGEXW:84});
 assert.equal(nativeDialogSeed({FontSize:12.5}).fontsize,125);
 for(const bad of [{MaxFileSize:1},{MaxFileSize:1048577},{FontSize:0},{Filter:'bad'},{FontName:'x'.repeat(32)},{hDC:3}])assert.throws(()=>nativeDialogSeed(bad));
});
for(const [method,api]of [['ShowOpen','GetOpenFileNameW'],['ShowSave','GetSaveFileNameW'],['ShowColor','ChooseColorW'],['ShowFont','ChooseFontW'],['ShowPrinter','PrintDlgExW']])for(const optimization of [0,1,2])test(`native ${method} uses only the selected system dialog at O${optimization}`,()=>{
 const p=project(`Dialog.${method}`),before=JSON.stringify(p),r=compileWin32(p,{optimization}),imports=r.report.imports.filter(i=>i.dll==='comdlg32.dll').map(i=>i.symbol);
 assert.ok(imports.includes(api));assert.equal(imports.filter(s=>s!=='CommDlgExtendedError').length,1);assert.equal(JSON.stringify(p),before);
 assert.deepEqual(r.report.controls.runtime.dialogs,[method.toLowerCase()]);assert.ok(r.bytes.length<50000);
});
test('dialog properties compile without importing a dialog display API',()=>{
 const r=compileWin32(project('Dim s As String, n As Long, f As Double\nDialog.FileName="file.txt"\ns=Dialog.FileName\nDialog.Filter="Text|*.txt"\nDialog.CancelError=True\nDialog.FontSize=12.5\nf=Dialog.FontSize\nDialog.Flags=0\nn=Dialog.FilterIndex'));
 assert.equal(r.report.imports.some(i=>i.dll==='comdlg32.dll'),false);
});
test('nonvisual dialog handles and input events are not misrepresented as HWND APIs',()=>{
 assert.throws(()=>compileWin32(project('Dim h As Long\nh=Dialog.hWnd')),/nonvisual|hWnd/);
 const p=project('');p.modules[0].code='Private Sub Dialog_Click()\nEnd Sub';assert.throws(()=>compileWin32(p),/event/);
});

import {createForm,createControl} from '../src/project/model.js';
export function project(code,{kind='module',name='Module1',...settings}={}) {
  return {name:'MigrationFixture',startup:'Sub Main',settings:{},modules:[{name,kind,code}],...settings};
}
export function procedure(body,parameters='') { return project('Option Explicit\nPublic Sub Main('+parameters+')\n'+body+'\nEnd Sub'); }
export function formProject() {
  const form=createForm('MainForm','Migration test');form.id='form-module';form.form.id='form-design';
  const button=createControl('CommandButton','RunButton',240,240);button.id='button';button.properties.Caption='Run';
  const text=createControl('TextBox','OutputBox',240,840);text.id='text';
  form.form.controls=[button,text];
  form.code=`Option Explicit
Private mCount As Long
Private Sub Form_Load()
    Caption = "Migrated to .NET 10"
End Sub
Private Sub RunButton_Click()
    mCount = mCount + 1
    OutputBox.Text = CStr(mCount)
End Sub`;
  return {name:'MigrationForms',startup:'MainForm',settings:{},modules:[form]};
}
export const CORE_FIXTURE=project(`Option Explicit
Public Sub Main()
    Dim values() As Long
    Dim i As Long
    ReDim values(-2 To 2)
    For i = -2 To 2
        values(i) = i * i
    Next i
    ReDim Preserve values(-2 To 3)
    values(3) = 9
    Debug.Print SumValues(values)
    Debug.Print NextCount()
    Debug.Print NextCount()
    Dim amount As Currency
    amount = 12.34565@
    Debug.Print CStr(amount)
    Dim fixed As String * 6
    fixed = "abc"
    Mid$(fixed, 2, 2) = "XY"
    Debug.Print "[" & fixed & "]"
    GoSub Increment
    Debug.Print i
    Exit Sub
Increment:
    i = 40
    Return
End Sub
Public Function SumValues(ByRef values() As Long) As Long
    Dim i As Long
    For i = LBound(values) To UBound(values)
        SumValues = SumValues + values(i)
    Next i
End Function
Private Function NextCount() As Long
    Static value As Long
    value = value + 1
    NextCount = value
End Function`);
export const CORE_EXPECTED=['19','1','2','12.3456','[aXY   ]','40'];

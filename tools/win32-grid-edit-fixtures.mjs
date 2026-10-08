/** Real HWND/EDIT transaction fixtures. Only a Windows run establishes success;
 * local compilation and instruction-hook tests do not establish native editing. */
import {newProject,createControl} from '../src/project/model.js';
const api=`Private Declare Sub ExitProcess Lib "kernel32" (ByVal code As Long)
Private Declare Function SendValue Lib "user32" Alias "SendMessageW" (ByVal hwnd As Long, ByVal msg As Long, ByVal wp As Long, ByVal lp As Long) As Long
Private Declare Function SetText Lib "user32" Alias "SetWindowTextW" (ByVal hwnd As Long, ByVal text As Long) As Long
Private Declare Function GetFocus Lib "user32" () As Long
Private Declare Function GetParent Lib "user32" (ByVal hwnd As Long) As Long
Private Declare Function IsWindow Lib "user32" (ByVal hwnd As Long) As Long`;
export function gridEditControlFixtures(){return ['MSFlexGrid','MSHFlexGrid','DataGrid'].map(type=>{
 const project=newProject('AotControl'+type+'Editing'),form=project.modules[0],g=createControl(type,'G'),checks=[],body=[];
 Object.assign(g.properties,{Rows:4,Cols:3,FixedRows:1,FixedCols:1,Width:6000,Height:3000,GridData:[['head'],['','original']]});form.form.controls=[g];
 const add=s=>body.push(s),check=(s,label)=>{checks.push(label);add(`If Not (${s}) Then ExitProcess ${checks.length}`);};
 add('Dim editor As Long, n As Long, text As String, oldGrid As Long\nMe.Show\nG.Row=1\nG.Col=1\nn=SendValue(G.hWnd,&H100,113,0)\neditor=GetFocus()');
 check('editor<>0 And GetParent(editor)=G.hWnd','F2 creates and focuses a native child EDIT');
 add('text="日本" & ChrW$(-10179) & ChrW$(-8576)\nn=SetText(editor,StrPtr(text))\nn=SendValue(editor,&H100,13,0)');
 check('G.TextMatrix(1,1)=text And beforeCount=1 And validationCount=1 And afterCount=1','Enter commits counted Unicode and dispatches native validation/update events');
 check('IsWindow(editor)=0 And GetFocus()=G.hWnd','committed temporary editor is destroyed and focus returns to the grid');
 add('mode=1\nn=SendValue(G.hWnd,&H100,113,0)\neditor=GetFocus()\ntext="discard before"\nn=SetText(editor,StrPtr(text))\nn=SendValue(editor,&H100,13,0)');
 check('Left$(G.TextMatrix(1,1),2)="日本" And validationCount=1 And afterCount=1','BeforeColUpdate cancellation prevents validation and cell replacement');
 add('mode=2\nn=SendValue(G.hWnd,&H100,113,0)\neditor=GetFocus()\ntext="discard validate"\nn=SetText(editor,StrPtr(text))\nn=SendValue(editor,&H100,13,0)');
 check('Left$(G.TextMatrix(1,1),2)="日本" And validationCount=2 And afterCount=1','Validate cancellation retains the previous cell');
 add('mode=3\nn=SendValue(G.hWnd,&H100,113,0)\neditor=GetFocus()\ntext="stale replacement"\nn=SetText(editor,StrPtr(text))\nn=SendValue(editor,&H100,13,0)');
 check('G.TextMatrix(1,1)="changed during validation" And afterCount=1','reentrant data mutation invalidates the captured edit revision');
 add('mode=0\nn=SendValue(G.hWnd,&H100,113,0)\neditor=GetFocus()\ntext="escape"\nn=SetText(editor,StrPtr(text))\nn=SendValue(editor,&H100,27,0)');
 check('G.TextMatrix(1,1)="changed during validation" And IsWindow(editor)=0','Escape cancels without entering the validation transaction');
 add('G.Locked=True\nn=SendValue(G.hWnd,&H100,113,0)');check('GetFocus()=G.hWnd','Locked grids do not create an editor');
 add('G.Locked=False\nG.Row=0\nn=SendValue(G.hWnd,&H100,113,0)');check('GetFocus()=G.hWnd','fixed header cells are not editable');
 add('G.Row=1\nG.Col=1\nn=SendValue(G.hWnd,&H100,113,0)\neditor=GetFocus()\noldGrid=G.hWnd\nUnload Me');
 check('IsWindow(editor)=0 And IsWindow(oldGrid)=0','form unload destroys the active editor and grid without a dangling session');
 form.code=`Option Explicit\n${api}\nPrivate mode As Long, beforeCount As Long, validationCount As Long, afterCount As Long
Private Sub Form_Load()
${body.join('\n')}
ExitProcess 0
End Sub
Private Sub G_BeforeColUpdate(ColIndex As Integer, OldValue As String, Cancel As Integer)
 beforeCount=beforeCount+1
 If ColIndex<>1 Then ExitProcess 101
 If mode=1 Then Cancel=True
 If mode=3 Then G.TextMatrix(1,1)="changed during validation"
 OldValue="event-owned old value copy"
End Sub
Private Sub G_Validate(Cancel As Boolean)
 validationCount=validationCount+1
 If mode=2 Then Cancel=True
End Sub
Private Sub G_AfterColUpdate(ColIndex As Integer)
 afterCount=afterCount+1
End Sub`;
 return {project,checks};
});}

/** These fixtures require Windows execution. Compiling them is not a GUI pass. */
import {newProject,createControl} from '../src/project/model.js';
const api=`Private Declare Sub ExitProcess Lib "kernel32" (ByVal code As Long)
Private Declare Function SendValue Lib "user32" Alias "SendMessageW" (ByVal hwnd As Long, ByVal msg As Long, ByVal wp As Long, ByVal lp As Long) As Long
Private Declare Function CreateDC Lib "gdi32" Alias "CreateCompatibleDC" (ByVal dc As Long) As Long
Private Declare Function CreateBitmap Lib "gdi32" (ByVal width As Long, ByVal height As Long, ByVal planes As Long, ByVal bits As Long, ByVal data As Long) As Long
Private Declare Function SelectObject Lib "gdi32" (ByVal dc As Long, ByVal handle As Long) As Long
Private Declare Function DeleteObject Lib "gdi32" (ByVal handle As Long) As Long
Private Declare Function DeleteDC Lib "gdi32" (ByVal dc As Long) As Long
Private Declare Function GetPixel Lib "gdi32" (ByVal dc As Long, ByVal x As Long, ByVal y As Long) As Long`;
export function gridControlFixtures(){return ['MSFlexGrid','MSHFlexGrid','DataGrid'].map(type=>{
 const project=newProject('AotControl'+type),form=project.modules[0],grid=createControl(type,'G'),checks=[],body=[];
 Object.assign(grid.properties,{Width:6000,Height:3000,Rows:5,Cols:3,FixedRows:1,FixedCols:1,BackColor:0xffffff,ForeColor:0,BackColorFixed:0x123456,GridLines:0,GridData:[['Name','Value','State'],['日本','saved','one']]});form.form.controls=[grid];
 const add=s=>body.push(s),check=(s,label)=>{checks.push(label);add(`If Not (${s}) Then ExitProcess ${checks.length}`);};
 add('Dim value As String, n As Long, dc As Long, bitmap As Long, previous As Long');
 check('G.Rows=5 And G.Cols=3 And G.TextMatrix(1,0)="日本"','persisted native grid matrix and dimensions');
 add('G.TextMatrix(1,1)="first" & vbNullChar & "last"\nvalue=G.TextMatrix(1,1)');check('Len(value)=10 And Mid$(value,6,1)=vbNullChar','counted BSTR cells retain embedded NUL');
 add('G.ColWidth(1)=1800\nG.RowHeight(2)=420\nG.RowData(1)=123');check('G.ColWidth(1)=1800 And G.RowHeight(2)=420 And G.RowData(1)=123','variable cell geometry and row data');
 add('G.AddItem "inserted" & vbTab & "cell",1');check('G.Rows=6 And G.TextMatrix(1,1)="cell" And G.RowData(2)=123','row insertion shifts cells and row data together');
 add('G.RemoveItem 1');check('G.Rows=5 And G.TextMatrix(1,1)=value And G.RowData(1)=123','row removal preserves remaining matrix');
 add('G.Row=1\nG.Col=1\nG.RowSel=2\nG.ColSel=2\nG.Clip="a" & vbTab & "b" & vbCrLf & "c" & vbTab & "d"');check('G.TextMatrix(2,2)="d" And G.Clip="a" & vbTab & "b" & vbCrLf & "c" & vbTab & "d"','rectangular Clip write and read');
 add('G.Redraw=False\nG.Rows=100\nG.Redraw=True\nG.Row=1\nG.Col=1\nrowChanges=0\nn=SendValue(G.hWnd,&H100,40,0)');check('G.Row=2 And rowChanges=1','native keyboard selection routes RowColChange');
 add('n=SendValue(G.hWnd,&H115,1,0)');check('G.TopRow=2','native vertical line scrolling');
 add('On Error Resume Next\nErr.Clear\nG.Rows=100002');check('Err.Number=380 And G.Rows=100','invalid resize is recoverable and retains data');add('Err.Clear\nOn Error GoTo 0');
 add('dc=CreateDC(0)\nbitmap=CreateBitmap(400,200,1,32,0)');check('dc<>0 And bitmap<>0','offscreen GDI resources allocated');
 add('previous=SelectObject(dc,bitmap)\nn=SendValue(G.hWnd,&H318,dc,4)');check('GetPixel(dc,4,4)=&H123456','WM_PRINTCLIENT paints authored fixed-cell background');
 add('n=SelectObject(dc,previous)\nn=DeleteObject(bitmap)');check('n<>0','grid painting releases selected temporary GDI objects');add('n=DeleteDC(dc)');
 add('G.Clear');check('G.Rows=100 And G.TextMatrix(1,1)=""','Clear removes cell strings without replacing dimensions');
 form.code=`Option Explicit\n${api}\nPrivate rowChanges As Long\nPrivate Sub Form_Load()\n${body.join('\n')}\nExitProcess 0\nEnd Sub\nPrivate Sub G_RowColChange()\nrowChanges=rowChanges+1\nEnd Sub`;
 return {project,checks};
});}

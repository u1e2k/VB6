import {NATIVE_GRID_FIELDS as F,NATIVE_GRID_MAX_CELLS} from './control-grid-contract.js';
/** This private VB kernel is compiled by the existing native compiler to x86.
 * Host routines are intrinsic only inside this module. No source/interpreter is
 * present in the EXE. The same algorithms run in the VM for differential tests. */
export const NATIVE_GRID_HOSTS=Object.freeze({
 buffernew:'ByVal count As Long, ByVal kind As Long',bufferfree:'ByVal handle As Long',buffercopy:'ByVal handle As Long',
 bufferget:'ByVal handle As Long, ByVal offset As Long',bufferput:'ByVal handle As Long, ByVal offset As Long, ByVal value As Long',
 buffertext:'ByVal handle As Long, ByVal offset As Long',bufferwrite:'ByVal handle As Long, ByVal offset As Long, ByVal value As String',
 hostinvalidate:'ByVal hwnd As Long',hostnotify:'ByVal hwnd As Long, ByVal flags As Long',
 hostcolors:'ByVal hwnd As Long, ByVal back As Long, ByVal fore As Long, ByVal selectedBack As Long, ByVal selectedFore As Long, ByVal grid As Long',
 hostcell:'ByVal hwnd As Long, ByVal dc As Long, ByVal x As Long, ByVal y As Long, ByVal width As Long, ByVal height As Long, ByVal value As String, ByVal flags As Long, ByVal alignment As Long',
 hostbars:'ByVal hwnd As Long, ByVal axis As Long, ByVal minimum As Long, ByVal maximum As Long, ByVal page As Long, ByVal position As Long, ByVal enabled As Long'
});
export function nativeGridCoreSource(count){
 if(!Number.isInteger(count)||count<1||count>10000)throw new TypeError('Invalid native grid instance count');
 const headers=Object.entries(NATIVE_GRID_HOSTS).map(([name,args])=>`Private Function ${name}(${args}) As ${name==='buffertext'?'String':'Long'}\nEnd Function`).join('\n');
 const fields=Object.entries(F).map(([name,n])=>`Private Const G${name} As Long = ${n}`).join('\n');
 return `Option Explicit
${fields}
Private D(0 To ${Object.keys(F).length-1}, 0 To ${count-1}) As Long
${headers}
Private Function Bounded(ByVal value As Long, ByVal lo As Long, ByVal hi As Long) As Long
 If value<lo Then value=lo
 If value>hi Then value=hi
 If value<lo Then value=lo
 Bounded=value
End Function
Private Sub Guard(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long)
 If id<0 Or id>=${count} Then Err.Raise 340
 If hwnd=0 Or D(Ghwnd,id)<>hwnd Or D(Gepoch,id)<>epoch Then Err.Raise 91
End Sub
Private Function Stamp(ByVal id As Long) As Long
 If id<0 Or id>=${count} Then Err.Raise 340
 Stamp=D(Gepoch,id)
End Function
Private Sub Version(ByVal id As Long)
 If D(Gversion,id)=2147483647 Then
  D(Gversion,id)=1
 Else
  D(Gversion,id)=D(Gversion,id)+1
 End If
End Sub
Private Sub Invalidate(ByVal id As Long)
 If D(Gredraw,id)<>0 And D(Ghwnd,id)<>0 Then hostinvalidate D(Ghwnd,id)
End Sub
Private Sub Notify(ByVal id As Long, ByVal flags As Long)
 Invalidate id
 If flags<>0 Then hostnotify D(Ghwnd,id),flags
End Sub
Private Sub CellGuard(ByVal id As Long, ByVal row As Long, ByVal col As Long)
 If row<0 Or col<0 Or row>=D(Grows,id) Or col>=D(Gcols,id) Then Err.Raise 381
End Sub
Private Sub Normalize(ByVal id As Long)
 D(Gfixedrows,id)=Bounded(D(Gfixedrows,id),0,D(Grows,id))
 D(Gfixedcols,id)=Bounded(D(Gfixedcols,id),0,D(Gcols,id))
 D(Grow,id)=Bounded(D(Grow,id),0,D(Grows,id)-1)
 D(Gcol,id)=Bounded(D(Gcol,id),0,D(Gcols,id)-1)
 D(Growsel,id)=Bounded(D(Growsel,id),0,D(Grows,id)-1)
 D(Gcolsel,id)=Bounded(D(Gcolsel,id),0,D(Gcols,id)-1)
 D(Gtoprow,id)=Bounded(D(Gtoprow,id),D(Gfixedrows,id),D(Grows,id)-1)
 D(Gleftcol,id)=Bounded(D(Gleftcol,id),D(Gfixedcols,id),D(Gcols,id)-1)
End Sub
Private Sub Dispose(ByVal id As Long)
 Dim i As Long
 If id<0 Or id>=${count} Then Err.Raise 340
 D(Ghwnd,id)=0
 bufferfree D(Gformat,id)
 D(Gformat,id)=0
 For i=Gcells To Galignment
  bufferfree D(i,id)
  D(i,id)=0
 Next
End Sub
Private Sub Initialize(ByVal id As Long, ByVal hwnd As Long, ByVal rows As Long, ByVal cols As Long)
 Dim i As Long, epoch As Long, code As Long
 If id<0 Or id>=${count} Then Err.Raise 340
 If hwnd=0 Then Err.Raise 91
 Dispose id
 epoch=D(Gepoch,id)
 If epoch=2147483647 Then epoch=0
 For i=0 To ${Object.keys(F).length-1}
  D(i,id)=0
 Next
 D(Ghwnd,id)=hwnd
 D(Gepoch,id)=epoch+1
 D(Gredraw,id)=0
 On Error GoTo Failed
 If rows<0 Or rows>100001 Or cols<1 Or cols>10000 Then Err.Raise 380
 If rows>0 Then
  If cols>${NATIVE_GRID_MAX_CELLS} \\ rows Then Err.Raise 7
 End If
 D(Gcells,id)=buffernew(rows*cols,8)
 D(Gwidths,id)=buffernew(cols,3)
 D(Gheights,id)=buffernew(rows,3)
 D(Growdata,id)=buffernew(rows,3)
 D(Gcoldata,id)=buffernew(cols,3)
 D(Galignment,id)=buffernew(cols,3)
 D(Gformat,id)=buffernew(1,8)
 D(Grows,id)=rows
 D(Gcols,id)=cols
 For i=0 To cols-1
  bufferput D(Gwidths,id),i,1200
 Next
 For i=0 To rows-1
  bufferput D(Gheights,id),i,315
 Next
 D(Gredraw,id)=-1
 Exit Sub
Failed:
 code=Err.Number
 Dispose id
 Err.Raise code
End Sub
Private Sub Resize(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal rows As Long, ByVal cols As Long, ByVal mode As Long, ByVal at As Long, Optional ByVal inserted As String = "")
 Dim fresh(0 To 5) As Long, oldRows As Long, oldCols As Long
 Dim r As Long, c As Long, src As Long, i As Long, code As Long
 Guard id,hwnd,epoch
 If rows<0 Or rows>100001 Or cols<1 Or cols>10000 Then Err.Raise 380
 If rows>0 Then
  If cols>${NATIVE_GRID_MAX_CELLS} \\ rows Then Err.Raise 7
 End If
 oldRows=D(Grows,id)
 oldCols=D(Gcols,id)
 On Error GoTo Failed
 fresh(0)=buffernew(rows*cols,8)
 fresh(1)=buffernew(cols,3)
 fresh(2)=buffernew(rows,3)
 fresh(3)=buffernew(rows,3)
 fresh(4)=buffernew(cols,3)
 fresh(5)=buffernew(cols,3)
 For c=0 To cols-1
  bufferput fresh(1),c,1200
  If c<oldCols Then
   bufferput fresh(1),c,bufferget(D(Gwidths,id),c)
   bufferput fresh(4),c,bufferget(D(Gcoldata,id),c)
   bufferput fresh(5),c,bufferget(D(Galignment,id),c)
  End If
 Next
 For r=0 To rows-1
  bufferput fresh(2),r,315
  src=r
  If mode=1 Then
   If r=at Then src=-1
   If r>at Then src=r-1
  ElseIf mode=2 Then
   If r>=at Then src=r+1
  End If
  If src>=0 And src<oldRows Then
   bufferput fresh(2),r,bufferget(D(Gheights,id),src)
   bufferput fresh(3),r,bufferget(D(Growdata,id),src)
   For c=0 To cols-1
    If c<oldCols Then bufferwrite fresh(0),r*cols+c,buffertext(D(Gcells,id),src*oldCols+c)
   Next
  ElseIf mode=1 And r=at Then
   FillRow fresh(0),cols,r,inserted
  End If
 Next
 For i=0 To 5
  bufferfree D(Gcells+i,id)
  D(Gcells+i,id)=fresh(i)
  fresh(i)=0
 Next
 D(Grows,id)=rows
 D(Gcols,id)=cols
 Normalize id
 Version id
 Invalidate id
 Exit Sub
Failed:
 code=Err.Number
 On Error Resume Next
 For i=0 To 5
  bufferfree fresh(i)
 Next
 On Error GoTo 0
 Err.Raise code
End Sub
Private Function GetField(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal field As Long) As Long
 Guard id,hwnd,epoch
 GetField=D(field,id)
End Function
Private Sub SetField(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal field As Long, ByVal value As Long)
 Dim flags As Long, oldValue As Long
 Guard id,hwnd,epoch
 oldValue=D(field,id)
 If field=Grows Then
  Resize id,hwnd,epoch,value,D(Gcols,id),0,-1
  Exit Sub
 ElseIf field=Gcols Then
  Resize id,hwnd,epoch,D(Grows,id),value,0,-1
  Exit Sub
 ElseIf field=Grow Or field=Growsel Then
  If value<0 Or value>=D(Grows,id) Then Err.Raise 381
  flags=2
  If field=Grow Then
   D(Growsel,id)=value
   flags=3
  End If
 ElseIf field=Gcol Or field=Gcolsel Then
  If value<0 Or value>=D(Gcols,id) Then Err.Raise 381
  flags=2
  If field=Gcol Then
   D(Gcolsel,id)=value
   flags=3
  End If
 ElseIf field=Gfixedrows Then
  If value<0 Or value>D(Grows,id) Then Err.Raise 380
 ElseIf field=Gfixedcols Then
  If value<0 Or value>D(Gcols,id) Then Err.Raise 380
 ElseIf field=Gtoprow Then
  If value<D(Gfixedrows,id) Or value>=D(Grows,id) Then Err.Raise 380
  flags=4
 ElseIf field=Gleftcol Then
  If value<D(Gfixedcols,id) Or value>=D(Gcols,id) Then Err.Raise 380
  flags=4
 ElseIf field=Gredraw Or field=Glocked Then
  value=CBool(value)
 ElseIf field=Gselectionmode Then
  If value<0 Or value>2 Then Err.Raise 380
 ElseIf field=Gscrollbars Then
  If value<0 Or value>3 Then Err.Raise 380
 ElseIf field=Ggridlines Then
  If value<0 Or value>1 Then Err.Raise 380
 ElseIf field<Gbackcolorfixed Or field>Ggridcolor Then
  Err.Raise 380
 End If
 D(field,id)=value
 Normalize id
 If value=oldValue Then flags=0
 Notify id,flags
End Sub
Private Function GetText(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal row As Long, ByVal col As Long) As String
 Guard id,hwnd,epoch
 If row=-1 Then row=D(Grow,id)
 If col=-1 Then col=D(Gcol,id)
 CellGuard id,row,col
 GetText=buffertext(D(Gcells,id),row*D(Gcols,id)+col)
End Function
Private Sub SetText(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal row As Long, ByVal col As Long, ByVal value As String)
 Guard id,hwnd,epoch
 If row=-1 Then row=D(Grow,id)
 If col=-1 Then col=D(Gcol,id)
 CellGuard id,row,col
 bufferwrite D(Gcells,id),row*D(Gcols,id)+col,value
 Version id
 Invalidate id
End Sub
Private Function GetIndexed(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal field As Long, ByVal index As Long) As Long
 Dim count As Long
 Guard id,hwnd,epoch
 count=D(Gcols,id)
 If field=Gheights Or field=Growdata Then count=D(Grows,id)
 If index<0 Or index>=count Then Err.Raise 381
 GetIndexed=bufferget(D(field,id),index)
End Function
Private Sub SetIndexed(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal field As Long, ByVal index As Long, ByVal value As Long)
 Dim count As Long, lo As Long, hi As Long, i As Long
 Guard id,hwnd,epoch
 count=D(Gcols,id)
 If field=Gheights Or field=Growdata Then count=D(Grows,id)
 If index< -1 Or index>=count Then Err.Raise 381
 If field=Gwidths Or field=Gheights Then
  If value<0 Or value>300000 Then Err.Raise 380
 End If
 If field=Galignment Then
  If value<0 Or value>2 Then Err.Raise 380
 End If
 lo=index
 hi=index
 If index=-1 Then
  lo=0
  hi=count-1
 End If
 For i=lo To hi
  bufferput D(field,id),i,value
 Next
 Invalidate id
End Sub
Private Sub Clear(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long)
 Dim fresh As Long
 Guard id,hwnd,epoch
 fresh=buffernew(D(Grows,id)*D(Gcols,id),8)
 bufferfree D(Gcells,id)
 D(Gcells,id)=fresh
 Version id
 Invalidate id
End Sub
Private Sub FillRow(ByVal buffer As Long, ByVal cols As Long, ByVal row As Long, ByVal value As String)
 Dim start As Long, pos As Long, col As Long
 start=1
 Do
  pos=InStr(start,value,vbTab)
  If pos=0 Then pos=Len(value)+1
  If col<cols Then bufferwrite buffer,row*cols+col,Mid$(value,start,pos-start)
  col=col+1
  start=pos+1
 Loop While pos<=Len(value) And col<cols
End Sub
Private Sub AddItem(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal value As String, ByVal at As Long)
 Guard id,hwnd,epoch
 If at=-1 Then at=D(Grows,id)
 If at<0 Or at>D(Grows,id) Then Err.Raise 381
 Resize id,hwnd,epoch,D(Grows,id)+1,D(Gcols,id),1,at,value
End Sub
Private Sub RemoveItem(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal at As Long)
 Guard id,hwnd,epoch
 If at<0 Or at>=D(Grows,id) Then Err.Raise 381
 Resize id,hwnd,epoch,D(Grows,id)-1,D(Gcols,id),2,at
End Sub
Private Function Clip(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long) As String
 Dim r As Long, c As Long, loR As Long, hiR As Long, loC As Long, hiC As Long, text As String
 Guard id,hwnd,epoch
 If D(Grows,id)=0 Then Exit Function
 loR=D(Grow,id)
 hiR=D(Growsel,id)
 If loR>hiR Then
  r=loR
  loR=hiR
  hiR=r
 End If
 loC=D(Gcol,id)
 hiC=D(Gcolsel,id)
 If loC>hiC Then
  c=loC
  loC=hiC
  hiC=c
 End If
 For r=loR To hiR
  If r>loR Then text=text & vbCrLf
  For c=loC To hiC
   If c>loC Then text=text & vbTab
   text=text & buffertext(D(Gcells,id),r*D(Gcols,id)+c)
  Next
 Next
 Clip=text
End Function
Private Sub SetClip(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal value As String)
 Dim row As Long, col As Long, start As Long, pos As Long, ch As String, text As String, fresh As Long, code As Long
 Guard id,hwnd,epoch
 On Error GoTo Failed
 fresh=buffercopy(D(Gcells,id))
 row=D(Grow,id)
 col=D(Gcol,id)
 start=1
 For pos=1 To Len(value)+1
  ch=Mid$(value,pos,1)
  If ch=vbTab Or ch=vbCr Or ch=vbLf Or pos>Len(value) Then
   text=Mid$(value,start,pos-start)
   If row<D(Grows,id) And col<D(Gcols,id) Then bufferwrite fresh,row*D(Gcols,id)+col,text
   If ch=vbTab Then
    col=col+1
   Else
    row=row+1
    col=D(Gcol,id)
    If ch=vbCr And Mid$(value,pos+1,1)=vbLf Then pos=pos+1
   End If
   start=pos+1
  End If
 Next
 bufferfree D(Gcells,id)
 D(Gcells,id)=fresh
 fresh=0
 Version id
 Invalidate id
 Exit Sub
Failed:
 code=Err.Number
 bufferfree fresh
 Err.Raise code
End Sub
Private Function FormatText(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long) As String
 Guard id,hwnd,epoch
 FormatText=buffertext(D(Gformat,id),0)
End Function
Private Sub FormatString(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal value As String)
 Dim col As Long, pos As Long, start As Long, count As Long, text As String, align As Long
 Guard id,hwnd,epoch
 If Len(value)=0 Then
  bufferwrite D(Gformat,id),0,value
  Exit Sub
 End If
 count=1
 For pos=1 To Len(value)
  If Mid$(value,pos,1)="|" Then count=count+1
 Next
 If count>D(Gcols,id) Then Resize id,hwnd,epoch,D(Grows,id),count,0,-1
 start=1
 col=0
 Do
  pos=InStr(start,value,"|")
  If pos=0 Then pos=Len(value)+1
  text=Mid$(value,start,pos-start)
  align=0
  If Left$(text,1)=">" Then align=1
  If Left$(text,1)="^" Then align=2
  If Left$(text,1)="<" Or Left$(text,1)=">" Or Left$(text,1)="^" Then text=Mid$(text,2)
  bufferput D(Galignment,id),col,align
  If D(Grows,id)>0 Then bufferwrite D(Gcells,id),col,text
  col=col+1
  start=pos+1
 Loop While pos<=Len(value)
 bufferwrite D(Gformat,id),0,value
 Version id
 Invalidate id
End Sub
Private Sub EnsureAxis(ByVal id As Long, ByVal axis As Long, ByVal target As Long)
 Dim fixed As Long, count As Long, field As Long, buffer As Long, available As Long
 Dim i As Long, total As Long, size As Long, first As Long
 If axis=0 Then
  fixed=D(Gfixedcols,id)
  count=D(Gcols,id)
  field=Gleftcol
  buffer=D(Gwidths,id)
  available=D(Gcachedwidth,id)
 Else
  fixed=D(Gfixedrows,id)
  count=D(Grows,id)
  field=Gtoprow
  buffer=D(Gheights,id)
  available=D(Gcachedheight,id)
 End If
 If target<fixed Or target>=count Or available<=0 Then Exit Sub
 For i=0 To fixed-1
  available=available-bufferget(buffer,i)
 Next
 If target<D(field,id) Then D(field,id)=target
 first=target
 total=bufferget(buffer,target)
 Do While first>fixed
  size=bufferget(buffer,first-1)
  If total+size>available Then Exit Do
  total=total+size
  first=first-1
 Loop
 If first>D(field,id) Then D(field,id)=first
End Sub
Private Sub SelectCell(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal row As Long, ByVal col As Long, ByVal extend As Long, ByVal clicked As Long)
 Dim flags As Long
 Guard id,hwnd,epoch
 If D(Grows,id)=0 Then Exit Sub
 row=Bounded(row,0,D(Grows,id)-1)
 col=Bounded(col,0,D(Gcols,id)-1)
 flags=clicked
 If extend=0 Then
  If row<>D(Grow,id) Or col<>D(Gcol,id) Then flags=flags Or 1
  D(Grow,id)=row
  D(Gcol,id)=col
 End If
 If row<>D(Growsel,id) Or col<>D(Gcolsel,id) Then flags=flags Or 2
 D(Growsel,id)=row
 D(Gcolsel,id)=col
 If D(Gselectionmode,id)=1 Then
  D(Gcol,id)=0
  D(Gcolsel,id)=D(Gcols,id)-1
 ElseIf D(Gselectionmode,id)=2 Then
  D(Grow,id)=0
  D(Growsel,id)=D(Grows,id)-1
 End If
 If row>=D(Gfixedrows,id) And row<D(Gtoprow,id) Then D(Gtoprow,id)=row
 If col>=D(Gfixedcols,id) And col<D(Gleftcol,id) Then D(Gleftcol,id)=col
 EnsureAxis id,1,row
 EnsureAxis id,0,col
 Notify id,flags
End Sub
Private Sub KeyMove(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal key As Long, ByVal extend As Long)
 Dim row As Long, col As Long, stepSize As Long
 Guard id,hwnd,epoch
 row=D(Growsel,id)
 col=D(Gcolsel,id)
 If key=37 Then col=col-1
 If key=39 Then col=col+1
 If key=38 Then row=row-1
 If key=40 Then row=row+1
 If key=36 Then col=D(Gfixedcols,id)
 If key=35 Then col=D(Gcols,id)-1
 stepSize=D(Gcachedheight,id) \\ 315
 If stepSize<1 Then stepSize=1
 If key=33 Then row=row-stepSize
 If key=34 Then row=row+stepSize
 SelectCell id,hwnd,epoch,row,col,extend,0
End Sub
Private Sub Scroll(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal axis As Long, ByVal command As Long, ByVal track As Long)
 Dim field As Long, value As Long, lo As Long, hi As Long, page As Long
 Guard id,hwnd,epoch
 If axis=0 Then
  field=Gleftcol
  lo=D(Gfixedcols,id)
  hi=D(Gcols,id)-1
  page=D(Gcachedwidth,id) \\ 1200
 Else
  field=Gtoprow
  lo=D(Gfixedrows,id)
  hi=D(Grows,id)-1
  page=D(Gcachedheight,id) \\ 315
 End If
 If page<1 Then page=1
 value=D(field,id)
 If command=0 Then value=value-1
 If command=1 Then value=value+1
 If command=2 Then value=value-page
 If command=3 Then value=value+page
 If command=4 Or command=5 Then value=track
 If command=6 Then value=lo
 If command=7 Then value=hi
 value=Bounded(value,lo,hi)
 If value=D(field,id) Then Exit Sub
 D(field,id)=value
 Notify id,4
End Sub
Private Sub Wheel(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal delta As Long)
 Dim ticks As Long
 Guard id,hwnd,epoch
 D(Gmousewheel,id)=D(Gmousewheel,id)+delta
 ticks=D(Gmousewheel,id) \\ 120
 D(Gmousewheel,id)=D(Gmousewheel,id)-ticks*120
 If ticks<>0 Then Scroll id,hwnd,epoch,1,5,D(Gtoprow,id)-ticks*3
End Sub
Private Function HitAxis(ByVal id As Long, ByVal axis As Long, ByVal coordinate As Long) As Long
 Dim count As Long, fixed As Long, first As Long, buffer As Long, index As Long, pos As Long, size As Long
 If axis=0 Then
  count=D(Gcols,id)
  fixed=D(Gfixedcols,id)
  first=D(Gleftcol,id)
  buffer=D(Gwidths,id)
 Else
  count=D(Grows,id)
  fixed=D(Gfixedrows,id)
  first=D(Gtoprow,id)
  buffer=D(Gheights,id)
 End If
 HitAxis=-1
 If coordinate<0 Then Exit Function
 index=0
 Do While index<count
  If index=fixed Then index=first
  If index>=count Then Exit Do
  size=bufferget(buffer,index)
  If coordinate>=pos And coordinate<pos+size Then
   HitAxis=index
   Exit Function
  End If
  pos=pos+size
  index=index+1
 Loop
End Function
Private Sub MouseSelect(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal x As Long, ByVal y As Long, ByVal extend As Long, ByVal clicked As Long)
 Dim row As Long, col As Long
 Guard id,hwnd,epoch
 row=HitAxis(id,1,y)
 col=HitAxis(id,0,x)
 If row<0 Or col<0 Then Exit Sub
 SelectCell id,hwnd,epoch,row,col,extend,clicked
End Sub
Private Sub Paint(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal dc As Long, ByVal width As Long, ByVal height As Long)
 Dim r As Long, c As Long, x As Long, y As Long, w As Long, h As Long, flags As Long
 Dim loR As Long, hiR As Long, loC As Long, hiC As Long, temp As Long, nr As Long, nc As Long
 Guard id,hwnd,epoch
 D(Gcachedwidth,id)=width
 D(Gcachedheight,id)=height
 If D(Gredraw,id)=0 Then Exit Sub
 loR=D(Grow,id)
 hiR=D(Growsel,id)
 loC=D(Gcol,id)
 hiC=D(Gcolsel,id)
 If loR>hiR Then
  temp=loR
  loR=hiR
  hiR=temp
 End If
 If loC>hiC Then
  temp=loC
  loC=hiC
  hiC=temp
 End If
 hostcolors hwnd,D(Gbackcolorfixed,id),D(Gforecolorfixed,id),D(Gbackcolorsel,id),D(Gforecolorsel,id),D(Ggridcolor,id)
 r=0
 Do While r<D(Grows,id) And y<height
  If r=D(Gfixedrows,id) Then r=D(Gtoprow,id)
  If r>=D(Grows,id) Then Exit Do
  h=bufferget(D(Gheights,id),r)
  x=0
  c=0
  nc=0
  Do While c<D(Gcols,id) And x<width And h>0
   If c=D(Gfixedcols,id) Then c=D(Gleftcol,id)
   If c>=D(Gcols,id) Then Exit Do
   w=bufferget(D(Gwidths,id),c)
   If w>0 Then
    flags=0
    If r<D(Gfixedrows,id) Or c<D(Gfixedcols,id) Then flags=1
    If r>=loR And r<=hiR And c>=loC And c<=hiC Then flags=flags Or 2
    If D(Ggridlines,id)<>0 Then flags=flags Or 4
    hostcell hwnd,dc,x,y,w,h,buffertext(D(Gcells,id),r*D(Gcols,id)+c),flags,bufferget(D(Galignment,id),c)
   End If
   x=x+w
   If c>=D(Gfixedcols,id) Then nc=nc+1
   c=c+1
  Loop
  y=y+h
  If r>=D(Gfixedrows,id) Then nr=nr+1
  r=r+1
 Loop
 hostbars hwnd,0,D(Gfixedcols,id),D(Gcols,id)-1,nc,D(Gleftcol,id),D(Gscrollbars,id) And 1
 hostbars hwnd,1,D(Gfixedrows,id),D(Grows,id)-1,nr,D(Gtoprow,id),D(Gscrollbars,id) And 2
End Sub
`;
}

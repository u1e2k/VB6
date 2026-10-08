/** Private chart data/plot kernel, compiled into x86, never shipped as source.
 * Rows/columns are one-based like MSChart. Finite doubles stay binary doubles.
 * Only the browser runtime's column/bar and line plots are supported here. */
export const NATIVE_CHART_FIELDS=Object.freeze({hwnd:0,epoch:1,rows:2,cols:3,row:4,col:5,data:6,rowlabels:7,collabels:8,redraw:9,charttype:10});
export const NATIVE_CHART_HOSTS=Object.freeze({
 buffernew:'ByVal count As Long, ByVal kind As Long',bufferfree:'ByVal handle As Long',
 buffertext:'ByVal handle As Long, ByVal offset As Long',bufferwrite:'ByVal handle As Long, ByVal offset As Long, ByVal value As String',
 numberget:'ByVal handle As Long, ByVal offset As Long',numberput:'ByVal handle As Long, ByVal offset As Long, ByVal value As Double',
 hostdraw:'ByVal hwnd As Long, ByVal dc As Long, ByVal kind As Long, ByVal x As Long, ByVal y As Long, ByVal right As Long, ByVal bottom As Long, ByVal text As String, ByVal color As Long',
 hostinvalidate:'ByVal hwnd As Long',finite:'ByVal value As Double'
});
export function nativeChartCoreSource(count){
 if(!Number.isInteger(count)||count<1||count>10000)throw new TypeError('Invalid native chart count');
 const fields=Object.entries(NATIVE_CHART_FIELDS).map(([name,n])=>`Private Const C${name} As Long=${n}`).join('\n');
 const hosts=Object.entries(NATIVE_CHART_HOSTS).map(([name,args])=>`Private Function ${name}(${args}) As ${name==='buffertext'?'String':name==='numberget'?'Double':'Long'}\nEnd Function`).join('\n');
 return `Option Explicit
${fields}
Private D(0 To 10,0 To ${count-1}) As Long
${hosts}
Private Sub Guard(ByVal id As Long,ByVal hwnd As Long,ByVal epoch As Long)
 If id<0 Or id>=${count} Then Err.Raise 340
 If hwnd=0 Or D(Chwnd,id)<>hwnd Or D(Cepoch,id)<>epoch Then Err.Raise 91
End Sub
Private Function Stamp(ByVal id As Long) As Long
 Stamp=D(Cepoch,id)
End Function
Private Sub Invalidate(ByVal id As Long)
 If D(Credraw,id)<>0 Then hostinvalidate D(Chwnd,id)
End Sub
Private Sub Dispose(ByVal id As Long)
 If id<0 Or id>=${count} Then Err.Raise 340
 D(Chwnd,id)=0
 bufferfree D(Cdata,id)
 bufferfree D(Crowlabels,id)
 bufferfree D(Ccollabels,id)
 D(Cdata,id)=0
 D(Crowlabels,id)=0
 D(Ccollabels,id)=0
End Sub
Private Sub Initialize(ByVal id As Long,ByVal hwnd As Long,ByVal rows As Long,ByVal cols As Long)
 Dim epoch As Long,code As Long
 Dispose id
 epoch=D(Cepoch,id)
 If epoch=2147483647 Then epoch=0
 D(Cepoch,id)=epoch+1
 D(Chwnd,id)=hwnd
 D(Crows,id)=0
 D(Ccols,id)=0
 D(Credraw,id)=0
 D(Ccharttype,id)=1
 D(Crow,id)=1
 D(Ccol,id)=1
 On Error GoTo Failed
 Resize id,hwnd,D(Cepoch,id),rows,cols
 D(Credraw,id)=-1
 Exit Sub
Failed:
 code=Err.Number
 Dispose id
 Err.Raise code
End Sub
Private Sub Resize(ByVal id As Long,ByVal hwnd As Long,ByVal epoch As Long,ByVal rows As Long,ByVal cols As Long)
 Dim values As Long,rl As Long,cl As Long,r As Long,c As Long,code As Long
 Guard id,hwnd,epoch
 If rows<0 Or rows>10000 Or cols<0 Or cols>10000 Then Err.Raise 380
 If rows>0 Then
  If cols>1048576 \\ rows Then Err.Raise 7
 End If
 On Error GoTo Failed
 values=buffernew(rows*cols,5)
 rl=buffernew(rows,8)
 cl=buffernew(cols,8)
 For r=0 To rows-1
  If r<D(Crows,id) Then
   bufferwrite rl,r,buffertext(D(Crowlabels,id),r)
   For c=0 To cols-1
    If c<D(Ccols,id) Then numberput values,r*cols+c,numberget(D(Cdata,id),r*D(Ccols,id)+c)
   Next
  End If
 Next
 For c=0 To cols-1
  If c<D(Ccols,id) Then bufferwrite cl,c,buffertext(D(Ccollabels,id),c)
 Next
 bufferfree D(Cdata,id)
 bufferfree D(Crowlabels,id)
 bufferfree D(Ccollabels,id)
 D(Cdata,id)=values
 D(Crowlabels,id)=rl
 D(Ccollabels,id)=cl
 D(Crows,id)=rows
 D(Ccols,id)=cols
 If D(Crow,id)>rows Then D(Crow,id)=rows
 If D(Crow,id)<1 Then D(Crow,id)=1
 If D(Ccol,id)>cols Then D(Ccol,id)=cols
 If D(Ccol,id)<1 Then D(Ccol,id)=1
 Invalidate id
 Exit Sub
Failed:
 code=Err.Number
 On Error Resume Next
 bufferfree values
 bufferfree rl
 bufferfree cl
 On Error GoTo 0
 Err.Raise code
End Sub
Private Function GetField(ByVal id As Long,ByVal hwnd As Long,ByVal epoch As Long,ByVal field As Long) As Long
 Guard id,hwnd,epoch
 GetField=D(field,id)
End Function
Private Sub SetField(ByVal id As Long,ByVal hwnd As Long,ByVal epoch As Long,ByVal field As Long,ByVal value As Long)
 Guard id,hwnd,epoch
 If field=Crows Then
  Resize id,hwnd,epoch,value,D(Ccols,id)
  Exit Sub
 ElseIf field=Ccols Then
  Resize id,hwnd,epoch,D(Crows,id),value
  Exit Sub
 ElseIf field=Crow Then
  If value<1 Or value>D(Crows,id) Then Err.Raise 380
 ElseIf field=Ccol Then
  If value<1 Or value>D(Ccols,id) Then Err.Raise 380
 ElseIf field=Ccharttype Then
  If value<>1 And value<>3 Then Err.Raise 380
 ElseIf field=Credraw Then
  value=CBool(value)
 Else
  Err.Raise 380
 End If
 D(field,id)=value
 Invalidate id
End Sub
Private Function Position(ByVal id As Long) As Long
 If D(Crow,id)<1 Or D(Crow,id)>D(Crows,id) Or D(Ccol,id)<1 Or D(Ccol,id)>D(Ccols,id) Then Err.Raise 381
 Position=(D(Crow,id)-1)*D(Ccols,id)+D(Ccol,id)-1
End Function
Private Function GetData(ByVal id As Long,ByVal hwnd As Long,ByVal epoch As Long) As Double
 Guard id,hwnd,epoch
 GetData=numberget(D(Cdata,id),Position(id))
End Function
Private Sub SetData(ByVal id As Long,ByVal hwnd As Long,ByVal epoch As Long,ByVal value As Double)
 Guard id,hwnd,epoch
 If finite(value)=0 Then Err.Raise 5
 numberput D(Cdata,id),Position(id),value
 Invalidate id
End Sub
Private Function GetLabel(ByVal id As Long,ByVal hwnd As Long,ByVal epoch As Long,ByVal field As Long) As String
 Dim index As Long
 Guard id,hwnd,epoch
 index=D(Crow,id)-1
 If field=Ccollabels Then index=D(Ccol,id)-1
 GetLabel=buffertext(D(field,id),index)
End Function
Private Sub SetLabel(ByVal id As Long,ByVal hwnd As Long,ByVal epoch As Long,ByVal field As Long,ByVal value As String)
 Dim index As Long
 Guard id,hwnd,epoch
 index=D(Crow,id)-1
 If field=Ccollabels Then index=D(Ccol,id)-1
 bufferwrite D(field,id),index,value
 Invalidate id
End Sub
Private Function YPoint(ByVal value As Double,ByVal magnitude As Double,ByVal low As Double,ByVal span As Double,ByVal top As Long,ByVal bottom As Long) As Long
 Dim ratio As Double
 ratio=(value/magnitude-low)/span
 If ratio<0 Then ratio=0
 If ratio>1 Then ratio=1
 YPoint=bottom-CLng(ratio*(bottom-top))
End Function
Private Sub Paint(ByVal id As Long,ByVal hwnd As Long,ByVal epoch As Long,ByVal dc As Long,ByVal width As Long,ByVal height As Long)
 Dim r As Long,c As Long,rows As Long,cols As Long,x As Long,y As Long,previousX As Long,previousY As Long,color As Long
 Dim left As Long,right As Long,top As Long,bottom As Long,zero As Long,unit As Double,seriesWidth As Double
 Dim value As Double,lo As Double,hi As Double,magnitude As Double,low As Double,span As Double,text As String
 Guard id,hwnd,epoch
 If D(Credraw,id)=0 Or width<=80 Or height<=50 Then Exit Sub
 rows=D(Crows,id)
 cols=D(Ccols,id)
 left=34
 right=width-16
 top=18
 bottom=height-24
 hi=0
 lo=0
 For r=0 To rows-1
  For c=0 To cols-1
   value=numberget(D(Cdata,id),r*cols+c)
   If value>hi Then hi=value
   If value<lo Then lo=value
  Next
 Next
 magnitude=hi
 If -lo>magnitude Then magnitude=-lo
 If magnitude=0 Then magnitude=1
 low=lo/magnitude
 span=hi/magnitude-low
 If span=0 Then span=1
 zero=YPoint(0,magnitude,low,span,top,bottom)
 For r=0 To 4
  y=bottom-((bottom-top)*r) \\ 4
  hostdraw hwnd,dc,0,left,y,right,y,"",-2147483632
  value=(low+span*r/4)*magnitude
  hostdraw hwnd,dc,2,0,y-7,left-2,y+7,CStr(value),-2147483640
 Next
 hostdraw hwnd,dc,0,left,top,left,bottom,"",-2147483640
 hostdraw hwnd,dc,0,left,zero,right,zero,"",-2147483640
 If rows=0 Or cols=0 Then Exit Sub
 unit=(right-left)/CDbl(rows)
 seriesWidth=unit*0.7/CDbl(cols)
 For c=0 To cols-1
  color=((c*53+44) Mod 200)+((c*71+92) Mod 200)*256+((c*29+148) Mod 200)*65536
  For r=0 To rows-1
   value=numberget(D(Cdata,id),r*cols+c)
   y=YPoint(value,magnitude,low,span,top,bottom)
   x=left+CLng((r+0.5)*unit)
   If D(Ccharttype,id)=3 Then
    If r>0 Then hostdraw hwnd,dc,0,previousX,previousY,x,y,"",color
    hostdraw hwnd,dc,1,x-2,y-2,x+3,y+3,"",color
   Else
    x=left+CLng(r*unit+unit*0.15+c*seriesWidth)
    If y<zero Then
     hostdraw hwnd,dc,1,x,y,x+CLng(seriesWidth),zero,"",color
    Else
     hostdraw hwnd,dc,1,x,zero,x+CLng(seriesWidth),y,"",color
    End If
   End If
   previousX=x
   previousY=y
   If c=0 Then
    text=buffertext(D(Crowlabels,id),r)
    If Len(text)=0 Then text=CStr(r+1)
    hostdraw hwnd,dc,2,left+CLng(r*unit),bottom+4,left+CLng((r+1)*unit),height,text,-2147483640
   End If
  Next
 Next
End Sub
`;}

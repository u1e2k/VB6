import {project} from './migration-fixtures.mjs';

export const SETTER_ORDER_FIXTURE=project(`Option Explicit
Public Trace As String
Public Cell As OrderedCell
Public Other As OrderedCell
Public Sub Main()
Set Cell=New OrderedCell
Set Other=New OrderedCell
GetCell().Item(b:=Mark(2), a:=Mark(1))=Mark(3)
Debug.Print Trace
Debug.Print Cell.Item(0,0)
Trace=""
Dim index As Long
index=1
GetCell().Mutable(b:=index, a:=index)=Mark(4)
Debug.Print Trace
Debug.Print index
Debug.Print Cell.Item(0,0)
Trace=""
GetCell().Link(b:=Mark(2), a:=Mark(1))=Mark(7)
Debug.Print Trace
Debug.Print Cell.LetCount
Trace=""
Set GetCell().Link(b:=Mark(4), a:=Mark(3))=ObjectValue()
Debug.Print Trace
Debug.Print Cell.SetCount
Dim value As OrderedCell
Set value=Cell.Link(0,0)
Debug.Print value Is Other
Trace=""
On Error Resume Next
GetCell().Item(b:=Fail(), a:=Mark(1))=Mark(3)
Debug.Print Trace
Debug.Print Err.Number
End Sub
Public Function GetCell() As OrderedCell
Trace=Trace & "R"
Set GetCell=Cell
End Function
Public Function Mark(ByVal number As Long) As Long
Trace=Trace & CStr(number)
Mark=number
End Function
Public Function ObjectValue() As OrderedCell
Trace=Trace & "O"
Set ObjectValue=Other
End Function
Public Function Fail() As Long
Trace=Trace & "X"
Err.Raise 5
End Function`);
SETTER_ORDER_FIXTURE.modules.push({name:'OrderedCell',kind:'class',code:`Option Explicit
Private stored As Long
Private reference As OrderedCell
Public LetCount As Long
Public SetCount As Long
Public Property Get Item(ByVal a As Long, ByVal b As Long) As Long
Item=stored
End Property
Public Property Let Item(ByVal a As Long, ByVal b As Long, ByVal amount As Long)
stored=a*100+b*10+amount
End Property
Public Property Let Mutable(ByRef a As Long, ByRef b As Long, ByVal amount As Long)
a=a+10
b=b+20
stored=amount
End Property
Public Property Get Link(ByVal a As Long, ByVal b As Long) As Variant
Set Link=reference
End Property
Public Property Let Link(ByVal a As Long, ByVal b As Long, ByVal amount As Variant)
LetCount=LetCount+1
stored=amount
End Property
Public Property Set Link(ByVal a As Long, ByVal b As Long, ByVal amount As Variant)
SetCount=SetCount+1
Set reference=amount
End Property`});
export const SETTER_ORDER_EXPECTED=['R213','123','R4','31','4','R217','1','R43O','1','True','RX','5'];

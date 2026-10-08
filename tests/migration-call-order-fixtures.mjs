import {project} from './migration-fixtures.mjs';

export const CALL_ORDER_FIXTURE = project(`Option Explicit
Public Trace As String
Public Sub Main()
Debug.Print Combine(second:=Mark(2), first:=Mark(1))
Debug.Print Trace
Trace=""
Debug.Print MakeCalculator().Sum(second:=Mark(4), first:=Mark(3))
Debug.Print Trace
Trace=""
Debug.Print SumWide(c:=Mark(3), a:=Mark(1))
Debug.Print Trace
Trace=""
While Combine(second:=Mark(2), first:=Mark(1)) < 0
Debug.Print "unreachable"
Wend
Debug.Print Trace
Trace=""
If False Then Debug.Print Combine(second:=Mark(2), first:=Mark(1))
Debug.Print "[" & Trace & "]"
Dim value As Long
On Error Resume Next
value=1
Mutate second:=value, first:=value
Debug.Print value
Debug.Print Err.Number
value=1
Mutate second:=(value), first:=value
Debug.Print value
Trace=""
Debug.Print Combine(second:=Fail(), first:=Mark(1))
Debug.Print "[" & Trace & "]"
End Sub
Public Function Combine(ByVal first As Long, ByVal second As Long) As Long
Combine=first*10+second
End Function
Public Function SumWide(Optional ByVal a As Long=1, Optional ByVal b As Long=2, Optional ByVal c As Long=3) As Long
SumWide=a+b+c
End Function
Public Function Mark(ByVal number As Long) As Long
Trace=Trace & CStr(number)
Mark=number
End Function
Public Function MakeCalculator() As Calculator
Trace=Trace & "R"
Set MakeCalculator=New Calculator
End Function
Public Sub Mutate(ByRef first As Long, ByRef second As Long)
first=7
second=second+1
Err.Raise 5
End Sub
Public Function Fail() As Long
Trace=Trace & "F"
Err.Raise 5
End Function`);
CALL_ORDER_FIXTURE.modules.push({name:'Calculator',kind:'class',code:`Public Function Sum(ByVal first As Long, ByVal second As Long) As Long
Sum=first*10+second
End Function`});
export const CALL_ORDER_EXPECTED = ['12','21','34','R43','6','31','21','[]','8','5','7','[F]'];

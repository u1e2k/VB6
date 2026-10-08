import {lifetimeModules} from './lifetimes.mjs';
import {interfaceModules} from './interfaces.mjs';
export function conformanceProject() {
  return {schema:1,name:'NativeConformance',startup:'Sub Main',modules:[...interfaceModules(),...lifetimeModules(),
    {name:'Counter',kind:'class',code:`Option Explicit
Private n As Long
Public Property Get Value() As Long
  Value = n
End Property
Public Property Let Value(ByVal x As Long)
  n = x
End Property`},
    {name:'MainModule',kind:'module',code:`Option Explicit
Private Sub Bump(ByRef x As Long)
  x = x + 1
End Sub
Private Function Sum(ByVal first As Long, Optional ByVal second As Long = 4) As Long
  Sum = first + second
End Function
Public Sub Main()
  Dim n As Long
  n = 10
  Bump n
  Debug.Assert n = 11
  Debug.Assert Sum(second:=8, first:=3) = 11
  Debug.Assert Sum(7) = 11
  Dim xs() As Long
  ReDim xs(1 To 2, 3 To 4)
  xs(2, 4) = 19
  ReDim Preserve xs(1 To 2, 3 To 5)
  Debug.Assert xs(2, 4) = 19
  Dim c As Counter
  Set c = New Counter
  c.Value = 41
  Debug.Assert c.Value = 41
  Debug.Assert CDec("0.1") + CDec("0.2") = CDec("0.3")
  Debug.Assert CInt(2.5) = 2
  Debug.Assert CInt(3.5) = 4
  On Error Resume Next
  Err.Raise 11
  Debug.Assert Err.Number = 11
  Err.Clear
  On Error GoTo 0
  Dim file As Integer, value As Long
  file = FreeFile
  Open "native-conformance.bin" For Binary As #file
  Put #file, , n
  Seek #file, 1
  Get #file, , value
  Close #file
  Kill "native-conformance.bin"
  Debug.Assert value = 11
  CheckNativeInterfaces
  CheckNativeLifetimes
  Debug.Print "NATIVE_CONFORMANCE_OK"
End Sub`}
  ]};
}

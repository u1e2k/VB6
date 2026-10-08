import {project} from './migration-fixtures.mjs';

export const OPTIONAL_FIXTURE=project(`Option Explicit
Private Trace As String
Private Const LocalDefault As Currency = 2.3456@
Public Sub Main()
Dim total As Currency
Debug.Print CStr(Price())
Debug.Print CStr(Price)
Debug.Print CStr(Price(3@))
Debug.Print CStr(Price(,4@))
Debug.Print CStr(Price(extra:=5@))
Debug.Print CStr(Price(extra:=Mark(2), amount:=Mark(1)))
Debug.Print Trace
Debug.Print CStr(Price(extra:=7))
Debug.Print CStr(Probe())
Debug.Print CStr(Probe())
Probe total
Debug.Print CStr(total)
Describe
End Sub
Public Function Price(Optional ByVal amount As Currency = LocalDefault, Optional ByVal extra As Currency = 1@) As Currency
Price=amount+extra
End Function
Private Function Mark(ByVal number As Long) As Currency
Trace=Trace & CStr(number)
Mark=number
End Function
Private Function Probe(Optional ByRef amount As Currency = 9.1234@) As Currency
amount=amount+1@
Probe=amount
End Function
Private Sub Describe(Optional ByVal amount As Currency = 0@, Optional ByVal name As String = "local", Optional ByVal missing As Variant)
Debug.Print name
Debug.Print IsMissing(missing)
End Sub`);
export const OPTIONAL_EXPECTED=['3.3456','3.3456','4','6.3456','7.3456','3','21','9.3456','10.1234','10.1234','1','local','True'];

export const OPTIONAL_INTERFACE_FIXTURE={name:'OptionalContracts',startup:'Sub Main',settings:{},modules:[
{name:'Module1',kind:'module',code:`Public Sub Main()
Dim c As Contract, n As Currency
Set c=New Implementation
Debug.Print CStr(c.Amount())
Debug.Print CStr(c.Amount(n))
Debug.Print CStr(n)
End Sub`},
{name:'Contract',kind:'class',code:`Public Function Amount(Optional ByRef value As Currency = 6.7891@) As Currency
End Function`},
{name:'Implementation',kind:'class',code:`Implements Contract
Private Function Contract_Amount(Optional ByRef value As Currency = 6.7891@) As Currency
value=value+1@
Contract_Amount=value
End Function`}]};
export const OPTIONAL_INTERFACE_EXPECTED=['7.7891','1','1'];

import {project} from './migration-fixtures.mjs';
export const FILE_ORDER_FIXTURE = project(`Option Explicit
Public Trace As String
Public Channel As Integer
Public Cell As StorageCell
Public Type Payload
    Code As Long
End Type
Public Sub Main()
    Set Cell = New StorageCell
    Channel = FreeFile
    Open "ordered.bin" For Binary As #Channel
    Put #Handle(), Position(1), Storage().Number
    Debug.Print Trace
    Trace=""
    Put #Handle(), Position(5), Storage().Money
    Debug.Print Trace
    Trace=""
    Put #Handle(), Position(13), Storage().Text
    Debug.Print Trace
    Trace=""
    Put #Handle(), Position(17), Storage().Row
    Debug.Print Trace
    Trace=""
    Get #Handle(), Position(1), Storage().Number
    Debug.Print Trace
    Debug.Print Cell.Number
    Trace=""
    Get #Handle(), Position(5), Storage().Money
    Debug.Print Trace
    Debug.Print CStr(Cell.Money)
    Trace=""
    Get #Handle(), Position(13), Storage().Text
    Debug.Print Trace
    Debug.Print "[" & Cell.Text & "]"
    Trace=""
    Get #Handle(), Position(17), Storage().Row
    Debug.Print Trace
    Debug.Print Cell.Row.Code
    Trace=""
    On Error Resume Next
    Get #Handle(), BadPosition(), Storage().Number
    Debug.Print Trace
    Debug.Print Err.Number
    Close #Channel
End Sub
Public Function Handle() As Integer
    Trace=Trace & "H"
    Handle=Channel
End Function
Public Function Position(ByVal offset As Long) As Long
    Trace=Trace & "P"
    Cell.Number=16909060
    Cell.Money=-12.3456@
    Cell.Text="AB"
    Cell.Row.Code=84281096
    Position=offset
End Function
Public Function BadPosition() As Long
    Trace=Trace & "X"
    Err.Raise 5
End Function
Public Function Storage() As StorageCell
    Trace=Trace & "S"
    Set Storage=Cell
End Function`);
FILE_ORDER_FIXTURE.modules.push({name:'StorageCell',kind:'class',code:`Public Number As Long
Public Money As Currency
Public Text As String * 4
Public Row As Payload`});
export const FILE_ORDER_EXPECTED = ['HPS','HPS','HPS','HPS','HPS','16909060','HPS','-12.3456','HPS','[AB  ]','HPS','84281096','HX','5'];
export const FILE_ORDER_BYTES = '04030201c01dfeffffffffff4142202008070605';

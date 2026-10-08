import {project} from './migration-fixtures.mjs';

export const FILE_RECORD_FIXTURE=project(`Option Explicit
Private Const Width As Long = 4
Public Type Coordinates
X As Long
Y As Integer
End Type
Public Type Record
Flag As Boolean
Point As Coordinates
Name As String * Width
End Type
Public Sub Main()
Dim file As Integer
Dim enabled As Boolean
Dim text As String * Width
Dim money As Currency
Dim row As Record, loaded As Record
file=FreeFile
Open "scalar.bin" For Binary As #file
enabled=True
text="AB"
money=-12.3456@
Put #file, , enabled
Put #file, , text
Put #file, , money
enabled=False
text=""
money=0
Get #file, 1, enabled
Get #file, , text
Get #file, , money
Close #file
Debug.Print enabled
Debug.Print "[" & text & "]"
Debug.Print CStr(money)
row.Flag=True
row.Point.X=16909060
row.Point.Y=258
row.Name="CD"
Debug.Print Len(row)
Open "record.bin" For Random As #file Len=12
Put #file, 2, row
Get #file, 2, loaded
Close #file
Debug.Print loaded.Flag
Debug.Print loaded.Point.X
Debug.Print loaded.Point.Y
Debug.Print "[" & loaded.Name & "]"
End Sub`);
export const FILE_RECORD_EXPECTED=['True','[AB  ]','-12.3456','12','True','16909060','258','[CD  ]'];

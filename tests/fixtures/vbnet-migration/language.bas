Attribute VB_Name = "LanguageChecks"
Option Explicit
Option Base 1
Option Compare Text
Public Function SumTo(ByVal n As Long) As Long
    Dim index As Long
    For index = 1 To n
        SumTo = SumTo + index
    Next index
End Function
Public Function Factorial(ByVal n As Integer) As Long
    If n <= 1 Then
        Factorial = 1
    Else
        Factorial = n * Factorial(n - 1)
    End If
End Function
Public Function ArrayCheck() As Long
    Dim values() As Long
    Dim clone() As Long
    ReDim values(-2 To 0, 1 To 2)
    values(-2, 1) = 11
    values(0, 2) = 23
    ReDim Preserve values(-2 To 0, 1 To 3)
    clone = values
    clone(0, 2) = 99
    ArrayCheck = values(-2, 1) + values(0, 2) + UBound(values, 2) + LBound(values, 1)
End Function
Public Function FixedStringCheck() As String
    Dim text As String * 5
    text = "abc"
    Mid$(text, 2, 1) = "Z"
    FixedStringCheck = text
End Function
Private Sub Increment(ByRef value As Long)
    value = value + 1
End Sub
Public Function ByRefCheck() As Long
    Dim value As Long
    value = 4
    Call Increment(value)
    Increment (value)
    ByRefCheck = value
End Function
Public Function OptionalCheck(Optional value As Variant, Optional ByVal count As Long = 2) As Long
    If IsMissing(value) Then
        OptionalCheck = count
    Else
        OptionalCheck = count + CLng(value)
    End If
End Function
Public Function InvokeOptional() As Long
    InvokeOptional = OptionalCheck() + OptionalCheck(3) + OptionalCheck(count:=5)
End Function
Public Function ErrorCheck() As Long
    On Error GoTo failed
    Error 5
    Exit Function
failed:
    ErrorCheck = Err.Number
    Resume done
done:
    ErrorCheck = ErrorCheck + 100
End Function
Public Function GoSubCheck() As Long
    Dim value As Long
    GoSub increment
    GoSub twice
    GoSub increment
    GoSubCheck = value
    Exit Function
increment:
    value = value + 1
    Return
twice:
    GoSub increment
    GoSub increment
    Return
End Function
Public Function StaticCheck() As Long
    Static count As Long
    count = count + 1
    StaticCheck = count
End Function
Public Function SelectCheck(ByVal value As Long) As Long
    Select Case value
        Case 1 To 3
            SelectCheck = 10
        Case 4, 7
            SelectCheck = 20
        Case Is > 10
            SelectCheck = 30
        Case Else
            SelectCheck = 40
    End Select
End Function
Public Function VariantCheck() As Boolean
    Dim value As Variant
    value = Null
    VariantCheck = IsNull(value + 1) And IsNull(value = Null)
End Function
Public Function LoopCheck() As Long
    Dim value As Long
    Do While value < 3
        value = value + 1
    Loop
    While value < 5
        value = value + 1
    Wend
    Do
        value = value - 1
    Loop Until value = 2
    LoopCheck = value
End Function

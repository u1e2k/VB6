import {project} from './migration-fixtures.mjs';

export const VARIANT_ARRAY_FIXTURE = project(`Option Explicit
Option Base 1
Private Trace As String
Public Sub Main()
    Dim a As Variant, b As Variant
    ReDim a(Mark(1, -1) To Mark(2, 1), Mark(3, 2) To Mark(4, 3)) As Long
    Debug.Print Trace
    a(-1, 2) = 11
    a(1, 3) = 29
    ReDim Preserve a(-1 To 1, 2 To 4)
    Debug.Print a(-1, 2)
    Debug.Print a(1, 3)
    Debug.Print a(1, 4)
    Debug.Print VarType(a)
    Debug.Print TypeName(a)
    b = a
    b(-1, 2) = 99
    Debug.Print a(-1, 2)
    EditCopy a
    Debug.Print a(-1, 2)
    EditReference a
    Debug.Print a(-1, 2)
    On Error Resume Next
    ReDim Preserve a(-2 To 1, 2 To 4)
    Debug.Print Err.Number
    Err.Clear
    Debug.Print LBound(a)
    Debug.Print a(-1, 2)
    ReDim Preserve a(-1 To 1, 2 To 4) As String
    Debug.Print Err.Number
    Err.Clear
    Debug.Print VarType(a)
    Erase a
    Debug.Print IsArray(a)
    Debug.Print VarType(a)
    Debug.Print UBound(a)
    Debug.Print Err.Number
    Err.Clear
    ReDim a(2)
    Debug.Print LBound(a)
    Debug.Print VarType(a)
    Debug.Print a(1)
    ReDim a(0 To 1) As String
    Debug.Print TypeName(a)
    Debug.Print Len(a(0))
    a(0) = "text"
    Debug.Print a(0)
    a = Array(Array(1, 2), 3)
    b = a
    b(1)(1) = 40
    Debug.Print a(1)(1)
    Debug.Print b(1)(1)
    Erase a
    Debug.Print VarType(a)
    a = Split("one,two", ",")
    ReDim Preserve a(0 To 2)
    Debug.Print Join(a, "|")
    Debug.Print VarType(a)
End Sub
Private Function Mark(ByVal digit As Long, ByVal value As Long) As Long
    Trace = Trace & CStr(digit)
    Mark = value
End Function
Private Sub EditCopy(ByVal a As Variant)
    a(-1, 2) = 80
End Sub
Private Sub EditReference(ByRef a As Variant)
    a(-1, 2) = 22
End Sub`);
export const VARIANT_ARRAY_EXPECTED = ['1234','11','29','0','8195','Long()','11','11','22','9','-1','22','13','8195','True','8195','9','1','8195','0','String()','0','text','1','40','8204','one|two|','8200'];

export const CURRENCY_LOOP_FIXTURE = project(`Option Explicit
Private Calls As Long
Public Sub Main()
    Dim counter As Currency, total As Currency
    For counter = Bound(1) To Bound(2) Step Bound(.25)
        total = total + counter
    Next counter
    Debug.Print Calls
    Debug.Print CStr(total)
    Debug.Print CStr(counter)
    total = 0
    For counter = 3 To 1 Step -1
        total = total + counter
    Next counter
    Debug.Print CStr(total)
    Debug.Print CStr(counter)
    total = 0
    For counter = 1 To 3
        total = total + counter
    Next counter
    Debug.Print CStr(total)
    For counter = 1 To 3 Step 0
        Debug.Print CStr(counter)
        Exit For
    Next counter
    For counter = 5 To 2
        Debug.Print "wrong"
    Next counter
    Debug.Print CStr(counter)
End Sub
Private Function Bound(ByVal value As Currency) As Currency
    Calls = Calls + 1
    Bound = value
End Function`);
export const CURRENCY_LOOP_EXPECTED = ['3','7.5','2.25','6','0','6','1','5'];

export const SELECT_CASE_FIXTURE = project(`Option Explicit
Option Compare Text
Private Calls As Long
Public Sub Main()
    Select Case Pick(2)
    Case Null
        Debug.Print "wrong-null"
    Case 1 To 3, Pick(99)
        Debug.Print "range"
        Select Case "A"
        Case "a"
            Debug.Print "nested-text"
        End Select
    Case Else
        Debug.Print "wrong-else"
    End Select
    Debug.Print Calls
    Select Case Pick(Null)
    Case 0, "", Null
        Debug.Print "wrong-null-match"
    Case Else
        Debug.Print "null-else"
    End Select
    Select Case 2
    Case Pick(Null), Pick(2), Pick(999)
        Debug.Print "mixed"
    End Select
    Debug.Print Calls
    Select Case Pick("ALPHA")
    Case "alpha"
        Debug.Print "variant-text"
    End Select
    Select Case Pick(9)
    Case Is < 2
        Debug.Print "wrong-compare"
    Case Is >= 8
        Debug.Print "compare"
    End Select
    Calls = 0
    Select Case 0
    Case 1 To RangeEnd()
        Debug.Print "wrong-range"
    Case Else
        Debug.Print "range-eager"
    End Select
    Debug.Print Calls
End Sub
Private Function RangeEnd() As Long
    Calls = Calls + 1
    RangeEnd = 5
End Function
Private Function Pick(ByVal value As Variant) As Variant
    Calls = Calls + 1
    Pick = value
End Function`);
export const SELECT_CASE_EXPECTED = ['range','nested-text','1','null-else','mixed','4','variant-text','compare','range-eager','1'];

// Direct runtime contracts isolate storage/boxing from source lowering and exercise CLR arrays.
export const ARRAY_RUNTIME_SOURCE = `Option Strict On
Imports System
Imports System.Collections
Imports VB6.Compatibility
Public Module Module1
    Private Sub Check(condition As Boolean, message As String)
        If Not condition Then Throw New Exception(message)
    End Sub
    Private Sub Fails(Of T As Exception)(action As Action, message As String)
        Try
            action()
        Catch ex As Exception
            If TypeOf ex Is T Then Return
            Throw
        End Try
        Throw New Exception(message)
    End Sub
    Friend Sub __vbStart()
        Dim bounds = VbArrayBounds.FromPairs(-1, 1)
        Dim a = VbArrays.ResizeVariant(Nothing, bounds, False, GetType(Integer))
        VbArrays.Element(a, New Object() {-1S}).Value = "21"
        Check(CInt(VbArrays.Element(a, New Object() {-1}).Value) = 21, "Coercion")
        Fails(Of OverflowException)(Sub() VbArrays.Element(a, New Object() {0}).Value = 2147483648D, "Integer overflow")
        Check(CInt(VbArrays.Element(a, New Object() {0}).Value) = 0, "Atomic element assignment")
        Fails(Of IndexOutOfRangeException)(Sub() VbArrays.Element(a, New Object() {3}).Value = 1, "Bounds")
        Fails(Of IndexOutOfRangeException)(Sub() VbArrays.ResizeVariant(a, VbArrayBounds.FromPairs(-2, 1), True), "Preserve lower bound")
        Fails(Of InvalidCastException)(Sub() VbArrays.ResizeVariant(a, bounds, True, GetType(String)), "Preserve type")
        Check(CInt(VbArrays.Element(a, New Object() {-1}).Value) = 21, "Failed resize changed value")
        Dim erased = VbArrays.EraseVariant(a)
        Check(VbRuntime.IsArray(erased) AndAlso VbRuntime.VarType(erased) = 8195, "Erased element type")
        Check(DirectCast(erased, IVbArray).Rank = 0, "Erased dimensions")
        Fails(Of InvalidCastException)(Sub() VbArrays.EraseVariant(7), "Erase scalar")
        Dim types = New Type() {GetType(Byte), GetType(Short), GetType(Integer), GetType(Single), GetType(Double), GetType(VbCurrency), GetType(String), GetType(Date), GetType(Boolean), GetType(Object)}
        Dim tags = New Integer() {17, 2, 3, 4, 5, 6, 8, 7, 11, 12}
        For i = 0 To types.Length - 1
            Dim typed = VbArrays.ResizeVariant(Nothing, bounds, False, types(i))
            Check(VbRuntime.VarType(typed) = (8192 Or tags(i)), "Element tag " & types(i).Name)
        Next
        Dim objects = VbArrays.ResizeVariant(Nothing, bounds, False, GetType(Object), True)
        Dim instance As New Object()
        VbArrays.Element(objects, New Object() {0}).Value = instance
        Check(Object.ReferenceEquals(VbArrays.Element(objects, New Object() {0}).Value, instance), "Object identity")
        Check(VbRuntime.VarType(objects) = 8201 AndAlso VbRuntime.TypeName(objects) = "Object()", "Object array tag")
        Fails(Of InvalidCastException)(Sub() VbArrays.Element(objects, New Object() {0}).Value = "not an object", "Object array scalar")
        Dim matrix = Global.System.Array.CreateInstance(GetType(Object), New Integer() {2, 2}, New Integer() {-1, 2})
        matrix.SetValue(10, -1, 2) : matrix.SetValue(20, 0, 2)
        matrix.SetValue(30, -1, 3) : matrix.SetValue(40, 0, 3)
        Dim resized = VbArrays.ResizeVariant(matrix, VbArrayBounds.FromPairs(-1, 0, 2, 4), True)
        Dim values As New Collections.Generic.List(Of String)
        For Each value In DirectCast(resized, IVbArray).Values()
            values.Add(If(value Is Nothing, "Empty", CStr(value)))
        Next
        Check(String.Join(",", values) = "10,20,30,40,Empty,Empty", "CLR coordinate import and VB column order")
        Dim nested = New Object() {New Integer() {1, 2}, instance}
        Dim copied = DirectCast(VbRuntime.CopyValue(nested), Object())
        DirectCast(copied(0), Integer())(0) = 99
        Check(DirectCast(nested(0), Integer())(0) = 1, "Nested CLR array copy")
        Check(Object.ReferenceEquals(copied(1), instance), "Copied object identity")
        Dim wrapper = VbRuntime.Array(New Object() {nested})
        DirectCast(wrapper(0), Object())(0) = Nothing
        Check(nested(0) IsNot Nothing, "Array constructor ownership")
        Console.WriteLine("arrays-runtime-ok")
    End Sub
End Module
`;

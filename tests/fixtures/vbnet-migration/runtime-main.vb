Option Explicit On
Option Strict On
Imports System
Imports System.Linq
Imports Vb6Migration.Runtime

Module RuntimeChecks
    Private checks As Integer
    Private Sub Assert(condition As Boolean, label As String)
        If Not condition Then Throw New Exception("Assertion failed: " & label)
        checks += 1
    End Sub
    Private Sub AssertError(number As Integer, action As Action, label As String)
        Try
            action()
        Catch ex As Exception
            Assert(Microsoft.VisualBasic.Information.Err().Number = number, label & " expected VB error " & number & ", got " & Microsoft.VisualBasic.Information.Err().Number)
            Microsoft.VisualBasic.Information.Err().Clear()
            Return
        End Try
        Throw New Exception("Expected error: " & label)
    End Sub
    Private Function OptionalMissing(<Global.System.Runtime.InteropServices.Optional> ByVal value As Object) As Boolean
        Return value Is Type.Missing
    End Function
    Public Sub Main()
        Assert(VbRuntime.ToInt16(2.5R) = 2S, "banker rounding down")
        Assert(VbRuntime.ToInt16(3.5R) = 4S, "banker rounding up")
        Assert(VbRuntime.ToInt32(True) = -1, "Boolean true representation")
        Assert(VbRuntime.Currency(1.23445D) = 1.2344D, "Currency scale and ties")
        Assert(VbRuntime.Currency(1.23455D) = 1.2346D, "Currency rounds even")
        AssertError(6, Sub() VbRuntime.Currency(922337203685477.5808D), "Currency range")
        AssertError(94, Sub() VbRuntime.ToText(DBNull.Value), "Null-to-string error")
        Assert(VbRuntime.IsNull(VbRuntime.Add(DBNull.Value, 1S)), "Null addition propagation")
        Assert(VbRuntime.IsNull(VbRuntime.Equal(DBNull.Value, DBNull.Value)), "Null comparison")
        Assert(Not VbRuntime.IsTrue(DBNull.Value), "Null condition")
        Assert(CInt(VbRuntime.BitAnd(DBNull.Value, 0S)) = 0, "Null And false")
        Assert(CInt(VbRuntime.BitOr(DBNull.Value, -1S)) = -1, "Null Or true")
        Assert(VbRuntime.IsNull(VbRuntime.BitXor(DBNull.Value, True)), "Null Xor")
        Assert(CInt(VbRuntime.Eqv(12S, 10S)) = -7, "Eqv")
        Assert(CInt(VbRuntime.Imp(12S, 10S)) = -5, "Imp")
        Assert(VbRuntime.ToDate(0) = New Date(1899, 12, 30), "OLE date zero")
        Assert(VbRuntime.DateLiteral("#12/31/2020#") = New Date(2020, 12, 31), "date literal")
        Assert(VbRuntime.VarType(1S) = 2S AndAlso VbRuntime.VarType(1) = 3S, "VB6 integral subtype ids")
        Assert(VbRuntime.TypeName(1S) = "Integer" AndAlso VbRuntime.TypeName(1) = "Long", "VB6 type names")
        Assert(VbRuntime.IsMissing(Type.Missing), "Missing sentinel")
        Assert(OptionalMissing(Type.Missing), "Generated source passes Missing explicitly")
        Assert(GetType(RuntimeChecks).GetMethod("OptionalMissing", Reflection.BindingFlags.NonPublic Or Reflection.BindingFlags.Static).GetParameters()(0).IsOptional, "Optional metadata is retained")
        Assert(Not OptionalMissing(Nothing), "Explicit Empty is not Missing")
        Assert(VbRuntime.IsError(VbRuntime.ErrorValue(7)), "CVErr sentinel")
        Assert(VbRuntime.FixedString("abcdef", 3) = "abc", "fixed string truncate")
        Assert(VbRuntime.FixedString("a", 3) = "a  ", "fixed string pad")
        Dim text As String = "abcdef"
        VbRuntime.MidAssign(text, 2, 3, "XY")
        Assert(text = "aXYdef", "Mid statement")
        Assert(VbRuntime.AlignString("ab", 5, True) = "   ab", "RSet")
        Dim grid As New VbArray(Of Integer)(New Integer() {-2, 1}, New Integer() {0, 2}, False)
        grid(-2, 1) = 11 : grid(-1, 1) = 12 : grid(0, 1) = 13
        grid(-2, 2) = 21 : grid(-1, 2) = 22 : grid(0, 2) = 23
        Assert(grid.SequenceEqual(New Integer() {11, 12, 13, 21, 22, 23}), "SAFEARRAY storage order")
        grid.Resize(New Integer() {-2, 1}, New Integer() {0, 3}, True)
        Assert(grid(0, 2) = 23 AndAlso grid(0, 3) = 0, "ReDim Preserve")
        Assert(grid.LowerBound(1) = -2 AndAlso grid.UpperBound(2) = 3, "explicit bounds")
        AssertError(9, Sub() grid.Resize(New Integer() {-1, 1}, New Integer() {0, 3}, True), "preserve lower-bound guard")
        Dim copy As VbArray(Of Integer) = grid.Copy()
        copy(-2, 1) = 99
        Assert(grid(-2, 1) = 11, "array value assignment isolation")
        AssertError(9, Sub() grid.UpperBound(0), "rank guard")
        grid.Erase()
        AssertError(9, Sub() grid.LowerBound(1), "dynamic Erase releases dimensions")
        Dim names As New VbArray(Of String)(New Integer() {1}, New Integer() {2}, True)
        Assert(names(1) = String.Empty, "string array defaults")
        names(1) = "value" : names.Erase()
        Assert(names(1) = String.Empty AndAlso names.LowerBound(1) = 1, "fixed Erase retains bounds")
        AssertError(10, Sub() names.Resize(New Integer() {1}, New Integer() {3}, False), "fixed resize guard")
        Dim dates As New VbArray(Of Date)(New Integer() {0}, New Integer() {0}, True)
        Assert(dates(0) = New Date(1899, 12, 30), "date array defaults")
        Dim values As VbArray(Of Object) = VbRuntime.ArrayOf(1S, "text")
        Assert(values.LowerBound(1) = 0 AndAlso values.UpperBound(1) = 1, "Array bounds")
        Assert(VbRuntime.VarType(values) = CShort(8192 Or 12), "Variant array type")
        Console.WriteLine("VB6_MIGRATION_RUNTIME_OK " & checks)
    End Sub
End Module

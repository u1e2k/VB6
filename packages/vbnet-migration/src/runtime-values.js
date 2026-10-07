/** Generated runtime source. Uses only .NET 10 framework assemblies, never the
 * obsolete Microsoft.VisualBasic.Compatibility or Microsoft VB6 runtime DLL. */
export const valueRuntime = `Option Explicit On
Option Strict On
Option Infer On
Imports System
Imports System.Globalization
Imports Microsoft.VisualBasic.CompilerServices

Namespace Global.Vb6Migration.Runtime
    Public Structure VbErrorValue
        Public ReadOnly Number As Integer
        Public Sub New(value As Integer)
            Number = value
        End Sub
    End Structure

    Public NotInheritable Class VbAutoNew(Of T As {Class, New})
        Private instance As T
        Public Property Value As T
            Get
                If instance Is Nothing Then instance = New T()
                Return instance
            End Get
            Set(value As T)
                instance = value
            End Set
        End Property
    End Class

    Public Module VbRuntime
        Public ReadOnly PrintZone As New Object()
        Public Sub RaiseError(number As Integer, Optional message As String = Nothing)
            Global.Microsoft.VisualBasic.Information.Err().Raise(number, "VB6 migration runtime", message)
        End Sub
        Private Function Scalar(value As Object) As Object
            If value Is DBNull.Value Then RaiseError(94, "Invalid use of Null")
            If TypeOf value Is VbErrorValue Then RaiseError(13, "Type mismatch")
            If value Is Type.Missing Then RaiseError(448, "Named argument not found")
            Return value
        End Function
        Public Function Identity(value As Object) As Object
            Return value
        End Function
        Public Function ToInt16(value As Object) As Short
            Return Conversions.ToShort(Scalar(value))
        End Function
        Public Function ToInt32(value As Object) As Integer
            Return Conversions.ToInteger(Scalar(value))
        End Function
        Public Function ToByte(value As Object) As Byte
            Return Conversions.ToByte(Scalar(value))
        End Function
        Public Function ToBoolean(value As Object) As Boolean
            Return Conversions.ToBoolean(Scalar(value))
        End Function
        Public Function ToSingle(value As Object) As Single
            Return Conversions.ToSingle(Scalar(value))
        End Function
        Public Function ToDouble(value As Object) As Double
            value = Scalar(value)
            If TypeOf value Is Date Then Return DirectCast(value, Date).ToOADate()
            Return Conversions.ToDouble(value)
        End Function
        Public Function ToDecimal(value As Object) As Decimal
            Return Conversions.ToDecimal(Scalar(value))
        End Function
        Public Function Currency(value As Object) As Decimal
            Dim result As Decimal = Decimal.Round(ToDecimal(value), 4, MidpointRounding.ToEven)
            If result < -922337203685477.5808D OrElse result > 922337203685477.5807D Then RaiseError(6, "Currency overflow")
            Return result
        End Function
        Public Function ToText(value As Object) As String
            Return If(Conversions.ToString(Scalar(value)), String.Empty)
        End Function
        Public Function ToDate(value As Object) As Date
            value = Scalar(value)
            If value Is Nothing Then Return Date.FromOADate(0)
            If TypeOf value Is Date Then Return DirectCast(value, Date)
            If TypeOf value Is String Then Return Conversions.ToDate(value)
            Return Date.FromOADate(ToDouble(value))
        End Function
        Public Function DateLiteral(value As String) As Date
            Dim result As Date
            If Not Date.TryParse(value.Trim("#"c), CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, result) Then RaiseError(13, "Invalid date literal")
            If Not value.Contains("/"c) AndAlso Not value.Contains("-"c) Then Return Date.FromOADate(0).Add(result.TimeOfDay)
            Return result
        End Function
        Public Function IsTrue(value As Object) As Boolean
            Return value IsNot DBNull.Value AndAlso ToBoolean(value)
        End Function
        Public Function IsNull(value As Object) As Boolean
            Return value Is DBNull.Value
        End Function
        Public Function IsEmpty(value As Object) As Boolean
            Return value Is Nothing
        End Function
        Public Function IsMissing(value As Object) As Boolean
            Return value Is Type.Missing
        End Function
        Public Function IsError(value As Object) As Boolean
            Return TypeOf value Is VbErrorValue
        End Function
        Public Function IsObject(value As Object) As Boolean
            Return value IsNot Nothing AndAlso value IsNot DBNull.Value AndAlso Not value.GetType().IsValueType AndAlso Not TypeOf value Is String AndAlso Not IsArray(value)
        End Function
        Public Function ErrorValue(number As Object) As Object
            Return New VbErrorValue(ToInt32(number))
        End Function
        Public Function VarType(value As Object) As Short
            If value Is Nothing Then Return 0S
            If value Is DBNull.Value Then Return 1S
            If TypeOf value Is VbErrorValue Then Return 10S
            If TypeOf value Is IVbArray Then Return CShort(8192 Or CInt(DirectCast(value, IVbArray).ElementVarType))
            If TypeOf value Is Array Then Return CShort(8192 Or 12)
            If TypeOf value Is Short Then Return 2S
            If TypeOf value Is Integer Then Return 3S
            If TypeOf value Is Single Then Return 4S
            If TypeOf value Is Double Then Return 5S
            If TypeOf value Is Decimal Then Return 14S
            If TypeOf value Is Date Then Return 7S
            If TypeOf value Is String Then Return 8S
            If TypeOf value Is Boolean Then Return 11S
            If TypeOf value Is Byte Then Return 17S
            Return 9S
        End Function
        Public Function TypeName(value As Object) As String
            If value Is Nothing Then Return "Empty"
            If value Is DBNull.Value Then Return "Null"
            If TypeOf value Is VbErrorValue Then Return "Error"
            If TypeOf value Is Short Then Return "Integer"
            If TypeOf value Is Integer Then Return "Long"
            If TypeOf value Is IVbArray Then Return DirectCast(value, IVbArray).ElementName & "()"
            Return Global.Microsoft.VisualBasic.Information.TypeName(value)
        End Function
        Public Function IsArray(value As Object) As Boolean
            Return TypeOf value Is IVbArray OrElse TypeOf value Is Array
        End Function
        Public Function LBound(value As Object, Optional dimension As Integer = 1) As Integer
            If TypeOf value Is IVbArray Then Return DirectCast(value, IVbArray).LowerBound(dimension)
            If TypeOf value Is Array Then Return DirectCast(value, Array).GetLowerBound(dimension - 1)
            RaiseError(13) : Return 0
        End Function
        Public Function UBound(value As Object, Optional dimension As Integer = 1) As Integer
            If TypeOf value Is IVbArray Then Return DirectCast(value, IVbArray).UpperBound(dimension)
            If TypeOf value Is Array Then Return DirectCast(value, Array).GetUpperBound(dimension - 1)
            RaiseError(13) : Return 0
        End Function
        Public Function ArrayOf(ParamArray values() As Object) As VbArray(Of Object)
            Dim result As New VbArray(Of Object)(New Integer() {0}, New Integer() {values.Length - 1}, False)
            For index As Integer = 0 To values.Length - 1
                result(index) = values(index)
            Next
            Return result
        End Function
        Public Function CloneArray(Of T)(value As VbArray(Of T)) As VbArray(Of T)
            Return If(value Is Nothing, Nothing, value.Copy())
        End Function
        Public Sub EraseArray(Of T)(ByRef value As VbArray(Of T))
            If value IsNot Nothing Then value.Erase()
        End Sub
        Public Function FixedString(value As Object, length As Integer) As String
            If length < 0 OrElse length > 65535 Then RaiseError(5)
            Dim text As String = ToText(value)
            Return If(text.Length > length, text.Substring(0, length), text.PadRight(length))
        End Function
        Public Function AlignString(value As Object, length As Integer, rightAligned As Boolean) As String
            Dim text As String = ToText(value)
            If text.Length > length Then Return text.Substring(0, length)
            Return If(rightAligned, text.PadLeft(length), text.PadRight(length))
        End Function
        Public Sub MidAssign(ByRef target As String, start As Integer, length As Integer, value As Object)
            Dim text As String = ToText(value)
            target = If(target, String.Empty)
            If start < 1 OrElse length < -1 Then RaiseError(5)
            Dim count As Integer = Math.Min(Math.Max(0, target.Length - start + 1), If(length < 0, text.Length, Math.Min(length, text.Length)))
            If count = 0 Then Return
            target = target.Substring(0, start - 1) & text.Substring(0, count) & target.Substring(start - 1 + count)
        End Sub
        Public Sub DebugPrint(newline As Boolean, values As Object())
            Dim output As New Global.System.Text.StringBuilder()
            For Each value As Object In values
                If value Is PrintZone Then
                    output.Append(" "c, 14 - (output.Length Mod 14))
                ElseIf value Is DBNull.Value Then
                    output.Append("Null")
                ElseIf value IsNot Nothing Then
                    output.Append(ToText(value))
                End If
            Next
            If newline Then output.AppendLine()
            Global.System.Diagnostics.Debug.Write(output.ToString())
        End Sub
        Public Function Positive(value As Object) As Object
            Return If(value Is DBNull.Value, DBNull.Value, Operators.PlusObject(value))
        End Function
        Public Function Negate(value As Object) As Object
            Return If(value Is DBNull.Value, DBNull.Value, Operators.NegateObject(value))
        End Function
        Public Function BitNot(value As Object) As Object
            Return If(value Is DBNull.Value, DBNull.Value, Operators.NotObject(value))
        End Function
        Public Function Add(a As Object, b As Object) As Object
            If a Is DBNull.Value OrElse b Is DBNull.Value Then Return DBNull.Value
            Return Operators.AddObject(a, b)
        End Function
        Public Function Subtract(a As Object, b As Object) As Object
            If a Is DBNull.Value OrElse b Is DBNull.Value Then Return DBNull.Value
            Return Operators.SubtractObject(a, b)
        End Function
        Public Function Multiply(a As Object, b As Object) As Object
            If a Is DBNull.Value OrElse b Is DBNull.Value Then Return DBNull.Value
            Return Operators.MultiplyObject(a, b)
        End Function
        Public Function Divide(a As Object, b As Object) As Object
            If a Is DBNull.Value OrElse b Is DBNull.Value Then Return DBNull.Value
            If ToDouble(b) = 0 Then RaiseError(11)
            Return Operators.DivideObject(a, b)
        End Function
        Public Function IntegerDivide(a As Object, b As Object) As Object
            If a Is DBNull.Value OrElse b Is DBNull.Value Then Return DBNull.Value
            Return Operators.IntDivideObject(a, b)
        End Function
        Public Function Modulo(a As Object, b As Object) As Object
            If a Is DBNull.Value OrElse b Is DBNull.Value Then Return DBNull.Value
            Return Operators.ModObject(a, b)
        End Function
        Public Function Power(a As Object, b As Object) As Object
            If a Is DBNull.Value OrElse b Is DBNull.Value Then Return DBNull.Value
            Return Operators.ExponentObject(a, b)
        End Function
        Public Function Concatenate(a As Object, b As Object) As Object
            If a Is DBNull.Value AndAlso b Is DBNull.Value Then Return DBNull.Value
            Return ToText(If(a Is DBNull.Value, Nothing, a)) & ToText(If(b Is DBNull.Value, Nothing, b))
        End Function
        Public Function BitAnd(a As Object, b As Object) As Object
            If a Is DBNull.Value Then Return If(b IsNot DBNull.Value AndAlso ToInt32(b) = 0, CObj(0S), DBNull.Value)
            If b Is DBNull.Value Then Return If(ToInt32(a) = 0, CObj(0S), DBNull.Value)
            Return Operators.AndObject(a, b)
        End Function
        Public Function BitOr(a As Object, b As Object) As Object
            If a Is DBNull.Value Then Return If(b IsNot DBNull.Value AndAlso ToInt32(b) = -1, CObj(-1S), DBNull.Value)
            If b Is DBNull.Value Then Return If(ToInt32(a) = -1, CObj(-1S), DBNull.Value)
            Return Operators.OrObject(a, b)
        End Function
        Public Function BitXor(a As Object, b As Object) As Object
            If a Is DBNull.Value OrElse b Is DBNull.Value Then Return DBNull.Value
            Return Operators.XorObject(a, b)
        End Function
        Public Function Eqv(a As Object, b As Object) As Object
            Return BitNot(BitXor(a, b))
        End Function
        Public Function Imp(a As Object, b As Object) As Object
            Return BitOr(BitNot(a), b)
        End Function
        Public Function Equal(a As Object, b As Object, Optional text As Boolean = False) As Object
            If a Is DBNull.Value OrElse b Is DBNull.Value Then Return DBNull.Value
            Return Operators.CompareObjectEqual(a, b, text)
        End Function
        Public Function NotEqual(a As Object, b As Object, Optional text As Boolean = False) As Object
            If a Is DBNull.Value OrElse b Is DBNull.Value Then Return DBNull.Value
            Return Operators.CompareObjectNotEqual(a, b, text)
        End Function
        Public Function Less(a As Object, b As Object, Optional text As Boolean = False) As Object
            If a Is DBNull.Value OrElse b Is DBNull.Value Then Return DBNull.Value
            Return Operators.CompareObjectLess(a, b, text)
        End Function
        Public Function Greater(a As Object, b As Object, Optional text As Boolean = False) As Object
            If a Is DBNull.Value OrElse b Is DBNull.Value Then Return DBNull.Value
            Return Operators.CompareObjectGreater(a, b, text)
        End Function
        Public Function LessEqual(a As Object, b As Object, Optional text As Boolean = False) As Object
            If a Is DBNull.Value OrElse b Is DBNull.Value Then Return DBNull.Value
            Return Operators.CompareObjectLessEqual(a, b, text)
        End Function
        Public Function GreaterEqual(a As Object, b As Object, Optional text As Boolean = False) As Object
            If a Is DBNull.Value OrElse b Is DBNull.Value Then Return DBNull.Value
            Return Operators.CompareObjectGreaterEqual(a, b, text)
        End Function
        Public Function [Like](a As Object, b As Object, Optional text As Boolean = False) As Object
            If a Is DBNull.Value OrElse b Is DBNull.Value Then Return DBNull.Value
            Return LikeOperator.LikeString(ToText(a), ToText(b), If(text, Global.Microsoft.VisualBasic.CompareMethod.Text, Global.Microsoft.VisualBasic.CompareMethod.Binary))
        End Function
    End Module
End Namespace
`;

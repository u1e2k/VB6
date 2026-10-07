Option Strict On
Imports System
Imports System.Collections
Imports System.Collections.Generic
Imports Microsoft.VisualBasic
Imports Microsoft.VisualBasic.CompilerServices

Namespace VB6.Compatibility
    ''' <summary>A compile-time optional default distinct from VB Empty/Nothing.</summary>
    Public Enum VbMissing
        Value = 0
    End Enum

    Public Module VbRuntime
        Public Function CopyValue(value As Object) As Object
            If TypeOf value Is IVbValue Then Return DirectCast(value, IVbValue).CopyValue()
            If TypeOf value Is System.Array Then Return VbArrays.CopyNativeArray(DirectCast(value, System.Array))
            Return value
        End Function
        Public Function AutoNew(Of T As Class)(ByRef value As T, factory As Func(Of T)) As T
            If value Is Nothing Then value = factory()
            Return value
        End Function
        Public Function IsNull(value As Object) As Boolean
            Return Convert.IsDBNull(value)
        End Function
        Public Function IsEmpty(value As Object) As Boolean
            Return value Is Nothing
        End Function
        Public Function IsMissing(value As Object) As Boolean
            Return TypeOf value Is VbMissing OrElse Object.ReferenceEquals(value, Type.Missing)
        End Function
        Public Function IsArray(value As Object) As Boolean
            Return TypeOf value Is IVbArray OrElse TypeOf value Is System.Array
        End Function
        Public Function IsObject(value As Object) As Boolean
            Return value IsNot Nothing AndAlso Not TypeOf value Is String AndAlso Not value.GetType().IsValueType AndAlso Not IsArray(value) AndAlso Not IsNull(value)
        End Function
        Public Function [Array](ParamArray values As Object()) As VbArray(Of Object)
            Return VbArray(Of Object).FromValues(values)
        End Function
        Public Function LBound(value As Object, Optional dimension As Integer = 1) As Integer
            If TypeOf value Is IVbArray Then Return DirectCast(value, IVbArray).LowerBound(dimension)
            If TypeOf value Is System.Array Then Return DirectCast(value, System.Array).GetLowerBound(dimension - 1)
            Throw New InvalidCastException("Array required")
        End Function
        Public Function UBound(value As Object, Optional dimension As Integer = 1) As Integer
            If TypeOf value Is IVbArray Then Return DirectCast(value, IVbArray).UpperBound(dimension)
            If TypeOf value Is System.Array Then Return DirectCast(value, System.Array).GetUpperBound(dimension - 1)
            Throw New InvalidCastException("Array required")
        End Function
        Public Function Split(expression As String, Optional delimiter As String = " ", Optional limit As Integer = -1, Optional compare As CompareMethod = CompareMethod.Binary) As VbArray(Of String)
            Return VbArray(Of String).FromValues(Strings.Split(expression, delimiter, limit, compare))
        End Function
        Public Function Filter(source As Object, match As String, Optional include As Boolean = True, Optional compare As CompareMethod = CompareMethod.Binary) As VbArray(Of String)
            Dim values As New List(Of String)
            For Each value As Object In Enumerate(source)
                values.Add(Conversions.ToString(value))
            Next
            Return VbArray(Of String).FromValues(Strings.Filter(values.ToArray(), match, include, compare))
        End Function
        Public Function Join(source As Object, Optional delimiter As String = " ") As String
            Dim values As New List(Of String)
            For Each value As Object In Enumerate(source)
                values.Add(Conversions.ToString(value))
            Next
            Return String.Join(delimiter, values)
        End Function
        Private Function Enumerate(source As Object) As IEnumerable
            If TypeOf source Is IVbArray Then Return DirectCast(source, IVbArray).Values()
            If TypeOf source Is IEnumerable Then Return DirectCast(source, IEnumerable)
            Throw New InvalidCastException("Array required")
        End Function
        Public Function TypeName(value As Object) As String
            If TypeOf value Is VbCurrency Then Return "Currency"
            If TypeOf value Is Short Then Return "Integer"
            If TypeOf value Is Integer Then Return "Long"
            If TypeOf value Is IVbArray Then
                Dim array = DirectCast(value, IVbArray)
                Return If(array.ElementVarType = 9 AndAlso array.ElementType Is GetType(Object), "Object", TypeNameFromType(array.ElementType)) & "()"
            End If
            Return Information.TypeName(value)
        End Function
        Private Function TypeNameFromType(type As Type) As String
            If type Is GetType(Short) Then Return "Integer"
            If type Is GetType(Integer) Then Return "Long"
            If type Is GetType(VbCurrency) Then Return "Currency"
            If type Is GetType(Object) Then Return "Variant"
            Return type.Name
        End Function
        Public Function VarType(value As Object) As Integer
            If TypeOf value Is VbCurrency Then Return 6
            If TypeOf value Is IVbArray Then
                Return 8192 Or DirectCast(value, IVbArray).ElementVarType
            End If
            Return CInt(Information.VarType(value))
        End Function
        Public Function Len(value As Object) As Integer
            If TypeOf value Is VbCurrency Then Return 8
            Return Strings.Len(value)
        End Function
        Public Function LenB(value As Object) As Integer
            If TypeOf value Is String Then Return DirectCast(value, String).Length * 2
            Return Len(value)
        End Function
        Public Function [Abs](value As Object) As Object
            If TypeOf value Is VbCurrency Then Return VbCurrency.FromDecimal(Math.Abs(DirectCast(value, VbCurrency).ToDecimal()))
            If value Is Nothing Then Return 0
            If Convert.IsDBNull(value) Then Return DBNull.Value
            If TypeOf value Is Decimal Then Return Math.Abs(DirectCast(value, Decimal))
            Return Math.Abs(Conversions.ToDouble(value))
        End Function
        Public Function Sgn(value As Object) As Integer
            If TypeOf value Is VbCurrency Then Return Math.Sign(DirectCast(value, VbCurrency).ToDecimal())
            Return Math.Sign(Conversions.ToDouble(value))
        End Function
        Public Function Round(value As Object, Optional digits As Integer = 0) As Object
            If digits < 0 OrElse digits > 28 Then Throw New ArgumentException("Invalid procedure call")
            If TypeOf value Is VbCurrency Then Return VbCurrency.FromDecimal(Math.Round(DirectCast(value, VbCurrency).ToDecimal(), digits, MidpointRounding.ToEven))
            If TypeOf value Is Decimal Then Return Math.Round(DirectCast(value, Decimal), digits, MidpointRounding.ToEven)
            Return Math.Round(Conversions.ToDouble(value), digits, MidpointRounding.ToEven)
        End Function
        Public Function FixedString(value As Object, length As Integer) As String
            If length < 1 OrElse length > 65535 Then Throw New ArgumentOutOfRangeException(NameOf(length))
            Dim text = Conversions.ToString(value)
            If text Is Nothing Then text = ""
            Return If(text.Length >= length, text.Substring(0, length), text.PadRight(length))
        End Function
        Public Function Align(value As Object, length As Integer, right As Boolean) As String
            Dim text = Conversions.ToString(value)
            If text Is Nothing Then text = ""
            If text.Length > length Then text = text.Substring(0, length)
            Return If(right, text.PadLeft(length), text.PadRight(length))
        End Function
        Public Function MidAssign(value As String, start As Integer, replacement As String, Optional length As Integer = Integer.MaxValue) As String
            If start < 1 OrElse length < 0 Then Throw New ArgumentException("Invalid procedure call")
            value = If(value, "") : replacement = If(replacement, "")
            If start > value.Length Then Return value
            Dim count = Math.Min(Math.Min(length, replacement.Length), value.Length - start + 1)
            Return value.Substring(0, start - 1) & replacement.Substring(0, count) & value.Substring(start - 1 + count)
        End Function
        Public Function BranchIndex(value As Object) As Integer
            Dim index = Conversions.ToInteger(value)
            If index < 0 OrElse index > 255 Then Throw New ArgumentException("Invalid procedure call")
            Return index
        End Function
        Public Function UnsupportedPointer(value As Object) As IntPtr
            Throw New NotSupportedException("Managed pointers cannot reproduce VB6 VarPtr/StrPtr/ObjPtr lifetime. Supply an interop plugin.")
        End Function
    End Module
End Namespace

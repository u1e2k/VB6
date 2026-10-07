Option Strict On
Imports System
Imports System.Globalization
Imports Microsoft.VisualBasic.CompilerServices

Namespace VB6.Compatibility
    ''' <summary>Signed 64-bit fixed-point Currency, rounded to four decimals at each operation.</summary>
    Public Structure VbCurrency
        Implements IComparable(Of VbCurrency), IEquatable(Of VbCurrency), IFormattable
        Private ReadOnly _scaled As Long
        Private Sub New(scaled As Long)
            _scaled = scaled
        End Sub
        Public Shared Function FromDecimal(value As Decimal) As VbCurrency
            Dim scaled = Decimal.Round(value * 10000D, 0, MidpointRounding.ToEven)
            If scaled < Long.MinValue OrElse scaled > Long.MaxValue Then Throw New OverflowException("Currency overflow")
            Return New VbCurrency(CLng(scaled))
        End Function
        Public Shared Function FromObject(value As Object) As VbCurrency
            If TypeOf value Is VbCurrency Then Return DirectCast(value, VbCurrency)
            Return FromDecimal(Conversions.ToDecimal(value))
        End Function
        Public Function ToDecimal() As Decimal
            Return CDec(_scaled) / 10000D
        End Function
        Public Shared Widening Operator CType(value As VbCurrency) As Decimal
            Return value.ToDecimal()
        End Operator
        Public Shared Narrowing Operator CType(value As Decimal) As VbCurrency
            Return FromDecimal(value)
        End Operator
        Public Shared Operator +(a As VbCurrency, b As VbCurrency) As VbCurrency
            Return FromDecimal(a.ToDecimal() + b.ToDecimal())
        End Operator
        Public Shared Operator -(a As VbCurrency, b As VbCurrency) As VbCurrency
            Return FromDecimal(a.ToDecimal() - b.ToDecimal())
        End Operator
        Public Shared Operator *(a As VbCurrency, b As VbCurrency) As VbCurrency
            Return FromDecimal(a.ToDecimal() * b.ToDecimal())
        End Operator
        Public Shared Operator /(a As VbCurrency, b As VbCurrency) As Double
            Return CDbl(a.ToDecimal()) / CDbl(b.ToDecimal())
        End Operator
        Public Shared Operator -(value As VbCurrency) As VbCurrency
            Return FromDecimal(-value.ToDecimal())
        End Operator
        Public Shared Operator +(value As VbCurrency) As VbCurrency
            Return value
        End Operator
        Public Shared Operator =(a As VbCurrency, b As VbCurrency) As Boolean
            Return a._scaled = b._scaled
        End Operator
        Public Shared Operator <>(a As VbCurrency, b As VbCurrency) As Boolean
            Return a._scaled <> b._scaled
        End Operator
        Public Shared Operator <(a As VbCurrency, b As VbCurrency) As Boolean
            Return a._scaled < b._scaled
        End Operator
        Public Shared Operator >(a As VbCurrency, b As VbCurrency) As Boolean
            Return a._scaled > b._scaled
        End Operator
        Public Shared Operator <=(a As VbCurrency, b As VbCurrency) As Boolean
            Return a._scaled <= b._scaled
        End Operator
        Public Shared Operator >=(a As VbCurrency, b As VbCurrency) As Boolean
            Return a._scaled >= b._scaled
        End Operator
        Public Function CompareTo(other As VbCurrency) As Integer Implements IComparable(Of VbCurrency).CompareTo
            Return _scaled.CompareTo(other._scaled)
        End Function
        Public Overloads Function Equals(other As VbCurrency) As Boolean Implements IEquatable(Of VbCurrency).Equals
            Return _scaled = other._scaled
        End Function
        Public Overrides Function Equals(other As Object) As Boolean
            Return TypeOf other Is VbCurrency AndAlso Equals(DirectCast(other, VbCurrency))
        End Function
        Public Overrides Function GetHashCode() As Integer
            Return _scaled.GetHashCode()
        End Function
        Public Overrides Function ToString() As String
            Return ToDecimal().ToString(CultureInfo.CurrentCulture)
        End Function
        Public Overloads Function ToString(format As String, provider As IFormatProvider) As String Implements IFormattable.ToString
            Return ToDecimal().ToString(format, provider)
        End Function
    End Structure
End Namespace

Option Strict On
Imports System

Namespace VB6.Compatibility
    ''' <summary>Small address/bounds adapters for private shifted native vectors.</summary>
    Public Module VbNativeArrays
        Public Function Index(index As Integer, lower As Integer, length As Integer) As Integer
            Dim offset As Long = CLng(index) - CLng(lower)
            If offset < 0 OrElse offset >= length Then Throw New IndexOutOfRangeException()
            Return CInt(offset)
        End Function
        Public Function Bound(lower As Integer, upper As Integer, dimension As Integer, upperBound As Boolean) As Integer
            If dimension <> 1 Then Throw New IndexOutOfRangeException()
            Return If(upperBound, upper, lower)
        End Function
    End Module
End Namespace

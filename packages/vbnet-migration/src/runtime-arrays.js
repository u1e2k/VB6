export const arrayRuntime = `Option Explicit On
Option Strict On
Imports System
Imports System.Collections
Imports System.Collections.Generic

Namespace Global.Vb6Migration.Runtime
    Public Interface IVbArray
        ReadOnly Property ElementVarType As Short
        ReadOnly Property ElementName As String
        Function LowerBound(dimension As Integer) As Integer
        Function UpperBound(dimension As Integer) As Integer
    End Interface

    ' Flat, first-dimension-fastest storage preserves VB6 SAFEARRAY ordering.
    ' Bounds remain explicit; converting every array to a zero-based CLR array
    ' would silently change LBound, UBound, ReDim Preserve and indexed access.
    Public NotInheritable Class VbArray(Of T)
        Implements IVbArray, IEnumerable(Of T)
        Private lows As Integer() = System.Array.Empty(Of Integer)()
        Private highs As Integer() = System.Array.Empty(Of Integer)()
        Private strides As Integer() = System.Array.Empty(Of Integer)()
        Private items As T() = System.Array.Empty(Of T)()
        Private ReadOnly fixed As Boolean
        Private allocated As Boolean
        Public Sub New(lower As Integer(), upper As Integer(), fixedSize As Boolean)
            fixed = fixedSize
            If lower.Length > 0 Then Allocate(lower, upper, False)
        End Sub
        Private Sub Allocate(lower As Integer(), upper As Integer(), preserve As Boolean)
            If lower Is Nothing OrElse upper Is Nothing OrElse lower.Length < 1 OrElse lower.Length > 60 OrElse lower.Length <> upper.Length Then VbRuntime.RaiseError(9)
            Dim nextStrides(lower.Length - 1) As Integer
            Dim size As Long = 1
            For dimension As Integer = 0 To lower.Length - 1
                Dim length As Long = CLng(upper(dimension)) - lower(dimension) + 1
                If length < 0 OrElse length > Integer.MaxValue Then VbRuntime.RaiseError(9)
                nextStrides(dimension) = CInt(size)
                size *= length
                If size > Integer.MaxValue Then VbRuntime.RaiseError(7)
                If preserve AndAlso allocated Then
                    If lower.Length <> lows.Length OrElse lower(dimension) <> lows(dimension) OrElse dimension < lower.Length - 1 AndAlso upper(dimension) <> highs(dimension) Then VbRuntime.RaiseError(9)
                End If
            Next
            Dim nextItems As T() = If(size = 0, System.Array.Empty(Of T)(), New T(CInt(size) - 1) {})
            If GetType(T) Is GetType(String) Then
                For index As Integer = 0 To nextItems.Length - 1
                    nextItems(index) = CType(CObj(String.Empty), T)
                Next
            End If
            If GetType(T) Is GetType(Date) Then
                For index As Integer = 0 To nextItems.Length - 1
                    nextItems(index) = CType(CObj(Date.FromOADate(0)), T)
                Next
            End If
            If preserve AndAlso allocated Then System.Array.Copy(items, nextItems, Math.Min(items.Length, nextItems.Length))
            lows = DirectCast(lower.Clone(), Integer()) : highs = DirectCast(upper.Clone(), Integer())
            strides = nextStrides : items = nextItems : allocated = True
        End Sub
        Public Sub Resize(lower As Integer(), upper As Integer(), preserve As Boolean)
            If fixed Then VbRuntime.RaiseError(10, "This array is fixed or temporarily locked")
            Allocate(lower, upper, preserve)
        End Sub
        Private Function Offset(indices As Integer()) As Integer
            If Not allocated OrElse indices.Length <> lows.Length Then VbRuntime.RaiseError(9)
            Dim result As Long = 0
            For dimension As Integer = 0 To indices.Length - 1
                If indices(dimension) < lows(dimension) OrElse indices(dimension) > highs(dimension) Then VbRuntime.RaiseError(9)
                result += (CLng(indices(dimension)) - lows(dimension)) * strides(dimension)
            Next
            Return CInt(result)
        End Function
        Default Public Property Item(ParamArray indices() As Integer) As T
            Get
                Return items(Offset(indices))
            End Get
            Set(value As T)
                items(Offset(indices)) = value
            End Set
        End Property
        Public Function LowerBound(dimension As Integer) As Integer Implements IVbArray.LowerBound
            If Not allocated OrElse dimension < 1 OrElse dimension > lows.Length Then VbRuntime.RaiseError(9)
            Return lows(dimension - 1)
        End Function
        Public Function UpperBound(dimension As Integer) As Integer Implements IVbArray.UpperBound
            If Not allocated OrElse dimension < 1 OrElse dimension > highs.Length Then VbRuntime.RaiseError(9)
            Return highs(dimension - 1)
        End Function
        Public ReadOnly Property ElementVarType As Short Implements IVbArray.ElementVarType
            Get
                If GetType(T) Is GetType(Object) Then Return 12S
                If GetType(T) Is GetType(String) Then Return 8S
                If GetType(T) Is GetType(Byte) Then Return 17S
                If GetType(T) Is GetType(Short) Then Return 2S
                If GetType(T) Is GetType(Integer) Then Return 3S
                If GetType(T) Is GetType(Single) Then Return 4S
                If GetType(T) Is GetType(Double) Then Return 5S
                If GetType(T) Is GetType(Decimal) Then Return 14S
                If GetType(T) Is GetType(Date) Then Return 7S
                If GetType(T) Is GetType(Boolean) Then Return 11S
                Return 9S
            End Get
        End Property
        Public ReadOnly Property ElementName As String Implements IVbArray.ElementName
            Get
                If GetType(T) Is GetType(Object) Then Return "Variant"
                If GetType(T) Is GetType(String) Then Return "String"
                If GetType(T) Is GetType(Short) Then Return "Integer"
                If GetType(T) Is GetType(Integer) Then Return "Long"
                Return GetType(T).Name
            End Get
        End Property
        Public Sub [Erase]()
            If fixed Then
                Allocate(lows, highs, False)
            Else
                lows = System.Array.Empty(Of Integer)() : highs = System.Array.Empty(Of Integer)()
                strides = System.Array.Empty(Of Integer)() : items = System.Array.Empty(Of T)()
                allocated = False
            End If
        End Sub
        Public Function Copy() As VbArray(Of T)
            Dim result As New VbArray(Of T)(System.Array.Empty(Of Integer)(), System.Array.Empty(Of Integer)(), False)
            result.lows = DirectCast(lows.Clone(), Integer()) : result.highs = DirectCast(highs.Clone(), Integer())
            result.strides = DirectCast(strides.Clone(), Integer()) : result.items = DirectCast(items.Clone(), T())
            result.allocated = allocated
            Return result
        End Function
        Public Function GetEnumerator() As IEnumerator(Of T) Implements IEnumerable(Of T).GetEnumerator
            If Not allocated Then VbRuntime.RaiseError(9)
            Return DirectCast(items, IEnumerable(Of T)).GetEnumerator()
        End Function
        Private Function GetUntypedEnumerator() As IEnumerator Implements IEnumerable.GetEnumerator
            Return GetEnumerator()
        End Function
    End Class
End Namespace
`;

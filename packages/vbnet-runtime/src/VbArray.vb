Option Strict On
Imports System
Imports System.Collections
Imports System.Collections.Generic

Namespace VB6.Compatibility
    Public Interface IVbValue
        Function CopyValue() As Object
    End Interface

    Public Interface IVbArray
        ReadOnly Property Rank As Integer
        ReadOnly Property ElementType As Type
        Function LowerBound(dimension As Integer) As Integer
        Function UpperBound(dimension As Integer) As Integer
        Function Values() As IEnumerable
    End Interface

    ''' <summary>Typed, arbitrary-lower-bound, column-major VB6 array storage.</summary>
    Public NotInheritable Class VbArray(Of T)
        Implements IEnumerable(Of T), IVbArray, IVbValue
        Private _data As T()
        Private _lower As Integer()
        Private _length As Integer()
        Private _stride As Integer()
        Private ReadOnly _fixed As Boolean
        Private ReadOnly _factory As Func(Of T)

        Public Sub New(Optional elementFactory As Func(Of T) = Nothing)
            If elementFactory Is Nothing Then
                _factory = AddressOf DefaultElement
            Else
                _factory = elementFactory
            End If
        End Sub

        Public Sub New(lower As Integer(), upper As Integer(), Optional fixedSize As Boolean = False, Optional elementFactory As Func(Of T) = Nothing)
            Me.New(elementFactory)
            Resize(lower, upper, False)
            _fixed = fixedSize
        End Sub

        Private Shared Function DefaultElement() As T
            If GetType(T) Is GetType(String) Then Return DirectCast(CObj(String.Empty), T)
            Return Nothing
        End Function

        Private Sub Initialize(values As T())
            ' A factory is required for fixed strings and records containing arrays.
            For i = 0 To values.Length - 1
                values(i) = _factory()
            Next
        End Sub

        ' <summary>VB array assignment copies the array and any nested value records.</summary>
        Public Function Copy() As VbArray(Of T)
            Dim result As New VbArray(Of T)(_factory)
            If _data Is Nothing Then Return result
            result._lower = DirectCast(_lower.Clone(), Integer())
            result._length = DirectCast(_length.Clone(), Integer())
            result._stride = DirectCast(_stride.Clone(), Integer())
            result._data = DirectCast(_data.Clone(), T())
            For i = 0 To result._data.Length - 1
                Dim value As Object = result._data(i)
                If TypeOf value Is IVbValue Then result._data(i) = DirectCast(DirectCast(value, IVbValue).CopyValue(), T)
            Next
            Return result
        End Function

        Private Function CopyValue() As Object Implements IVbValue.CopyValue
            Return Copy()
        End Function

        Public Shared Function FromValues(items As IEnumerable(Of T), Optional lower As Integer = 0) As VbArray(Of T)
            If items Is Nothing Then Throw New ArgumentNullException(NameOf(items))
            Dim data = New List(Of T)(items).ToArray()
            Dim result = New VbArray(Of T)()
            result._data = data
            result._lower = New Integer() {lower}
            result._length = New Integer() {data.Length}
            result._stride = New Integer() {1}
            Return result
        End Function

        Public ReadOnly Property Rank As Integer Implements IVbArray.Rank
            Get
                Return If(_length Is Nothing, 0, _length.Length)
            End Get
        End Property

        Public ReadOnly Property ElementType As Type Implements IVbArray.ElementType
            Get
                Return GetType(T)
            End Get
        End Property

        Public ReadOnly Property Count As Integer
            Get
                Return If(_data Is Nothing, 0, _data.Length)
            End Get
        End Property

        Public Function LowerBound(dimension As Integer) As Integer Implements IVbArray.LowerBound
            ValidateDimension(dimension)
            Return _lower(dimension - 1)
        End Function

        Public Function UpperBound(dimension As Integer) As Integer Implements IVbArray.UpperBound
            ValidateDimension(dimension)
            Return _lower(dimension - 1) + _length(dimension - 1) - 1
        End Function

        Private Sub ValidateDimension(dimension As Integer)
            If dimension < 1 OrElse dimension > Rank Then Throw New IndexOutOfRangeException("Subscript out of range")
        End Sub

        Default Public Property Item(ParamArray indices As Integer()) As T
            Get
                Return _data(Offset(indices))
            End Get
            Set(value As T)
                _data(Offset(indices)) = value
            End Set
        End Property

        Private Function Offset(indices As Integer()) As Integer
            If indices Is Nothing OrElse indices.Length <> Rank OrElse Rank = 0 Then Throw New IndexOutOfRangeException("Subscript out of range")
            Dim result As Long = 0
            For i = 0 To indices.Length - 1
                Dim index = CLng(indices(i)) - _lower(i)
                If index < 0 OrElse index >= _length(i) Then Throw New IndexOutOfRangeException("Subscript out of range")
                result += index * _stride(i)
            Next
            Return CInt(result)
        End Function

        ''' <summary>Validates and allocates before committing any state changes.</summary>
        Public Sub Resize(lower As Integer(), upper As Integer(), Optional preserve As Boolean = False)
            If _fixed Then Throw New InvalidOperationException("Cannot ReDim a fixed-size array")
            If lower Is Nothing OrElse upper Is Nothing OrElse lower.Length = 0 OrElse lower.Length <> upper.Length OrElse lower.Length > 60 Then Throw New IndexOutOfRangeException("Invalid array rank")
            Dim lengths(lower.Length - 1) As Integer, strides(lower.Length - 1) As Integer
            Dim total As Long = 1
            For i = 0 To lower.Length - 1
                Dim length = CLng(upper(i)) - lower(i) + 1
                If length < 0 OrElse length > Integer.MaxValue Then Throw New IndexOutOfRangeException("Invalid array bounds")
                strides(i) = CInt(total)
                lengths(i) = CInt(length)
                total *= length
                If total > Integer.MaxValue Then Throw New OutOfMemoryException("Array exceeds managed storage limit")
            Next
            If preserve AndAlso _data IsNot Nothing Then
                If Rank <> lower.Length Then Throw New IndexOutOfRangeException("ReDim Preserve cannot change rank")
                For i = 0 To lower.Length - 1
                    If lower(i) <> _lower(i) OrElse (i < lower.Length - 1 AndAlso lengths(i) <> _length(i)) Then Throw New IndexOutOfRangeException("ReDim Preserve can change only the final upper bound")
                Next
            End If
            Dim replacement As T() = If(total = 0, System.Array.Empty(Of T)(), New T(CInt(total) - 1) {})
            Initialize(replacement)
            If preserve AndAlso _data IsNot Nothing Then System.Array.Copy(_data, replacement, Math.Min(_data.Length, replacement.Length))
            _lower = CType(lower.Clone(), Integer())
            _length = lengths
            _stride = strides
            _data = replacement
        End Sub

        Public Sub [Erase]()
            If _fixed Then
                Initialize(_data)
            Else
                _data = Nothing
                _lower = Nothing
                _length = Nothing
                _stride = Nothing
            End If
        End Sub

        Public Function Values() As IEnumerable Implements IVbArray.Values
            Return If(_data, System.Array.Empty(Of T)())
        End Function

        Public Function GetEnumerator() As IEnumerator(Of T) Implements IEnumerable(Of T).GetEnumerator
            Return DirectCast(If(_data, System.Array.Empty(Of T)()), IEnumerable(Of T)).GetEnumerator()
        End Function

        Private Function UntypedEnumerator() As IEnumerator Implements IEnumerable.GetEnumerator
            Return GetEnumerator()
        End Function
    End Class
End Namespace

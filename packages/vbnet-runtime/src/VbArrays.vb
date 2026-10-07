Option Strict On
Imports System
Imports Microsoft.VisualBasic.CompilerServices

Namespace VB6.Compatibility
    ''' <summary>Boxed-array operations shared by migrated Variant expressions and statements.</summary>
    Public Module VbArrays
        Public Function ResizeVariant(value As Object, bounds As VbArrayBounds, preserve As Boolean,
                                      Optional elementType As Type = Nothing, Optional objectElements As Boolean = False) As Object
            If bounds Is Nothing Then Throw New ArgumentNullException(NameOf(bounds))
            Return ResizeVariant(value, bounds.Lower, bounds.Upper, preserve, elementType, objectElements)
        End Function

        ''' <summary>Validate before mutating; Preserve never changes the element type.</summary>
        Public Function ResizeVariant(value As Object, lower As Integer(), upper As Integer(), preserve As Boolean,
                                      Optional elementType As Type = Nothing, Optional objectElements As Boolean = False) As Object
            If value IsNot Nothing AndAlso Not VbRuntime.IsArray(value) Then Throw New InvalidCastException("Array required")
            Dim source As IVbArray = TryCast(value, IVbArray)
            If source Is Nothing AndAlso TypeOf value Is System.Array Then source = ImportArray(DirectCast(value, System.Array))
            If elementType Is Nothing Then
                elementType = If(source Is Nothing, GetType(Object), source.ElementType)
                objectElements = source IsNot Nothing AndAlso source.ElementVarType = 9
            End If
            Dim typeCode = ElementTypeCode(elementType, objectElements)
            If preserve AndAlso source IsNot Nothing AndAlso (source.ElementType IsNot elementType OrElse source.ElementVarType <> typeCode) Then
                Throw New InvalidCastException("ReDim Preserve cannot change the array element type")
            End If
            Dim result = If(source IsNot Nothing AndAlso source.ElementType Is elementType AndAlso source.ElementVarType = typeCode,
                            source, CreateArray(elementType, objectElements))
            result.Resize(lower, upper, preserve)
            Return result
        End Function

        ''' <summary>Erase releases the dimensions and values while retaining the array element type.</summary>
        Public Function EraseVariant(value As Object) As Object
            If Not VbRuntime.IsArray(value) Then Throw New InvalidCastException("Array required")
            Dim source = TryCast(value, IVbArray)
            If source IsNot Nothing Then Return CreateArray(source.ElementType, source.ElementVarType = 9)
            Return CreateArray(value.GetType().GetElementType(), False)
        End Function

        ''' <summary>Capture receiver and arguments once, retaining a writable VB property for copy-back.</summary>
        Public Function Element(value As Object, arguments As Object()) As VbIndexedValue
            Return New VbIndexedValue(value, arguments)
        End Function

        Public Function ElementTypeCode(type As Type, Optional objectElements As Boolean = False) As Integer
            If type Is Nothing Then Throw New ArgumentNullException(NameOf(type))
            If type Is GetType(Object) Then Return If(objectElements, 9, 12)
            If type Is GetType(VbCurrency) Then Return 6
            If type.IsEnum Then Return 3
            If GetType(IVbValue).IsAssignableFrom(type) Then Return 36
            If Not type.IsValueType AndAlso type IsNot GetType(String) Then Return 9
            Select Case System.Type.GetTypeCode(type)
                Case TypeCode.Byte : Return 17
                Case TypeCode.Boolean : Return 11
                Case TypeCode.Int16 : Return 2
                Case TypeCode.Int32 : Return 3
                Case TypeCode.Single : Return 4
                Case TypeCode.Double : Return 5
                Case TypeCode.Decimal : Return 14
                Case TypeCode.DateTime : Return 7
                Case TypeCode.String : Return 8
                Case Else : Throw New InvalidCastException("Unsupported Variant array element type: " & type.FullName)
            End Select
        End Function

        Friend Function CoerceElement(value As Object, type As Type, objectElements As Boolean) As Object
            If type Is GetType(Object) AndAlso Not objectElements Then Return VbRuntime.CopyValue(value)
            If type Is GetType(VbCurrency) Then Return VbCurrency.FromObject(value)
            If Not type.IsValueType AndAlso type IsNot GetType(String) Then
                If value Is Nothing OrElse type.IsInstanceOfType(value) AndAlso VbRuntime.IsObject(value) Then Return value
                Throw New InvalidCastException("Object required")
            End If
            If type.IsInstanceOfType(value) Then Return VbRuntime.CopyValue(value)
            Return Conversions.ChangeType(value, type)
        End Function

        ''' <summary>Copy nested array values by coordinates; object identities remain references.</summary>
        Friend Function CopyNativeArray(source As System.Array) As System.Array
            Dim result = DirectCast(source.Clone(), System.Array)
            ' Scalar and class-only arrays are already copied by Clone. Only Variant/record
            ' storage can own nested array values that require recursive value copying.
            Dim element = source.GetType().GetElementType()
            If element IsNot GetType(Object) AndAlso Not GetType(IVbValue).IsAssignableFrom(element) AndAlso Not element.IsArray Then Return result
            For Each indices In Coordinates(source)
                result.SetValue(VbRuntime.CopyValue(source.GetValue(indices)), indices)
            Next
            Return result
        End Function

        Private Iterator Function Coordinates(source As System.Array) As Collections.Generic.IEnumerable(Of Integer())
            Dim indices(source.Rank - 1) As Integer
            For dimension = 0 To source.Rank - 1
                indices(dimension) = source.GetLowerBound(dimension)
            Next
            For offset As Integer = 0 To source.Length - 1
                Yield indices
                For dimension = 0 To source.Rank - 1
                    If indices(dimension) < source.GetUpperBound(dimension) Then
                        indices(dimension) += 1
                        Exit For
                    End If
                    indices(dimension) = source.GetLowerBound(dimension)
                Next
            Next
        End Function

        Private Function CreateArray(type As Type, objectElements As Boolean) As IVbArray
            ElementTypeCode(type, objectElements) ' Reject unsupported storage before generic construction.
            Dim arrayType = GetType(VbArray(Of )).MakeGenericType(type)
            Return DirectCast(Activator.CreateInstance(arrayType, New Object() {Nothing, objectElements}), IVbArray)
        End Function

        Private Function ImportArray(source As System.Array) As IVbArray
            Dim result = CreateArray(source.GetType().GetElementType(), False)
            Dim lower(source.Rank - 1), upper(source.Rank - 1) As Integer
            For dimension = 0 To source.Rank - 1
                lower(dimension) = source.GetLowerBound(dimension)
                upper(dimension) = source.GetUpperBound(dimension)
            Next
            result.Resize(lower, upper, False)
            ' Coordinate-based copy deliberately does not depend on CLR row-major enumeration.
            For Each coordinate In Coordinates(source)
                result.SetValue(coordinate, source.GetValue(coordinate))
            Next
            Return result
        End Function
    End Module

    ''' <summary>A stable indexed location; no reflection is used on VbArray or CLR array paths.</summary>
    Public NotInheritable Class VbIndexedValue
        Private ReadOnly _target As Object
        Private ReadOnly _arguments As Object()
        Private ReadOnly _indices As Integer()

        Friend Sub New(target As Object, arguments As Object())
            If target Is Nothing Then Throw New InvalidCastException("Array or indexed object required")
            If arguments Is Nothing OrElse arguments.Length = 0 Then Throw New IndexOutOfRangeException("Subscript required")
            _target = target
            _arguments = DirectCast(arguments.Clone(), Object())
            If VbRuntime.IsArray(target) Then
                _indices = New Integer(arguments.Length - 1) {}
                For dimension = 0 To arguments.Length - 1
                    _indices(dimension) = Conversions.ToInteger(arguments(dimension))
                Next
            End If
        End Sub

        Public Property Value As Object
            Get
                If TypeOf _target Is IVbArray Then Return DirectCast(_target, IVbArray).GetValue(_indices)
                If TypeOf _target Is System.Array Then Return DirectCast(_target, System.Array).GetValue(_indices)
                Return NewLateBinding.LateIndexGet(_target, _arguments, Nothing)
            End Get
            Set(value As Object)
                If TypeOf _target Is IVbArray Then
                    DirectCast(_target, IVbArray).SetValue(_indices, value)
                ElseIf TypeOf _target Is System.Array Then
                    Dim array = DirectCast(_target, System.Array)
                    array.SetValue(VbArrays.CoerceElement(value, array.GetType().GetElementType(), False), _indices)
                Else
                    Dim arguments(_arguments.Length) As Object
                    System.Array.Copy(_arguments, arguments, _arguments.Length)
                    arguments(arguments.Length - 1) = value
                    NewLateBinding.LateIndexSet(_target, arguments, Nothing)
                End If
            End Set
        End Property
    End Class
End Namespace

Option Strict On
Imports System
Imports Microsoft.VisualBasic.CompilerServices

Namespace VB6.Compatibility
    Public Module VbVariant
        Private Function Scalar(value As Object) As Object
            If TypeOf value Is VbCurrency Then Return DirectCast(value, VbCurrency).ToDecimal()
            Return value
        End Function
        Public Function Truth(value As Object) As Boolean
            If value Is Nothing OrElse Convert.IsDBNull(value) Then Return False
            Return Conversions.ToBoolean(Scalar(value))
        End Function
        Public Function Unary(operation As String, value As Object) As Object
            If Convert.IsDBNull(value) Then Return DBNull.Value
            Select Case operation.ToLowerInvariant()
                Case "not" : Return Operators.NotObject(Scalar(value))
                Case "-" : Return Operators.NegateObject(Scalar(value))
                Case "+" : Return Operators.PlusObject(Scalar(value))
                Case Else : Throw New ArgumentException("Unknown unary operator")
            End Select
        End Function
        Public Function Binary(operation As String, left As Object, right As Object, Optional textCompare As Boolean = False) As Object
            If operation = "is" Then Return Object.ReferenceEquals(left, right)
            If Convert.IsDBNull(left) OrElse Convert.IsDBNull(right) Then
                Dim other = If(Convert.IsDBNull(left), right, left)
                If Not Convert.IsDBNull(other) Then
                    If operation = "and" AndAlso Conversions.ToLong(Scalar(other)) = 0 Then Return 0
                    If operation = "or" AndAlso Conversions.ToLong(Scalar(other)) = -1 Then Return -1
                End If
                If operation = "&" AndAlso Not (Convert.IsDBNull(left) AndAlso Convert.IsDBNull(right)) Then Return Conversions.ToString(If(Convert.IsDBNull(left), Nothing, left)) & Conversions.ToString(If(Convert.IsDBNull(right), Nothing, right))
                Return DBNull.Value
            End If
            Dim a = Scalar(left), b = Scalar(right), result As Object
            Select Case operation.ToLowerInvariant()
                Case "+" : result = Operators.AddObject(a, b)
                Case "-" : result = Operators.SubtractObject(a, b)
                Case "*" : result = Operators.MultiplyObject(a, b)
                Case "/" : Return Operators.DivideObject(a, b)
                Case "\" : Return Operators.IntDivideObject(a, b)
                Case "mod" : Return Operators.ModObject(a, b)
                Case "^" : Return Operators.ExponentObject(a, b)
                Case "&" : Return Operators.ConcatenateObject(a, b)
                Case "and" : Return Operators.AndObject(a, b)
                Case "or" : Return Operators.OrObject(a, b)
                Case "xor" : Return Operators.XorObject(a, b)
                Case "eqv" : Return Operators.NotObject(Operators.XorObject(a, b))
                Case "imp" : Return Operators.OrObject(Operators.NotObject(a), b)
                Case "=" : Return Operators.CompareObjectEqual(a, b, textCompare)
                Case "<>" : Return Operators.CompareObjectNotEqual(a, b, textCompare)
                Case "<" : Return Operators.CompareObjectLess(a, b, textCompare)
                Case ">" : Return Operators.CompareObjectGreater(a, b, textCompare)
                Case "<=" : Return Operators.CompareObjectLessEqual(a, b, textCompare)
                Case ">=" : Return Operators.CompareObjectGreaterEqual(a, b, textCompare)
                Case "like" : Return LikeOperator.LikeObject(a, b, If(textCompare, Microsoft.VisualBasic.CompareMethod.Text, Microsoft.VisualBasic.CompareMethod.Binary))
                Case Else : Throw New ArgumentException("Unknown binary operator")
            End Select
            If TypeOf left Is VbCurrency AndAlso TypeOf right Is VbCurrency Then Return VbCurrency.FromObject(result)
            Return result
        End Function
    End Module
End Namespace

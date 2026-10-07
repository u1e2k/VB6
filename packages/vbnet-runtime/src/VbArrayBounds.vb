Option Strict On
Imports System

Namespace VB6.Compatibility
    ''' <summary>Already evaluated lower/upper bounds in source dimension order.</summary>
    Public NotInheritable Class VbArrayBounds
        Friend ReadOnly Lower As Integer()
        Friend ReadOnly Upper As Integer()

        Private Sub New(pairs As Integer())
            Dim rank = pairs.Length \ 2
            Lower = New Integer(rank - 1) {}
            Upper = New Integer(rank - 1) {}
            For dimension = 0 To rank - 1
                Lower(dimension) = pairs(2 * dimension)
                Upper(dimension) = pairs(2 * dimension + 1)
            Next
        End Sub

        Public Shared Function FromPairs(ParamArray pairs As Integer()) As VbArrayBounds
            If pairs Is Nothing OrElse pairs.Length < 2 OrElse pairs.Length > 120 OrElse pairs.Length Mod 2 <> 0 Then
                Throw New IndexOutOfRangeException("Invalid array rank")
            End If
            Return New VbArrayBounds(pairs)
        End Function
    End Class
End Namespace

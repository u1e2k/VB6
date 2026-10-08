Option Explicit On
Option Strict On

Imports System
Imports System.Globalization
Imports Microsoft.VisualBasic

' Independently authored .NET baseline: no converter-generated program or helper.
' Decimal formatting preserves scale. Strings.Len(Decimal) intentionally returns
' the legacy Currency length (8), whereas Strings.Len(Object) returns 16 for Decimal.
' Sources:
' https://learn.microsoft.com/en-us/dotnet/standard/base-types/standard-numeric-format-strings#general-format-specifier-g
' https://github.com/dotnet/runtime/blob/v10.0.0/src/libraries/Microsoft.VisualBasic.Core/src/Microsoft/VisualBasic/Strings.vb
Public Module Module1
    Public Sub Main()
        CultureInfo.CurrentCulture = CultureInfo.InvariantCulture
        Dim amount As Decimal = 1.23456D
        Console.WriteLine(CStr(amount))
        For amount = 1D To 2D Step 0.5D
            Console.WriteLine(amount)
        Next

        amount = CDec(1.23456R)
        Console.WriteLine(CStr(Math.Abs(amount)))
        Console.WriteLine(Math.Sign(amount))
        Console.WriteLine(Math.Round(amount, 2))
        Console.WriteLine(Strings.Len(amount))
        Console.WriteLine(CInt(Information.VarType(amount)))
        If CBool(amount) Then Console.WriteLine("truth")
        Console.WriteLine(Strings.Len(CObj(amount)))
    End Sub
End Module

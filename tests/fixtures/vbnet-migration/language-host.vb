Option Strict On
Imports System
Imports LanguageFixture
Module Host
    Private count As Integer
    Private Sub Check(condition As Boolean, name As String)
        If Not condition Then Throw New Exception("Migration regression: " & name)
        count += 1
    End Sub
    Public Sub Main()
        Check(LanguageChecks.SumTo(10) = 55, "For loop and function result")
        Check(LanguageChecks.Factorial(5S) = 120, "recursive result binding")
        Check(LanguageChecks.ArrayCheck() = 35, "bounded arrays, Preserve and value assignment")
        Check(LanguageChecks.FixedStringCheck() = "aZc  ", "fixed-width and Mid assignment")
        Check(LanguageChecks.ByRefCheck() = 5, "explicit Call ByRef versus grouped ByVal")
        Check(LanguageChecks.InvokeOptional() = 12, "Missing, default and named arguments")
        Check(LanguageChecks.ErrorCheck() = 105, "On Error and Resume label")
        Check(LanguageChecks.GoSubCheck() = 4, "nested GoSub stack")
        Check(LanguageChecks.StaticCheck() = 1 AndAlso LanguageChecks.StaticCheck() = 2, "static lifetime")
        Check(LanguageChecks.SelectCheck(2) = 10 AndAlso LanguageChecks.SelectCheck(7) = 20 AndAlso LanguageChecks.SelectCheck(11) = 30 AndAlso LanguageChecks.SelectCheck(9) = 40, "Select Case")
        Check(LanguageChecks.VariantCheck(), "Null propagation")
        Check(LanguageChecks.LoopCheck() = 2, "Do While Until and Wend")
        Dim value As New Counter()
        Dim listener As New Listener()
        listener.Attach(value)
        Check(value.Value = 1, "Class_Initialize")
        value.Increment()
        Check(value.Value = 2 AndAlso listener.LastValue = 2, "properties, RaiseEvent, WithEvents, Handles")
        Console.WriteLine("VB6_MIGRATION_LANGUAGE_OK " & count)
    End Sub
End Module

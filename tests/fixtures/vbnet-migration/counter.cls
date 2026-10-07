Attribute VB_Name = "Counter"
Option Explicit
Private current As Long
Public Event Changed(ByVal value As Long)
Private Sub Class_Initialize()
    current = 1
End Sub
Public Property Get Value() As Long
    Value = current
End Property
Public Property Let Value(ByVal value As Long)
    current = value
    RaiseEvent Changed(current)
End Property
Public Sub Increment()
    Value = current + 1
End Sub

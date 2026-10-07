Attribute VB_Name = "Listener"
Option Explicit
Private WithEvents observed As Counter
Public LastValue As Long
Public Sub Attach(ByVal value As Counter)
    Set observed = value
End Sub
Private Sub observed_Changed(ByVal value As Long)
    LastValue = value
End Sub

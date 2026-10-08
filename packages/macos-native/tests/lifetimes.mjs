/** Generated native VB lifetime scenarios; executed by the native CI matrix. */
export function lifetimeModules() {
  return [
    {name:'ILifetimeProbe',kind:'class',code:`Option Explicit
Public Sub Touch()
End Sub`},
    {name:'LifetimeProbe',kind:'class',code:`Option Explicit
Implements ILifetimeProbe
Public Serial As Long
Private Sub Class_Initialize()
  LifetimeCreated = LifetimeCreated + 1
  Serial = LifetimeCreated
End Sub
Private Sub Class_Terminate()
  LifetimeReleased = LifetimeReleased + 1
  LifetimeLastSerial = Me.Serial
  If LifetimeRaise Then Err.Raise 5, "LifetimeProbe", "release failure"
End Sub
Public Sub Touch()
  Debug.Assert Serial > 0
End Sub
Private Sub ILifetimeProbe_Touch()
  Touch
End Sub`},
    {name:'LifetimeParent',kind:'class',code:`Option Explicit
Private child As LifetimeProbe
Private Sub Class_Initialize()
  Set child = New LifetimeProbe
End Sub
Private Sub Class_Terminate()
  Set child = Nothing
  Debug.Assert LifetimeReleased = 14
End Sub`},
    {name:'LifetimeBadInit',kind:'class',code:`Option Explicit
Private Sub Class_Initialize()
  Err.Raise 5, "LifetimeBadInit", "initialization failure"
End Sub
Private Sub Class_Terminate()
  LifetimeBadReleased = LifetimeBadReleased + 1
End Sub`},
    {name:'LifetimeTests',kind:'module',code:`Option Explicit
Public LifetimeCreated As Long
Public LifetimeReleased As Long
Public LifetimeLastSerial As Long
Public LifetimeBadReleased As Long
Public LifetimeRaise As Boolean
Private Sub ScopedProbe()
  Dim value As LifetimeProbe
  Set value = New LifetimeProbe
End Sub
Private Function ReturnedProbe() As LifetimeProbe
  Set ReturnedProbe = New LifetimeProbe
End Function
Private Sub ReleaseProbe(ByRef value As LifetimeProbe, ByVal expected As Long)
  Set value = Nothing
  Debug.Assert LifetimeReleased = expected
End Sub
Private Sub ToggleStatic()
  Static value As LifetimeProbe
  If value Is Nothing Then
    Set value = New LifetimeProbe
  Else
    Set value = Nothing
  End If
End Sub
Public Sub CheckNativeLifetimes()
  Dim value As LifetimeProbe, aliasValue As LifetimeProbe
  Dim contract As ILifetimeProbe
  Set value = New LifetimeProbe
  Debug.Assert LifetimeCreated = 1
  Set aliasValue = value
  Set value = Nothing
  Debug.Assert LifetimeReleased = 0
  Set aliasValue = Nothing
  Debug.Assert LifetimeReleased = 1
  Debug.Assert LifetimeLastSerial = 1
  ScopedProbe
  Debug.Assert LifetimeReleased = 2
  Set value = ReturnedProbe()
  Debug.Assert LifetimeReleased = 2
  ReleaseProbe value, 3
  Debug.Assert value Is Nothing
  Set value = New LifetimeProbe
  Set contract = value
  Set value = Nothing
  Debug.Assert LifetimeReleased = 3
  contract.Touch
  Set contract = Nothing
  Debug.Assert LifetimeReleased = 4
  Dim lazy As New LifetimeProbe
  lazy.Touch
  Set lazy = Nothing
  Debug.Assert LifetimeReleased = 5
  lazy.Touch
  Set lazy = Nothing
  Debug.Assert LifetimeReleased = 6
  Dim items As New Collection
  items.Add New LifetimeProbe
  Debug.Assert LifetimeReleased = 6
  items.Remove 1
  Debug.Assert LifetimeReleased = 7
  Dim array(0 To 1) As LifetimeProbe
  Set array(0) = New LifetimeProbe
  Set array(1) = New LifetimeProbe
  Erase array
  Debug.Assert LifetimeReleased = 9
  ToggleStatic
  Debug.Assert LifetimeReleased = 9
  ToggleStatic
  Debug.Assert LifetimeReleased = 10
  With New LifetimeProbe
    .Touch
  End With
  Debug.Assert LifetimeReleased = 11
  On Error Resume Next
  Err.Raise 53
  Set value = New LifetimeProbe
  Set value = Nothing
  Debug.Assert Err.Number = 53
  Debug.Assert LifetimeReleased = 12
  Err.Clear
  LifetimeRaise = True
  Set value = New LifetimeProbe
  Set value = Nothing
  Debug.Assert Err.Number = 5
  Debug.Assert Err.Source = "LifetimeProbe"
  Debug.Assert LifetimeReleased = 13
  LifetimeRaise = False
  Err.Clear
  Dim broken As LifetimeBadInit
  Set broken = New LifetimeBadInit
  Debug.Assert Err.Number = 5
  Debug.Assert LifetimeBadReleased = 0
  Err.Clear
  On Error GoTo 0
  Dim parent As LifetimeParent
  Set parent = New LifetimeParent
  Set parent = Nothing
  Debug.Assert LifetimeReleased = 14
  Debug.Assert LifetimeCreated = LifetimeReleased
  Debug.Print "NATIVE_LIFETIMES_OK"
End Sub`}
  ];
}
export function lifetimeProject() {
  return {schema:1,name:'NativeLifetimes',startup:'Sub Main',modules:[...lifetimeModules(),
    {name:'Entry',kind:'module',code:'Public Sub Main()\nCheckNativeLifetimes\nEnd Sub'}]};
}

/** Project-defined interface conformance for both native execution gates. */
export function interfaceModules() {
  return [
    {name:'IScale',kind:'class',code:`Option Explicit
Public Function Scale(ByVal amount As Long, Optional ByVal factor As Long = 2) As Long
End Function
Public Property Get Label() As String
End Property
Public Property Let Label(ByVal value As String)
End Property`},
    {name:'IOffset',kind:'class',code:`Public Function Scale(ByVal amount As Long) As Long
End Function`},
    {name:'IRecord',kind:'class',code:'Public Title As String'},
    {name:'IIndexed',kind:'class',attributes:['Attribute Item.VB_UserMemId = 0'],code:`Public Property Get Item(ByVal index As Long) As Long
End Property
Public Property Let Item(ByVal index As Long, ByVal value As Long)
End Property`},
    {name:'IChild',kind:'class',code:`Public Property Get Child() As IScale
End Property
Public Property Set Child(ByVal value As IScale)
End Property`},
    {name:'NativeProvider',kind:'class',code:`Option Explicit
Implements IScale
Implements IOffset
Implements IRecord
Implements IIndexed
Implements IChild
Private caption As String
Private stored As Long
Private link As IScale
Private Function IScale_Scale(ByVal number As Long, Optional ByVal times As Long = 2) As Long
  IScale_Scale = number * times
End Function
Private Property Get IScale_Label() As String
  IScale_Label = caption
End Property
Private Property Let IScale_Label(ByVal nextValue As String)
  caption = nextValue
End Property
Private Function IOffset_Scale(ByVal number As Long) As Long
  IOffset_Scale = number + 100
End Function
Private Property Get IRecord_Title() As String
  IRecord_Title = caption
End Property
Private Property Let IRecord_Title(ByRef nextValue As String)
  caption = nextValue
End Property
Private Property Get IIndexed_Item(ByVal position As Long) As Long
  IIndexed_Item = stored + position
End Property
Private Property Let IIndexed_Item(ByVal position As Long, ByVal nextValue As Long)
  stored = nextValue - position
End Property
Private Property Get IChild_Child() As IScale
  Set IChild_Child = link
End Property
Private Property Set IChild_Child(ByVal nextValue As IScale)
  Set link = nextValue
End Property
Public Function Own() As Long
  Own = 999
End Function`},
    {name:'UnrelatedNativeClass',kind:'class',code:'Option Explicit'},
    {name:'NativeInterfaceChecks',kind:'module',code:`Option Explicit
Private Sub CheckVal(ByVal value As IScale)
  Debug.Assert value.Scale(amount:=3) = 6
End Sub
Private Sub CheckRef(ByRef value As IScale)
  Debug.Assert value.Scale(factor:=3, amount:=4) = 12
  value.Label = "from-ref"
End Sub
Private Sub ReplaceRef(ByRef value As IScale)
  Set value = New NativeProvider
  value.Label = "replacement"
End Sub
Private Function HiddenError(ByVal value As Object) As Long
  On Error Resume Next
  Err.Clear
  CallByName value, "Own", vbMethod
  HiddenError = Err.Number
  On Error GoTo 0
End Function
Private Function PrivateError(ByVal value As Object) As Long
  On Error Resume Next
  Err.Clear
  CallByName value, "IScale_Scale", vbMethod, 3
  PrivateError = Err.Number
  On Error GoTo 0
End Function
Private Function CastError() As Long
  Dim value As IScale
  On Error Resume Next
  Err.Clear
  Set value = New UnrelatedNativeClass
  CastError = Err.Number
  On Error GoTo 0
End Function
Public Sub CheckNativeInterfaces()
  Dim concrete As New NativeProvider
  Dim a As IScale, b As IScale, offset As IOffset
  Set a = concrete
  Set b = concrete
  Set offset = a
  a.Label = "contract"
  Debug.Assert b.Label = "contract"
  Debug.Assert a.Scale(factor:=4, amount:=3) = 12
  Debug.Assert a.Scale(amount:=7) = 14
  Debug.Assert offset.Scale(amount:=5) = 105
  Debug.Assert concrete Is a
  Debug.Assert a Is b
  Debug.Assert a Is offset
  Debug.Assert TypeOf a Is IScale
  Debug.Assert TypeOf a Is NativeProvider
  Debug.Assert TypeOf a Is IOffset
  Debug.Assert TypeName(a) = "NativeProvider"
  Debug.Assert CallByName(a, "Scale", vbMethod, 4, 3) = 12
  CheckVal concrete
  CheckRef concrete
  Debug.Assert a.Label = "from-ref"
  Dim title As IRecord
  Set title = a
  title.Title = "public-field"
  Debug.Assert b.Label = "public-field"
  Dim indexed As IIndexed
  Set indexed = a
  indexed(3) = 17
  Debug.Assert indexed(4) = 18
  indexed.Item(index:=2) = 20
  Debug.Assert indexed.Item(index:=4) = 22
  Dim child As IChild, childValue As New NativeProvider
  Set child = a
  Set child.Child = childValue
  Debug.Assert child.Child Is childValue
  Debug.Assert child.Child.Scale(4) = 8
  Set child.Child = Nothing
  Dim values(0 To 1) As IScale
  Set values(0) = a
  Set values(1) = concrete
  Debug.Assert values(0) Is values(1)
  Debug.Assert values(1).Scale(amount:=8) = 16
  Dim dictionary As Object
  Set dictionary = CreateObject("Scripting.Dictionary")
  dictionary.Add concrete, "canonical"
  Debug.Assert dictionary.Exists(a)
  Debug.Assert dictionary.Item(offset) = "canonical"
  Debug.Assert HiddenError(a) = 438
  Debug.Assert PrivateError(concrete) = 438
  Debug.Assert CastError() = 13
  Dim back As NativeProvider
  Set back = offset
  Debug.Assert back.Own() = 999
  Debug.Assert back Is concrete
  ReplaceRef concrete
  Debug.Assert Not (concrete Is a)
  Set b = concrete
  Debug.Assert b.Label = "replacement"
  ReplaceRef b
  Debug.Assert Not (b Is concrete)
  Debug.Assert b.Label = "replacement"
  Set concrete = Nothing
  Set b = Nothing
  Debug.Assert b Is Nothing
  Debug.Assert a.Label = "public-field"
  Debug.Print "NATIVE_INTERFACES_OK"
End Sub`}
  ];
}
export function interfaceProject() {
  return {schema:1,name:'NativeInterfaces',startup:'Sub Main',modules:[...interfaceModules(),
    {name:'MainModule',kind:'module',code:'Public Sub Main()\nCheckNativeInterfaces\nEnd Sub'}]};
}

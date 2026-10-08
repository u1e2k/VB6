export const PROPERTY_FIXTURE={name:'AccessorMigration',startup:'Sub Main',settings:{},modules:[
  {name:'Module1',kind:'module',code:`Option Explicit
Public Sub Main()
Dim box As New Box, other As New Box, i As Long
box.Item(i)=42
Debug.Print i
Debug.Print box.Item(i)
Debug.Print i
box.Value=17
Set box.Value=other
Debug.Print box.LetCount
Debug.Print box.SetCount
Set other=box.Value
Debug.Print other Is box
box.WriteOnly(i)=23
Debug.Print i
Debug.Print box.Item(i)
End Sub`},
  {name:'Box',kind:'class',code:`Option Explicit
Private stored As Long
Private reference As Box
Public LetCount As Long
Public SetCount As Long
Public Property Get Item(ByRef index As Long) As Long
index=index+1
Item=stored
End Property
Public Property Let Item(ByRef index As Long, ByVal amount As Long)
index=index+2
stored=amount
End Property
Public Property Let WriteOnly(ByRef index As Long, ByVal amount As Long)
index=index+4
stored=amount
End Property
Public Property Get Value() As Variant
Set Value=reference
End Property
Public Property Let Value(ByVal amount As Variant)
LetCount=LetCount+1
stored=amount
End Property
Public Property Set Value(ByVal amount As Variant)
SetCount=SetCount+1
Set reference=amount
End Property`}
]};
export const PROPERTY_EXPECTED=['2','42','3','1','1','False','7','23'];

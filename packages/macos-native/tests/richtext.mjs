/** Generated VB form acceptance, separate from direct AppKit ABI tests. */
export function richTextProject() {
  return {schema:1,name:'NativeRichText',startup:'Sub Main',modules:[
    {name:'Entry',kind:'module',code:`Option Explicit
Public Sub Main()
  Load RichForm
  Unload RichForm
  Debug.Print "NATIVE_RICH_FORM_OK"
End Sub`},
    {name:'RichForm',kind:'form',form:{name:'RichForm',type:'Form',properties:{Caption:'Native rich selection'},
      controls:[{name:'Editor',type:'RichTextBox',properties:{Left:0,Top:0,Width:4500,Height:2400,Text:''}}],menus:[]},
      code:`Option Explicit
Private changes As Long
Private Sub Editor_Change()
  changes = changes + 1
End Sub
Private Sub Form_Load()
  Editor.Text = "plain BOLD tail"
  Editor.SelStart = 0
  Editor.SelLength = Len(Editor.Text)
  Editor.SelBold = False
  Editor.SelItalic = False
  Editor.SelFontSize = 10
  Editor.SelStart = 6
  Editor.SelLength = 4
  changes = 0
  Editor.SelBold = True
  Debug.Assert changes = 1
  Editor.SelItalic = True
  Editor.SelColor = vbRed
  Editor.SelBackColor = vbGreen
  Editor.SelFontSize = 12.5
  Debug.Assert Editor.SelBold = True
  Debug.Assert Editor.SelItalic = True
  Debug.Assert Editor.SelFontSize = 12.5
  Debug.Assert Editor.SelColor = vbRed
  Debug.Assert Editor.SelStart = 6
  Debug.Assert Editor.SelLength = 4
  Dim fragment As String
  fragment = Editor.SelRTF
  Editor.SelStart = 0
  Editor.SelLength = 10
  Debug.Assert IsNull(Editor.SelBold)
  Editor.Text = "# tail"
  Editor.SelStart = 0
  Editor.SelLength = 1
  Editor.SelRTF = fragment
  Debug.Assert Editor.Text = "BOLD tail"
  Debug.Assert Editor.SelStart = 4
  Debug.Assert Editor.SelLength = 0
  Editor.SelStart = 0
  Editor.SelLength = 4
  Debug.Assert Editor.SelBold = True
  Debug.Assert Editor.SelItalic = True
  On Error Resume Next
  Editor.SelFontSize = 0
  Debug.Assert Err.Number = 380
  Err.Clear
  On Error GoTo 0
  Debug.Assert Editor.Text = "BOLD tail"
End Sub`}
  ]};
}

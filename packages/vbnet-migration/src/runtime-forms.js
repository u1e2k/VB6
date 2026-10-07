export const formRuntime = `Option Explicit On
Option Strict On
Imports System
Imports System.Collections
Imports System.Drawing
Imports System.Windows.Forms

Namespace Global.Vb6Migration.Runtime
    Public NotInheritable Class VbListItem
        Public Text As String
        Public Data As Integer
        Public Sub New(value As String)
            Text = value
        End Sub
        Public Overrides Function ToString() As String
            Return Text
        End Function
    End Class
    Public Module VbForms
        Private Function Factor(control As Control, scaleMode As Integer, horizontal As Boolean) As Double
            Dim dpi As Double = control.DeviceDpi
            Select Case scaleMode
                Case 1 : Return dpi / 1440.0
                Case 2 : Return dpi / 72.0
                Case 3 : Return 1.0
                Case 4 : Return If(horizontal, 8.0, 16.0)
                Case 5 : Return dpi
                Case 6 : Return dpi / 25.4
                Case 7 : Return dpi / 2.54
                Case Else : VbRuntime.RaiseError(5, "Custom ScaleMode requires a coordinate-system adapter")
            End Select
            Return 1.0
        End Function
        Public Function Geometry(control As Control, member As String, scaleMode As Integer) As Single
            Dim pixels As Integer
            Select Case member
                Case "left" : pixels = control.Left
                Case "top" : pixels = control.Top
                Case "width" : pixels = control.Width
                Case "height" : pixels = control.Height
                Case "scalewidth", "clientwidth" : pixels = control.ClientSize.Width
                Case "scaleheight", "clientheight" : pixels = control.ClientSize.Height
                Case "scaleleft", "scaletop" : Return 0.0F
                Case Else : VbRuntime.RaiseError(438)
            End Select
            Return CSng(pixels / Factor(control, scaleMode, member.Contains("width") OrElse member = "left"))
        End Function
        Public Sub SetGeometry(control As Control, member As String, value As Object, scaleMode As Integer)
            Dim pixels As Integer = CInt(VbRuntime.ToDouble(value) * Factor(control, scaleMode, member.Contains("width") OrElse member = "left"))
            Select Case member
                Case "left" : control.Left = pixels
                Case "top" : control.Top = pixels
                Case "width" : control.Width = pixels
                Case "height" : control.Height = pixels
                Case "clientwidth" : control.ClientSize = New Size(pixels, control.ClientSize.Height)
                Case "clientheight" : control.ClientSize = New Size(control.ClientSize.Width, pixels)
                Case Else : VbRuntime.RaiseError(438, "Custom scale mutation requires a coordinate-system adapter")
            End Select
        End Sub
        Public Sub Move(control As Control, scaleMode As Integer, left As Object, Optional top As Object = Nothing, Optional width As Object = Nothing, Optional height As Object = Nothing)
            SetGeometry(control, "left", left, scaleMode)
            If top IsNot Nothing Then SetGeometry(control, "top", top, scaleMode)
            If width IsNot Nothing Then SetGeometry(control, "width", width, scaleMode)
            If height IsNot Nothing Then SetGeometry(control, "height", height, scaleMode)
        End Sub
        Public Sub LoadForm(form As Form)
            form.CreateControl()
            Dim handle As IntPtr = form.Handle
        End Sub
        Public Sub Show(form As Form, mode As Integer, Optional owner As Form = Nothing)
            If mode = 1 Then
                form.ShowDialog(owner)
            ElseIf mode = 0 Then
                form.Show(owner)
            Else
                VbRuntime.RaiseError(5)
            End If
        End Sub
        Public Sub ButtonValue(button As Button, value As Object)
            If VbRuntime.ToBoolean(value) Then button.PerformClick()
        End Sub
        Private Function Items(control As Control) As IList
            If TypeOf control Is ListBox Then Return DirectCast(control, ListBox).Items
            If TypeOf control Is ComboBox Then Return DirectCast(control, ComboBox).Items
            VbRuntime.RaiseError(438) : Return Nothing
        End Function
        Public Sub AddItem(control As Control, value As Object, Optional index As Integer = -1)
            Dim values As IList = Items(control), item As New VbListItem(VbRuntime.ToText(value))
            Dim sorted As Boolean = If(TypeOf control Is ListBox, DirectCast(control, ListBox).Sorted, DirectCast(control, ComboBox).Sorted)
            If index = -1 OrElse sorted Then
                values.Add(item)
            Else
                If index < 0 OrElse index > values.Count Then VbRuntime.RaiseError(381)
                values.Insert(index, item)
            End If
        End Sub
        Public Function ListText(control As Control) As String
            Dim list As ListBox = TryCast(control, ListBox)
            If list Is Nothing Then Return control.Text
            Return If(list.SelectedIndex < 0, String.Empty, list.SelectedItem.ToString())
        End Function
        Public Sub SetListText(control As Control, value As Object)
            Dim text As String = VbRuntime.ToText(value), list As ListBox = TryCast(control, ListBox)
            If list Is Nothing Then
                control.Text = text
            Else
                list.SelectedIndex = list.FindStringExact(text)
            End If
        End Sub
        Public Function ListItem(control As Control, index As Integer) As String
            Return Items(control)(index).ToString()
        End Function
        Public Sub SetListItem(control As Control, index As Integer, value As Object)
            Dim values As IList = Items(control), old As VbListItem = TryCast(values(index), VbListItem)
            Dim item As New VbListItem(VbRuntime.ToText(value))
            If old IsNot Nothing Then item.Data = old.Data
            values(index) = item
        End Sub
        Public Function ItemData(control As Control, index As Integer) As Integer
            Dim item As VbListItem = TryCast(Items(control)(index), VbListItem)
            Return If(item Is Nothing, 0, item.Data)
        End Function
        Public Sub SetItemData(control As Control, index As Integer, value As Object)
            Dim values As IList = Items(control), item As VbListItem = TryCast(values(index), VbListItem)
            If item Is Nothing Then
                item = New VbListItem(values(index).ToString())
                values(index) = item
            End If
            item.Data = VbRuntime.ToInt32(value)
        End Sub
        Public Sub SetFont(control As Control, member As String, value As Object)
            Dim old As Font = control.Font, family As String = old.Name, size As Single = old.SizeInPoints, style As FontStyle = old.Style
            Select Case member
                Case "Name" : family = VbRuntime.ToText(value)
                Case "SizeInPoints" : size = VbRuntime.ToSingle(value)
                Case Else
                    Dim flag As FontStyle
                    Select Case member
                        Case "Bold" : flag = FontStyle.Bold
                        Case "Italic" : flag = FontStyle.Italic
                        Case "Underline" : flag = FontStyle.Underline
                        Case "Strikeout" : flag = FontStyle.Strikeout
                        Case Else : VbRuntime.RaiseError(438)
                    End Select
                    style = If(VbRuntime.ToBoolean(value), style Or flag, style And Not flag)
            End Select
            ' Fonts inherited from the parent or framework must not be disposed here.
            control.Font = New Font(family, size, style, GraphicsUnit.Point)
        End Sub
        Public Function MouseButton(button As MouseButtons) As Short
            Dim value As Integer = 0
            If (button And MouseButtons.Left) <> 0 Then value = value Or 1
            If (button And MouseButtons.Right) <> 0 Then value = value Or 2
            If (button And MouseButtons.Middle) <> 0 Then value = value Or 4
            Return CShort(value)
        End Function
        Public Function ShiftState() As Short
            Dim value As Integer = 0, keys As Keys = Control.ModifierKeys
            If (keys And Global.System.Windows.Forms.Keys.Shift) <> 0 Then value = value Or 1
            If (keys And Global.System.Windows.Forms.Keys.Control) <> 0 Then value = value Or 2
            If (keys And Global.System.Windows.Forms.Keys.Alt) <> 0 Then value = value Or 4
            Return CShort(value)
        End Function
        Public Function UnloadMode(reason As CloseReason) As Short
            Select Case reason
                Case CloseReason.UserClosing : Return 0S
                Case CloseReason.WindowsShutDown : Return 2S
                Case CloseReason.TaskManagerClosing : Return 3S
                Case CloseReason.MdiFormClosing : Return 4S
                Case CloseReason.FormOwnerClosing : Return 5S
                Case Else : Return 1S
            End Select
        End Function
        Public Function ResourceImage(name As String) As Image
            Using stream As IO.Stream = Reflection.Assembly.GetExecutingAssembly().GetManifestResourceStream(name)
                If stream Is Nothing Then Throw New IO.FileNotFoundException(name)
                Using image As Image = Image.FromStream(stream)
                    Return New Bitmap(image)
                End Using
            End Using
        End Function
        Public Function ResourceIcon(name As String) As Icon
            Using stream As IO.Stream = Reflection.Assembly.GetExecutingAssembly().GetManifestResourceStream(name)
                If stream Is Nothing Then Throw New IO.FileNotFoundException(name)
                Using icon As New Icon(stream)
                    Return DirectCast(icon.Clone(), Icon)
                End Using
            End Using
        End Function
    End Module
End Namespace
`;

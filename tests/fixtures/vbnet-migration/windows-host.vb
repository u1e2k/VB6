Option Strict On
Imports System
Imports System.Reflection
Imports System.Windows.Forms
Imports WindowsFixture
Module Host
    <STAThread>
    Public Sub Main()
        Using form As New MainForm()
            If form.Text <> "Migration form" OrElse form.ClientSize.Width <> 400 Then Throw New Exception("Designer geometry/caption")
            Dim button As Button = DirectCast(form.Controls("Command1"), Button)
            ' Trigger the native event without displaying interactive UI on CI.
            GetType(Button).GetMethod("OnClick", BindingFlags.NonPublic Or BindingFlags.Instance).Invoke(button, New Object() {EventArgs.Empty})
            If form.Controls("Text1").Text <> "converted" OrElse form.ClickCount <> 1 Then Throw New Exception("Click handler")
            Dim timerField = GetType(MainForm).GetField("Timer1", BindingFlags.NonPublic Or BindingFlags.Instance)
            Dim timer = DirectCast(timerField.GetValue(form), Timer)
            If timer.Interval <> 500 OrElse timer.Enabled Then Throw New Exception("Component initialization")
            Dim list As ListBox = DirectCast(form.Controls("List1"), ListBox)
            Global.Vb6Migration.Runtime.VbForms.AddItem(list, "first")
            Global.Vb6Migration.Runtime.VbForms.SetItemData(list, 0, 17)
            If Global.Vb6Migration.Runtime.VbForms.ListItem(list, 0) <> "first" OrElse Global.Vb6Migration.Runtime.VbForms.ItemData(list, 0) <> 17 Then Throw New Exception("List text and ItemData")
        End Using
        Console.WriteLine("VB6_MIGRATION_WINDOWS_OK")
    End Sub
End Module

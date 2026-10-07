Option Strict On
Imports System
Imports System.Collections.Generic
Imports System.Drawing
Imports System.IO
Imports System.Reflection
Imports System.Windows.Forms

Namespace VB6.Compatibility.Windows
    Public Module VbForms
        <ThreadStatic> Private _instances As Dictionary(Of Type, Form)
        <ThreadStatic> Private _constructing As HashSet(Of Type)
        Public Function GetInstance(Of T As {Form, New})() As T
            If _instances Is Nothing Then _instances = New Dictionary(Of Type, Form)()
            If _constructing Is Nothing Then _constructing = New HashSet(Of Type)()
            Dim existing As Form = Nothing, kind = GetType(T)
            If _instances.TryGetValue(kind, existing) AndAlso Not existing.IsDisposed Then Return DirectCast(existing, T)
            If Not _constructing.Add(kind) Then Throw New InvalidOperationException("Recursive default form construction: " & kind.Name)
            Try
                Dim created As New T()
                _instances(kind) = created
                AddHandler created.FormClosed, Sub(sender As Object, e As FormClosedEventArgs)
                    Dim current As Form = Nothing
                    If _instances.TryGetValue(kind, current) AndAlso Object.ReferenceEquals(current, created) Then _instances.Remove(kind)
                End Sub
                Return created
            Finally
                _constructing.Remove(kind)
            End Try
        End Function
        Public Sub Show(form As Form, Optional mode As Integer = 0, Optional owner As IWin32Window = Nothing)
            If mode = 1 Then
                form.ShowDialog(owner)
            ElseIf mode = 0 Then
                form.Show(owner)
            Else
                Throw New ArgumentException("Invalid Show mode")
            End If
        End Sub
        Public Function DoEvents() As Short
            Application.DoEvents()
            Return 0S
        End Function
        Public Function TwipsToPixels(control As Control, value As Double) As Integer
            Return CInt(value * control.DeviceDpi / 1440.0R)
        End Function
        Public Function PixelsToTwips(control As Control, value As Double) As Single
            Return CSng(value * 1440.0R / control.DeviceDpi)
        End Function
        Public Sub Move(control As Control, left As Double, top As Double, Optional width As Object = Nothing, Optional height As Object = Nothing)
            control.SetBounds(TwipsToPixels(control, left), TwipsToPixels(control, top),
                If(width Is Nothing, control.Width, TwipsToPixels(control, Convert.ToDouble(width))),
                If(height Is Nothing, control.Height, TwipsToPixels(control, Convert.ToDouble(height))))
        End Sub
        Public Sub RunOpenForms()
            If Application.OpenForms.Count = 0 Then Return
            ' Main-form lifetime must be reviewed for applications that keep
            ' multiple independent modeless forms alive after the first closes.
            Application.Run(Application.OpenForms(0))
        End Sub
        Public Function ShiftState() As Short
            Dim modifiers = Control.ModifierKeys, result As Integer = 0
            If (modifiers And Keys.Shift) <> Keys.None Then result = result Or 1
            If (modifiers And Keys.Control) <> Keys.None Then result = result Or 2
            If (modifiers And Keys.Alt) <> Keys.None Then result = result Or 4
            Return CShort(result)
        End Function
        Public Function MouseButton(button As MouseButtons) As Short
            Dim value As Integer = 0
            If (button And MouseButtons.Left) <> MouseButtons.None Then value = value Or 1
            If (button And MouseButtons.Right) <> MouseButtons.None Then value = value Or 2
            If (button And MouseButtons.Middle) <> MouseButtons.None Then value = value Or 4
            Return CShort(value)
        End Function
        Public Function LoadPicture(Optional fileName As String = "") As Image
            If String.IsNullOrEmpty(fileName) Then Return Nothing
            Using stream = File.OpenRead(fileName)
                Using image = Global.System.Drawing.Image.FromStream(stream)
                    Return New Bitmap(image)
                End Using
            End Using
        End Function
        Public Sub AddItem(control As Object, item As Object, Optional index As Integer = -1)
            If TypeOf control Is ListBox Then
                Dim list = DirectCast(control, ListBox)
                If index < 0 Then list.Items.Add(item) Else list.Items.Insert(index, item)
            ElseIf TypeOf control Is ComboBox Then
                Dim list = DirectCast(control, ComboBox)
                If index < 0 Then list.Items.Add(item) Else list.Items.Insert(index, item)
            Else
                Throw New ArgumentException("List control required")
            End If
        End Sub
        Public Function OleColor(value As Integer) As Color
            Return ColorTranslator.FromOle(value)
        End Function
    End Module
    Public Module VbApp
        Public ReadOnly Property Path As String
            Get
                Return System.IO.Path.TrimEndingDirectorySeparator(AppContext.BaseDirectory)
            End Get
        End Property
        Public ReadOnly Property EXEName As String
            Get
                Return Assembly.GetEntryAssembly().GetName().Name
            End Get
        End Property
        Public ReadOnly Property Major As Integer
            Get
                Return Assembly.GetEntryAssembly().GetName().Version.Major
            End Get
        End Property
        Public ReadOnly Property Minor As Integer
            Get
                Return Assembly.GetEntryAssembly().GetName().Version.Minor
            End Get
        End Property
        Public ReadOnly Property Revision As Integer
            Get
                Return Assembly.GetEntryAssembly().GetName().Version.Build
            End Get
        End Property
    End Module
End Namespace

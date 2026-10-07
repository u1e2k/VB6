import {VB_CONSTANTS} from '../runtime/constants.js';

export const INTRINSIC_CONSTANTS = Object.freeze(Object.fromEntries(Object.entries(VB_CONSTANTS).map(([name,value])=>[name.toLowerCase(),value])));
/** Mappings are exported so a host may inspect them; extensions use plugin hooks. */
export const CONTROL_MAPPINGS = Object.freeze({
  CommandButton:'Button', Label:'Label', TextBox:'TextBox', Frame:'GroupBox', CheckBox:'CheckBox',
  OptionButton:'RadioButton', ComboBox:'ComboBox', ListBox:'ListBox', PictureBox:'PictureBox', Image:'PictureBox',
  HScrollBar:'HScrollBar', VScrollBar:'VScrollBar', Timer:'Timer', ProgressBar:'ProgressBar', Slider:'TrackBar',
  TreeView:'TreeView', ListView:'ListView', RichTextBox:'RichTextBox', DTPicker:'DateTimePicker',
  MonthView:'MonthCalendar', UpDown:'NumericUpDown', TabStrip:'TabControl', SSTab:'TabControl',
  MSFlexGrid:'DataGridView', MSHFlexGrid:'DataGridView', DataGrid:'DataGridView',
  StatusBar:'StatusStrip', Toolbar:'ToolStrip', ImageList:'ImageList', Menu:'ToolStripMenuItem'
});
export const SIMPLE_MEMBERS = Object.freeze({caption:'Text', listindex:'SelectedIndex', listcount:'Items.Count',
  maxlength:'MaxLength', locked:'ReadOnly', multiline:'Multiline', selstart:'SelectionStart', sellength:'SelectionLength',
  seltext:'SelectedText', tabstop:'TabStop', tabindex:'TabIndex', backcolor:'BackColor', forecolor:'ForeColor',
  enabled:'Enabled', visible:'Visible', text:'Text', min:'Minimum', max:'Maximum', value:'Value',
  smallchange:'SmallChange', largechange:'LargeChange', interval:'Interval', hwnd:'Handle', tag:'Tag'});
export const INTRINSICS = Object.freeze({
  cint:'CShort', clng:'CInt', cbyte:'CByte', csng:'CSng', cdbl:'CDbl', cdec:'CDec', cstr:'CStr', cbool:'CBool', cdate:'CDate',
  ccur:'VbCurrency.FromObject', cvar:'CObj', int:'Global.Microsoft.VisualBasic.Conversion.Int', fix:'Global.Microsoft.VisualBasic.Conversion.Fix',
  abs:'VbRuntime.Abs', sgn:'VbRuntime.Sgn', round:'VbRuntime.Round',
  sqr:'Global.System.Math.Sqrt', atn:'Global.System.Math.Atan', cos:'Global.System.Math.Cos', sin:'Global.System.Math.Sin',
  tan:'Global.System.Math.Tan', exp:'Global.System.Math.Exp', log:'Global.System.Math.Log',
  isnull:'VbRuntime.IsNull', isempty:'VbRuntime.IsEmpty', ismissing:'VbRuntime.IsMissing', isobject:'VbRuntime.IsObject',
  typename:'VbRuntime.TypeName', vartype:'VbRuntime.VarType', isarray:'VbRuntime.IsArray', array:'VbRuntime.Array',
  lbound:'VbRuntime.LBound', ubound:'VbRuntime.UBound', split:'VbRuntime.Split', filter:'VbRuntime.Filter', join:'VbRuntime.Join',
  err:'Global.Microsoft.VisualBasic.Information.Err',
  createobject:'Global.Microsoft.VisualBasic.Interaction.CreateObject', getobject:'Global.Microsoft.VisualBasic.Interaction.GetObject',
  doevents:'VbForms.DoEvents', loadpicture:'VbForms.LoadPicture',
  len:'VbRuntime.Len', lenb:'VbRuntime.LenB', strptr:'VbRuntime.UnsupportedPointer', varptr:'VbRuntime.UnsupportedPointer', objptr:'VbRuntime.UnsupportedPointer',
  freefile:'Global.Microsoft.VisualBasic.FileSystem.FreeFile', eof:'Global.Microsoft.VisualBasic.FileSystem.EOF',
  lof:'Global.Microsoft.VisualBasic.FileSystem.LOF', loc:'Global.Microsoft.VisualBasic.FileSystem.Loc',
  seek:'Global.Microsoft.VisualBasic.FileSystem.Seek', input:'Global.Microsoft.VisualBasic.FileSystem.InputString',
  command:'Global.Microsoft.VisualBasic.Interaction.Command', timer:'Global.Microsoft.VisualBasic.DateAndTime.Timer',
  date:'Global.Microsoft.VisualBasic.DateAndTime.Today', now:'Global.Microsoft.VisualBasic.DateAndTime.Now',
  time:'Global.Microsoft.VisualBasic.DateAndTime.TimeOfDay',
  left:'Global.Microsoft.VisualBasic.Strings.Left', right:'Global.Microsoft.VisualBasic.Strings.Right',
  mid:'Global.Microsoft.VisualBasic.Strings.Mid', string:'Global.Microsoft.VisualBasic.Strings.StrDup',
  space:'Global.Microsoft.VisualBasic.Strings.Space', trim:'Global.Microsoft.VisualBasic.Strings.Trim',
  ltrim:'Global.Microsoft.VisualBasic.Strings.LTrim', rtrim:'Global.Microsoft.VisualBasic.Strings.RTrim',
  chr:'Global.Microsoft.VisualBasic.Strings.Chr', chrw:'Global.Microsoft.VisualBasic.Strings.ChrW',
  asc:'Global.Microsoft.VisualBasic.Strings.Asc', ascw:'Global.Microsoft.VisualBasic.Strings.AscW',
  val:'Global.Microsoft.VisualBasic.Conversion.Val', str:'Global.Microsoft.VisualBasic.Conversion.Str',
  hex:'Global.Microsoft.VisualBasic.Conversion.Hex', oct:'Global.Microsoft.VisualBasic.Conversion.Oct'
});
export const BUILTIN_NAMES = new Set(('msgbox inputbox instr instrrev replace ucase lcase format formatnumber formatcurrency formatpercent formatdatetime strcomp strconv strreverse isdate isnumeric dateadd datediff datepart dateserial datevalue timeserial timevalue day month year hour minute second weekday monthname weekdayname rnd randomize shell appactivate beep environ curdir dir chdir chdrive mkdir rmdir kill filecopy filedatetime filelen getattr setattr savesetting getsetting getallsettings deletesetting sendkeys choose switch iif partition qbcolor rgb fv pv pmt ipmt ppmt nper rate npv irr mirr sln syd ddb callbyname').split(' '));
export const CAPABILITIES = Object.freeze({
  declarations:'typed modules/classes, enums, structures, constants, parameters and property groups',
  controlFlow:'structured branches/loops, labels, GoTo, GoSub, computed branches, On Error and Resume',
  runtime:'bounded arrays, fixed strings, scaled Currency, Variant helpers and Microsoft.VisualBasic intrinsics',
  forms:'WinForms designer, default instances, standard control properties, event adapters and control arrays',
  external:'Declare with explicit diagnostics; COM/OCX and binary layout require review or plugins'
});

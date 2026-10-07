/** Target APIs are explicit and overridable; user-defined symbols bind first. */
const table = new Map();
function group(owner, names, type = 'Variant') {
  for (const name of names.split(' ')) if (name) table.set(name.toLowerCase(), {target: 'Global.Microsoft.VisualBasic.' + owner + '.' + name, type});
}
group('Strings', 'Asc AscW Len LenB InStr InStrRev StrComp', 'Long');
group('Strings', 'Chr ChrW Left Right Mid LCase UCase Trim LTrim RTrim Space StrDup Replace StrReverse Format FormatCurrency FormatDateTime FormatNumber FormatPercent Join', 'String');
group('Strings', 'Split Filter', 'Variant');
group('Conversion', 'Val', 'Double');
group('Conversion', 'Hex Oct Str', 'String');
group('Conversion', 'Fix Int', 'Variant');
group('Information', 'IsNumeric IsDate', 'Boolean');
group('Information', 'RGB QBColor', 'Long');
group('DateAndTime', 'DateAdd DateSerial DateValue TimeSerial TimeValue', 'Date');
group('DateAndTime', 'DateDiff DatePart Day Month Year Hour Minute Second Weekday', 'Long');
group('DateAndTime', 'MonthName WeekdayName', 'String');
group('Interaction', 'MsgBox', 'Long');
group('Interaction', 'InputBox Command Environ GetSetting', 'String');
group('Interaction', 'SaveSetting DeleteSetting Beep', 'Void');
group('Interaction', 'Choose Switch IIf GetAllSettings', 'Variant');
group('Interaction', 'CreateObject GetObject', 'Object');
group('Interaction', 'Shell', 'Double');
group('FileSystem', 'FreeFile Loc LOF Seek FileLen GetAttr', 'Long');
group('FileSystem', 'EOF', 'Boolean');
group('FileSystem', 'Dir CurDir', 'String');
group('FileSystem', 'FileDateTime', 'Date');
group('FileSystem', 'Kill MkDir RmDir ChDir ChDrive SetAttr FileCopy', 'Void');
group('Financial', 'DDB FV IPmt IRR MIRR NPer NPV Pmt PPmt PV Rate SLN SYD', 'Double');
group('VBMath', 'Rnd', 'Single');
group('VBMath', 'Randomize', 'Void');
for (const [name, target] of Object.entries({abs: 'Abs', atn: 'Atan', cos: 'Cos', exp: 'Exp', log: 'Log', sgn: 'Sign', sin: 'Sin', sqr: 'Sqrt', tan: 'Tan', round: 'Round'})) table.set(name, {target: 'Global.System.Math.' + target, type: 'Double'});
for (const [name, type] of Object.entries({cbool: 'Boolean', cbyte: 'Byte', cint: 'Integer', clng: 'Long', csng: 'Single', cdbl: 'Double', ccur: 'Currency', cdec: 'Currency', cdate: 'Date', cstr: 'String', cvar: 'Variant', cvdate: 'Date', cverr: 'Variant'})) table.set(name, {target: 'Global.Vb6Migration.Runtime.VbRuntime.' + ({cint: 'ToInt16', clng: 'ToInt32', ccur: 'Currency', cdec: 'ToDecimal', cstr: 'ToText', cvar: 'Identity', cvdate: 'ToDate', cverr: 'ErrorValue', cbool: 'ToBoolean', cbyte: 'ToByte', csng: 'ToSingle', cdbl: 'ToDouble', cdate: 'ToDate'}[name]), type, runtime: true});
for (const [name, target, type] of [['array', 'ArrayOf', 'Variant'], ['lbound', 'LBound', 'Long'], ['ubound', 'UBound', 'Long'], ['isarray', 'IsArray', 'Boolean'], ['isempty', 'IsEmpty', 'Boolean'], ['isnull', 'IsNull', 'Boolean'], ['isobject', 'IsObject', 'Boolean'], ['iserror', 'IsError', 'Boolean'], ['ismissing', 'IsMissing', 'Boolean'], ['vartype', 'VarType', 'Integer'], ['typename', 'TypeName', 'String']]) table.set(name, {target: 'Global.Vb6Migration.Runtime.VbRuntime.' + target, type, runtime: true});
export const INTRINSICS = table;
export const CONSTANTS = Object.freeze({
  vbtrue: 'True', vbfalse: 'False', vbempty: '0S', vbnull: '1S', vbinteger: '2S', vblong: '3S', vbsingle: '4S', vbdouble: '5S', vbcurrency: '6S', vbdate: '7S', vbstring: '8S', vbobject: '9S', vberror: '10S', vbboolean: '11S', vbvariant: '12S', vbbyte: '17S', vbarray: '8192S',
  vbcrlf: 'Global.Microsoft.VisualBasic.Constants.vbCrLf', vbcr: 'Global.Microsoft.VisualBasic.Constants.vbCr', vblf: 'Global.Microsoft.VisualBasic.Constants.vbLf', vbtab: 'Global.Microsoft.VisualBasic.Constants.vbTab', vbnullchar: 'Global.Microsoft.VisualBasic.Constants.vbNullChar', vbnullstring: 'Nothing', vbnewline: 'Global.Microsoft.VisualBasic.Constants.vbCrLf', vbback: 'Global.Microsoft.VisualBasic.Constants.vbBack', vbformfeed: 'Global.Microsoft.VisualBasic.Constants.vbFormFeed', vbverticaltab: 'Global.Microsoft.VisualBasic.Constants.vbVerticalTab',
  vbblack: '0', vbred: '255', vbgreen: '65280', vbblue: '16711680', vbyellow: '65535', vbmagenta: '16711935', vbcyan: '16776960', vbwhite: '16777215',
  vbbinarycompare: '0', vbtextcompare: '1', vbusecompareoption: '-1', vbmodal: '1', vbmodeless: '0', vbchecked: '1', vbunchecked: '0', vbgrayed: '2', vbmanual: '0', vbfixedsingle: '1', vbsizable: '2', vbnone: '0', vbsolid: '0', vbtransparent: '0', vbopaque: '1',
  vbokonly: '0', vbokcancel: '1', vbabortretryignore: '2', vbyesnocancel: '3', vbyesno: '4', vbretrycancel: '5', vbcritical: '16', vbquestion: '32', vbexclamation: '48', vbinformation: '64', vbdefaultbutton1: '0', vbdefaultbutton2: '256', vbdefaultbutton3: '512', vbapplicationmodal: '0', vbsystemmodal: '4096', vbok: '1', vbcancel: '2', vbabort: '3', vbretry: '4', vbignore: '5', vbyes: '6', vbno: '7',
  vbnormal: '0', vbreadonly: '1', vbhidden: '2', vbsystem: '4', vbdirectory: '16', vbarchive: '32', vbusesystemdayofweek: '0', vbsunday: '1', vbmonday: '2', vbtuesday: '3', vbwednesday: '4', vbthursday: '5', vbfriday: '6', vbsaturday: '7', vbfirstjan1: '1', vbfirstfourdays: '2', vbfirstfullweek: '3', vbobjecterror: '-2147221504', vbmethod: '1', vbget: '2', vblet: '4', vbset: '8'
});
export const PROPERTY_INTRINSICS = Object.freeze({now: {target: 'Global.Microsoft.VisualBasic.DateAndTime.Now', type: 'Date'}, date: {target: 'Global.Microsoft.VisualBasic.DateAndTime.Today', type: 'Date'}, time: {target: 'Global.Microsoft.VisualBasic.DateAndTime.TimeOfDay', type: 'Date'}, timer: {target: 'Global.Microsoft.VisualBasic.DateAndTime.Timer', type: 'Double'}, err: {target: 'Global.Microsoft.VisualBasic.Information.Err()', type: 'Object'}, erl: {target: 'Global.Microsoft.VisualBasic.Information.Erl()', type: 'Long'}});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {convertVbNetProject} from '../src/migration/index.js';
import {CORE_FIXTURE,CORE_EXPECTED,project,formProject} from './migration-fixtures.mjs';

import {VARIANT_ARRAY_FIXTURE,VARIANT_ARRAY_EXPECTED,CURRENCY_LOOP_FIXTURE,CURRENCY_LOOP_EXPECTED,SELECT_CASE_FIXTURE,SELECT_CASE_EXPECTED,ARRAY_RUNTIME_SOURCE} from './migration-semantics-fixtures.mjs';

const root=path.resolve(import.meta.dirname,'..'),reportRoot=path.join(root,'reports/vbnet-migration/dotnet');
const probe=spawnSync('dotnet',['--list-sdks'],{encoding:'utf8',timeout:15000});
const sdkAvailable=probe.status===0&&/^10\.\d+\.\d+/m.test(probe.stdout);
const required=process.env.VB6_REQUIRE_DOTNET==='1';
const skip=sdkAvailable?false:'.NET 10 SDK is not installed; no generated VB compilation or execution was performed';
const env={...process.env,DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_NOLOGO:'1',NUGET_XMLDOC_MODE:'skip'};

test('.NET 10 compilation gate is available when required by CI',{skip:!required&&!sdkAvailable},()=>{
  assert.ok(sdkAvailable,'VB6_REQUIRE_DOTNET=1 requires an installed .NET 10 SDK; skipping is not acceptable in migration CI.');
});

function harness(t,name,input,{target,patch,codeStyle='compatibility',runtime,semanticPolicy,acceptedRules,strict,rootNamespace}={}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'vb6-dotnet-'));
  const result=convertVbNetProject(input,{platform:'AnyCPU',codeStyle,runtime,semanticPolicy,acceptedRules,strict,rootNamespace,...(target?{target}:{})});
  assert.ok(result.success,JSON.stringify(result.diagnostics));
  fs.mkdirSync(reportRoot,{recursive:true});
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  for(const [file,data] of Object.entries(result.files)){
    const output=path.join(directory,file);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,data);
  }
  if(patch)patch(directory,result);
  const commands=[];
  function dotnet(args){
    const r=spawnSync('dotnet',args,{cwd:directory,encoding:'utf8',env,timeout:120000,maxBuffer:16*1024*1024});
    commands.push({arguments:args,status:r.status,stdout:r.stdout,stderr:r.stderr,error:r.error?.message});
    fs.writeFileSync(path.join(reportRoot,name+'.json'),JSON.stringify({sdk:probe.stdout,platform:process.platform,commands},null,2)+'\n');
    assert.equal(r.status,0,(r.error?.message||'')+'\n'+r.stdout+'\n'+r.stderr);
    return r.stdout;
  }
  dotnet(['build',result.projectFile,'--nologo','-v','minimal']);
  const dll=path.join('Application','bin','Debug',result.report.targetFramework,result.report.project+'.dll');
  return {directory,result,dotnet,run:()=>dotnet([dll]).trim().split(/\r?\n/)};
}

test('generated .NET console executes arrays, static locals, Currency, strings and GoSub',{skip,timeout:150000},t=>{
  const h=harness(t,'core',CORE_FIXTURE,{patch(directory){
    const file=path.join(directory,'Application/__vbEntry.vb');
    fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('Public Sub Main()','Public Sub Main()\n        Global.System.Globalization.CultureInfo.CurrentCulture = Global.System.Globalization.CultureInfo.InvariantCulture'));
  }});
  assert.deepEqual(h.run(),CORE_EXPECTED);
});

test('compatibility runtime passes actual CLR value, array, Currency and Null assertions',{skip,timeout:150000},t=>{
  const native=`Option Strict On
Imports System
Imports VB6.Compatibility
Public Module Module1
    Private Sub Check(value As Boolean, message As String)
        If Not value Then Throw New Exception(message)
    End Sub
    Friend Sub __vbStart()
        Dim a As New VbArray(Of Integer)(New Integer() {-1, 2}, New Integer() {1, 3})
        a(-1, 2) = 11 : a(1, 3) = 29
        a.Resize(New Integer() {-1, 2}, New Integer() {1, 4}, True)
        Check(a(-1, 2) = 11 AndAlso a(1, 3) = 29 AndAlso a(1, 4) = 0, "Preserve")
        Dim b = a.Copy()
        b(-1, 2) = 50
        Check(a(-1, 2) = 11, "Array alias")
        Try
            a.Resize(New Integer() {-2, 2}, New Integer() {1, 4}, True)
            Throw New Exception("Bounds accepted")
        Catch ex As IndexOutOfRangeException
        End Try
        Check(a.LowerBound(1) = -1 AndAlso a(-1, 2) = 11, "Atomic resize")
        Dim strings As New VbArray(Of String)(New Integer() {1}, New Integer() {2}, True)
        Check(strings(1) = String.Empty AndAlso strings(1) IsNot Nothing, "String initialization")
        strings(1) = "x" : strings.Erase()
        Check(strings(1) IsNot Nothing AndAlso strings(1) = "", "Fixed string array erase")
        Dim padded As New VbArray(Of String)(New Integer() {1}, New Integer() {2}, True, Function() New String(" "c, 4))
        Check(padded(1).Length = 4, "Fixed width initializer")
        Check(VbCurrency.FromDecimal(12.34565D).ToDecimal() = 12.3456D, "Banker rounding")
        Check(VbCurrency.FromDecimal(12.34575D).ToDecimal() = 12.3458D, "Banker tie up")
        Try
            Dim overflow = VbCurrency.FromDecimal(922337203685477.5808D)
            Throw New Exception("Currency overflow accepted")
        Catch ex As OverflowException
        End Try
        Check(Convert.IsDBNull(VbVariant.Binary("+", DBNull.Value, 3)), "Null propagation")
        Check(Convert.IsDBNull(VbVariant.Binary("&", DBNull.Value, DBNull.Value)), "Null concatenation")
        Check(CStr(VbVariant.Binary("&", "x", DBNull.Value)) = "x", "Single Null concatenation")
        Check(Not VbVariant.Truth(DBNull.Value), "Null branch")
        Check(VbRuntime.IsMissing(VbMissing.Value) AndAlso Not VbRuntime.IsMissing(Nothing), "Missing/Empty distinction")
        Check(VbRuntime.MidAssign("abc   ", 2, "XY", 2) = "aXY   ", "Mid assignment")
        Check(VbRuntime.Align("x", 4, True) = "   x", "RSet alignment")
        Console.WriteLine("runtime-ok")
    End Sub
End Module
`;
  const h=harness(t,'runtime',project('Public Sub Main()\nEnd Sub'),{patch(directory){fs.writeFileSync(path.join(directory,'Application/Module1.vb'),native);}});
  assert.deepEqual(h.run(),['runtime-ok']);
});

test('generated .NET code preserves record copies, lazy As New and Implements dispatch',{skip,timeout:150000},t=>{
  const input=project(`Option Explicit
Public Creations As Long
Public Type Record
    Text As String * 4
    Values(1 To 2) As Long
End Type
Public Sub Main()
    Dim first As Record, second As Record
    first.Values(1) = 9
    second = first
    second.Values(1) = 2
    Debug.Print first.Values(1)
    Dim widget As New Widget
    Debug.Print Creations
    widget.Touch
    Debug.Print Creations
    Set widget = Nothing
    widget.Touch
    Debug.Print Creations
    Dim dispatch As Contract
    Set dispatch = New Implementation
    Debug.Print dispatch.Evaluate(7)
End Sub`);
  input.modules.push(
    {name:'Widget',kind:'class',code:'Private Sub Class_Initialize()\nCreations = Creations + 1\nEnd Sub\nPublic Sub Touch()\nEnd Sub'},
    {name:'Contract',kind:'class',code:'Public Function Evaluate(ByVal value As Long) As Long\nEvaluate = value\nEnd Function'},
    {name:'Implementation',kind:'class',code:'Implements Contract\nPrivate Function Contract_Evaluate(ByVal value As Long) As Long\nContract_Evaluate = value * 3\nEnd Function'}
  );
  assert.deepEqual(harness(t,'value-and-object-semantics',input).run(),['9','0','1','2','21']);
});

test('generated .NET WinForms designer constructs controls and dispatches click events',{
  skip:skip||(process.platform!=='win32'?'WinForms execution requires Windows':false),timeout:150000
},t=>{
  const h=harness(t,'winforms',formProject(),{patch(directory,result){
    const projectFile=path.join(directory,result.projectFile);
    fs.writeFileSync(projectFile,fs.readFileSync(projectFile,'utf8').replace('<OutputType>WinExe</OutputType>','<OutputType>Exe</OutputType>'));
    fs.writeFileSync(path.join(directory,'Application/__vbEntry.vb'),`Option Strict On
Imports System
Imports System.Windows.Forms
Friend Module __vbEntry
    <STAThread>
    Public Sub Main()
        Application.EnableVisualStyles()
        Using form As New MainForm()
            form.Show()
            Application.DoEvents()
            If form.Text <> "Migrated to .NET 10" Then Throw New Exception("Form_Load not wired")
            form.RunButton.PerformClick()
            form.RunButton.PerformClick()
            If form.OutputBox.Text <> "2" Then Throw New Exception("Click not wired")
            form.Close()
        End Using
        Console.WriteLine("winforms-ok")
    End Sub
End Module
`);
  }});
  assert.deepEqual(h.run(),['winforms-ok']);
});

for (const [name, input, expected] of [
  ['variant-arrays', VARIANT_ARRAY_FIXTURE, VARIANT_ARRAY_EXPECTED],
  ['currency-loops', CURRENCY_LOOP_FIXTURE, CURRENCY_LOOP_EXPECTED],
  ['select-case', SELECT_CASE_FIXTURE, SELECT_CASE_EXPECTED]
]) test('generated .NET executes '+name+' with observed values and side effects',{skip,timeout:150000},t=>{
  const h=harness(t,name,input,{patch(directory){
    const file=path.join(directory,'Application/__vbEntry.vb');
    fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('Public Sub Main()','Public Sub Main()\n        Global.System.Globalization.CultureInfo.CurrentCulture = Global.System.Globalization.CultureInfo.InvariantCulture'));
  }});
  assert.deepEqual(h.run(),expected);
});

test('Variant storage executes type, bounds, ownership and CLR array interop contracts',{skip,timeout:150000},t=>{
  const h=harness(t,'array-runtime',project('Public Sub Main()\nEnd Sub'),{patch(directory){
    fs.writeFileSync(path.join(directory,'Application/Module1.vb'),ARRAY_RUNTIME_SOURCE);
  }});
  assert.deepEqual(h.run(),['arrays-runtime-ok']);
});

function invariantCulture(directory,result){
  const entry=fs.existsSync(path.join(directory,'Application/__vbEntry.vb'))?'Application/__vbEntry.vb':'Application/Module1.vb';
  const file=path.join(directory,entry);
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/((?:Public|Private|Friend) Sub Main\(\))/, '$1\n        Global.System.Globalization.CultureInfo.CurrentCulture = Global.System.Globalization.CultureInfo.InvariantCulture'));
}

// Exercise both emitters: native optimizations must not replace compatibility-runtime coverage.
for(const [name,input,expected] of [
  ['core',CORE_FIXTURE,CORE_EXPECTED],
  ['variant-arrays',VARIANT_ARRAY_FIXTURE,VARIANT_ARRAY_EXPECTED],
  ['currency-loops',CURRENCY_LOOP_FIXTURE,CURRENCY_LOOP_EXPECTED],
  ['select-case',SELECT_CASE_FIXTURE,SELECT_CASE_EXPECTED],
  ['plain-record',project(`Public Type Point
X As Long
Y As Long
End Type
Private Sub Main()
Dim p As Point, q As Point
p.X=4
q=p
q.X=p.X+2
Debug.Print p.X
Debug.Print q.X
End Sub`),['4','6']],
  ['record-initialization',project(`Public Type Person
Name As String
Born As Date
End Type
Public Sub Main()
Dim p As Person, q As Person
q=p
q.Name="new"
Debug.Print "[" & p.Name & "]"
Debug.Print Year(p.Born)
Debug.Print q.Name
End Sub`),['[]','1899','new']],
  ['native-arrays',project(`Public Sub Main()
Dim values(0 To 9) As Long, i As Long
For i=0 To 9
values(i)=i*i
Next
Debug.Print values(3)
Erase values
Debug.Print values(3)
Dim a() As Long, b() As Long
ReDim a(2)
a(0)=9
b=a
b(0)=2
ReDim Preserve a(4)
Debug.Print a(0)
Debug.Print a(4)
Debug.Print b(0)
End Sub`),['9','0','9','0','2']],
  ['native-references',project(`Public Sub Main()
Dim a(2) As Long
a(0)=1
Mutate a(0), a(0)
Debug.Print a(0)
End Sub
Public Sub Mutate(ByRef first As Long, ByRef second As Long)
first=7
second=second+1
End Sub`),['8']],
  ['shifted-vector',project(`Public Sub Main()
Dim a(-2 To 2) As Long, d As Long
a(-2)=7
d=1
Debug.Print a(-2)
Debug.Print LBound(a,d)
Debug.Print UBound(a)
Erase a
Debug.Print a(-2)
End Sub`),['7','-2','2','0']],
  ['native-strings',project(`Public Sub Main()
Dim a() As String, b() As String
a=Split("one,two,three",",")
b=Filter(a,"t")
Debug.Print Join(b,"|")
End Sub`),['two|three']],
  ['native-return',project(`Public Sub Main()
Debug.Print Twice(21)
End Sub
Public Function Twice(ByVal value As Long) As Long
Twice=value*2
End Function`),['42']]
])test('native-first .NET execution: '+name,{skip,timeout:150000},t=>{
 const h=harness(t,'native-'+name,input,{codeStyle:'native',patch:invariantCulture});
 assert.deepEqual(h.run(),expected);
 if(['plain-record','record-initialization','native-arrays','native-references','native-strings','native-return'].includes(name)){
  assert.deepEqual(h.result.report.runtime.features,[]);
  assert.doesNotMatch(h.result.files[h.result.projectFile],/ProjectReference|PackageReference/);
 }
});

test('approved Decimal modernization compiles without Currency support',{skip,timeout:150000},t=>{
 const input=project('Public Sub Main()\nDim c As Currency\nc=1.23456@\nDebug.Print CStr(c)\nFor c=1 To 2 Step .5\nDebug.Print c\nNext\nEnd Sub');
 const h=harness(t,'native-decimal',input,{codeStyle:'native',runtime:'none',semanticPolicy:'modernize',acceptedRules:['currency-decimal'],strict:true,patch:invariantCulture});
 assert.deepEqual(h.run(),['1.23456','1','1.5','2']);assert.deepEqual(h.result.report.runtime.features,[]);
});

test('minimal Currency project compiles under a nonempty root namespace',{skip,timeout:150000},t=>{
 const h=harness(t,'native-root-namespace',project('Public Sub Main()\nDim c As Currency\nc=1.23456@\nDebug.Print CStr(c)\nEnd Sub'),{codeStyle:'native',rootNamespace:'Company.Migrated',strict:true,patch:invariantCulture});
 assert.deepEqual(h.run(),['1.2346']);assert.deepEqual(h.result.report.runtime.features,['VbCurrency']);
});

test('native WinForms output constructs and dispatches without compatibility support',{
 skip:skip||(process.platform!=='win32'?'WinForms execution requires Windows':false),timeout:150000
},t=>{
 const h=harness(t,'native-winforms',formProject(),{codeStyle:'native',runtime:'none',patch(directory,result){
  const projectFile=path.join(directory,result.projectFile);
  fs.writeFileSync(projectFile,fs.readFileSync(projectFile,'utf8').replace('<OutputType>WinExe</OutputType>','<OutputType>Exe</OutputType>'));
  fs.writeFileSync(path.join(directory,'Application/__vbEntry.vb'),`Imports System
Imports System.Windows.Forms
Friend Module __vbEntry
<STAThread>
Public Sub Main()
 Application.EnableVisualStyles()
 Using form As New MainForm()
  form.Show()
  Application.DoEvents()
  If form.Text <> "Migrated to .NET 10" Then Throw New Exception("load")
  form.RunButton.PerformClick()
  form.RunButton.PerformClick()
  If form.OutputBox.Text <> "2" Then Throw New Exception("click")
  form.Close()
 End Using
 Console.WriteLine("native-winforms-ok")
End Sub
End Module
`);
 }});
 assert.deepEqual(h.result.report.runtime.features,[]);assert.deepEqual(h.run(),['native-winforms-ok']);
});


test('approved Decimal intrinsics retain the selected native representation',{skip,timeout:150000},t=>{
 const input=project('Public Sub Main()\nDim c As Currency\nc=CCur(1.23456)\nDebug.Print CStr(Abs(c))\nDebug.Print Sgn(c)\nDebug.Print Round(c,2)\nDebug.Print Len(c)\nDebug.Print VarType(c)\nIf c Then Debug.Print "truth"\nEnd Sub');
 const h=harness(t,'native-decimal-intrinsics',input,{codeStyle:'native',runtime:'none',semanticPolicy:'modernize',acceptedRules:['currency-decimal'],strict:true,patch:invariantCulture});
 assert.deepEqual(h.run(),['1.23456','1','1.23','16','14','truth']);assert.deepEqual(h.result.report.runtime.features,[]);
});


test('native typed constant ranges execute without compatibility support',{skip,timeout:150000},t=>{
 const input=project('Public Sub Main()\nDim value As Long\nvalue=4\nSelect Case value\nCase 0 To 5\nDebug.Print "hit"\nCase Else\nDebug.Print "miss"\nEnd Select\nEnd Sub');
 const h=harness(t,'native-constant-range',input,{codeStyle:'native',runtime:'none',strict:true});
 assert.deepEqual(h.run(),['hit']);assert.deepEqual(h.result.report.runtime.features,[]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {convertVbNetProject} from '../src/migration/index.js';
import {project,procedure,formProject} from './migration-fixtures.mjs';

const convert=(input,options={})=>convertVbNetProject(input,{platform:'AnyCPU',includeOriginals:false,codeStyle:'native',...options});
const source=result=>result.files['Application/Module1.vb'];
function good(result){assert.ok(result.success,JSON.stringify(result.diagnostics));return result;}
function noRuntime(result){
  good(result);
  assert.deepEqual(result.report.runtime.features,[]);
  assert.equal(Object.keys(result.files).some(p=>p.startsWith('VB6.Compatibility')||p.startsWith('Application/Compatibility/')),false);
  assert.doesNotMatch(result.files[result.projectFile],/ProjectReference|PackageReference/);
  for(const [path,text] of Object.entries(result.files))if(path.endsWith('.vb'))assert.doesNotMatch(text,/Imports VB6\.Compatibility/);
}

test('native-first empty and scalar programs need no compatibility runtime',()=>{
  const result=convert(procedure('Dim n As Long\nn = 21\nDebug.Print n * 2'));
  noRuntime(result);assert.match(source(result),/n As Integer/);
  assert.doesNotMatch(source(result),/__vbStart|\[n\]/);
});

test('record fields bind statically and numeric records use ordinary value semantics',()=>{
  const result=convert(project(`Option Explicit
Public Type Point
 X As Long
 Y As Long
End Type
Public Sub Main()
 Dim p As Point, q As Point
 p.X = 4
 q = p
 q.X = p.X + 2
 Debug.Print q.X
End Sub`));
  noRuntime(result);
  assert.match(source(result),/Public Structure Point/);
  assert.doesNotMatch(source(result),/IVbValue|CopyValue|Function Create|VbVariant/);
});

test('local zero-based scalar arrays lower to native CLR arrays and retain fixed Erase',()=>{
  const result=convert(procedure('Dim values(0 To 9) As Long, i As Long\nFor i = 0 To 9\nvalues(i) = i * i\nNext\nErase values\nDebug.Print values(3)'));
  noRuntime(result);assert.match(source(result),/values As Integer\(\)/);
  assert.match(source(result),/System\.Array\.Clear/);
});

test('runtime none diagnoses a required feature instead of dropping support',()=>{
  const result=convert(procedure('Dim amount As Currency\namount = 1.23456@\nDebug.Print amount'),{runtime:'none'});
  assert.equal(result.success,false);
  assert.ok(result.diagnostics.some(d=>d.code==='MIG_RUNTIME_REQUIRED'));
  assert.ok(result.report.runtime.features.includes('VbCurrency'));
  assert.match(result.files['Directory.Build.targets'],/RequireResolvedMigration/);
});

test('minimal runtime exports only selected Currency support',()=>{
  const result=good(convert(procedure('Dim amount As Currency\namount = 1.23456@\nDebug.Print amount')));
  assert.ok(result.report.runtime.features.includes('VbCurrency'));
  assert.equal(Object.keys(result.files).some(p=>p.endsWith('/VbArray.vb')),false);
  assert.doesNotMatch(result.files[result.projectFile],/ProjectReference/);
  assert.ok(Object.keys(result.files).some(p=>p==='Application/Compatibility/VbCurrency.vb'));
});

test('behavior-changing Decimal modernization is explicit and recorded',()=>{
  assert.throws(()=>convert(procedure(''),{semanticPolicy:'modernize'}),/rule/i);
  const result=convert(procedure('Dim amount As Currency\namount = 1.23456@\nDebug.Print amount'),
    {semanticPolicy:'modernize',acceptedRules:['currency-decimal'],runtime:'none'});
  noRuntime(result);assert.match(source(result),/amount As Decimal/);
  assert.ok(result.report.modernization.some(item=>item.rule==='currency-decimal'));
});

test('native function tail return removes only provably redundant result scaffolding',()=>{
  const result=convert(project('Public Function Twice(ByVal value As Long) As Long\nTwice = value * 2\nEnd Function'),{target:'library'});
  noRuntime(result);assert.match(source(result),/Return /);assert.doesNotMatch(source(result),/__vbResult/);
});

test('legacy compatibility profile remains explicitly available',()=>{
  const result=good(convert(procedure('Dim values(0 To 2) As Long'),{codeStyle:'compatibility',runtime:'project'}));
  assert.ok(result.files['VB6.Compatibility/src/VbArray.vb']);
  assert.match(source(result),/VbArray/);
});

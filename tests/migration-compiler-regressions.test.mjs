import test from 'node:test';
import assert from 'node:assert/strict';
import {convertVbNetProject} from '../src/migration/index.js';
import {RUNTIME_FEATURES} from '../src/migration/runtime-sources.js';
import {project,formProject} from './migration-fixtures.mjs';

test('private startup retains visibility and an accessible in-module forwarding entry',()=>{
  const input=project('Private Sub Main()\nDebug.Print "private"\nEnd Sub');
  const result=convertVbNetProject(input,{runtime:'none',platform:'AnyCPU'});
  assert.ok(result.success,JSON.stringify(result.diagnostics));
  assert.deepEqual(result.report.runtime.features,[]);
  assert.match(result.files['Application/Module1.vb'],/Private Sub Main\(\)/);
  assert.match(result.files['Application/Module1.vb'],/Friend Sub __vbStart\(\)/);
  assert.match(result.files['Application/__vbEntry.vb'],/Module1\.__vbStart\(\)/);
  assert.match(result.files[result.projectFile],/<StartupObject>__vbEntry<\/StartupObject>/);
});

test('shifted vector helper never gives its parameter the function name',()=>{
  const source=RUNTIME_FEATURES['VbNativeArrays.Index'].source;
  assert.match(source,/Function Index\(subscript As Integer/);
  assert.match(source,/CLng\(subscript\) - CLng\(lower\)/);
  assert.doesNotMatch(source,/Function Index\(index\b/i);
});

test('native parameterless form events remain strict without narrowing AddressOf conversion',()=>{
  const result=convertVbNetProject(formProject(),{runtime:'none',strict:true});
  assert.ok(result.success,JSON.stringify(result.diagnostics));
  const source=result.files['Application/MainForm.Designer.vb'];
  assert.match(source,/Option Strict On/);
  assert.match(source,/AddHandler Me\.Load, Sub\(sender As Object, e As EventArgs\) Form_Load\(\)/);
  assert.match(source,/AddHandler Me\.RunButton\.Click, Sub\(sender As Object, e As EventArgs\) RunButton_Click\(\)/);
  assert.doesNotMatch(source,/AddressOf (Form_Load|RunButton_Click)|__vbEvent/);
  assert.deepEqual(result.report.runtime.features,[]);
});

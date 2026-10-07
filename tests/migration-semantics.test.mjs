import test from 'node:test';
import assert from 'node:assert/strict';
import {convertVbNetProject} from '../src/migration/index.js';
import {project, procedure} from './migration-fixtures.mjs';

function converted(input) {
  const result = convertVbNetProject(input, {platform: 'AnyCPU'});
  assert.equal(result.success, true, JSON.stringify(result.diagnostics));
  return result.files['Application/Module1.vb'];
}

test('Currency For uses the native overloaded loop with explicit Currency bounds and step', () => {
  const code = converted(procedure('Dim c As Currency\nFor c = 1 To 3 Step .25\nDebug.Print CStr(c)\nNext c'));
  assert.match(code, /For c = VbCurrency\.FromObject\(1S\) To VbCurrency\.FromObject\(3S\) Step VbCurrency\.FromObject\(/);
  assert.match(code, /Next c/);
  assert.doesNotMatch(code, /While|__vbFor/);
});

test('Variant Select Case captures selector once and keeps ordered null-aware case predicates', () => {
  const code = converted(project(`Option Explicit
Public Function Pick() As Variant
    Pick = 2
End Function
Public Sub Main()
    Select Case Pick()
    Case Null
        Debug.Print "wrong"
    Case 1 To 3, 9
        Debug.Print "match"
    Case Else
        Debug.Print "else"
    End Select
End Sub`));
  assert.match(code, /Dim __vbSelect\d+ As Object = Pick\(\)/);
  assert.match(code, /Select Case True/);
  assert.match(code, /VbVariant\.Truth\(VbVariant\.Binary\("="/);
  assert.match(code, /VbVariant\.Binary\(">="/);
  assert.match(code, /VbVariant\.Binary\("<="/);
  assert.equal((code.match(/= Pick\(\)/g) || []).length, 1);
});

test('Variant array ReDim and Erase are explicit runtime operations, not late calls on Nothing', () => {
  const code = converted(procedure(`Dim a As Variant
ReDim a(-1 To 2) As Long
a(-1) = 7
ReDim Preserve a(-1 To 3)
Debug.Print a(-1)
Erase a`));
  assert.match(code, /a = VbArrays\.ResizeVariant\(a,/);
  assert.match(code, /GetType\(Integer\)/);
  assert.match(code, /VbArrays\.Element\(a, New Object\(\) \{/);
  assert.match(code, /a = VbArrays\.EraseVariant\(a\)/);
  assert.doesNotMatch(code, /a\.Resize\(/);
});

test('ByVal Variant entry copies array values rather than sharing the caller storage', () => {
  const code = converted(project('Public Sub Main()\nEnd Sub\nPublic Sub Edit(ByVal a As Variant)\na(0) = 9\nEnd Sub'));
  assert.match(code, /a = VbRuntime\.CopyValue\(a\)/);
});

test('typed arrays cannot silently change element type or redimension fixed storage', () => {
  for (const body of ['Dim a() As Long\nReDim a(2) As String', 'Dim a(2) As Long\nReDim a(3)', 'Dim a As Long\nReDim a(3)']) {
    const result = convertVbNetProject(procedure(body), {platform:'AnyCPU'});
    assert.equal(result.success, false, body);
    assert.ok(result.diagnostics.some(d => d.code.startsWith('MIG_REDIM_')), JSON.stringify(result.diagnostics));
  }
});

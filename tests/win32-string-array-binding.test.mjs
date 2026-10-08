import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/project/model.js';
import {compileWin32} from '../src/native/compiler.js';
import {nativeStringLibraryFixture} from '../tools/win32-string-library-fixtures.mjs';
function project(body,handlers=''){
 const p=newProject('StringArrayBinding');p.modules[0].code=`Option Explicit\nPrivate Sub Form_Load()\n${body}\nEnd Sub\n${handlers}`;return p;
}
for(const optimization of [0,1,2])test('String-array execution fixture compiles deterministically at O'+optimization,()=>{
 const {project:p,checks}=nativeStringLibraryFixture(),before=JSON.stringify(p),a=compileWin32(p,{optimization});assert.ok(checks.length>=87);assert.deepEqual(a.bytes,compileWin32(p,{optimization}).bytes);assert.equal(JSON.stringify(p),before);assert.equal(a.report.extraction,false);
});
test('private array kernels preserve user-only source maps',()=>{
 // The compiler source map has only user procedures; no private runtime module is injected.
 const p=project('Dim s As String\ns=Join(Split("a,b",","),"-")');assert.ok(compileWin32(p).report.sourceMap.every(s=>s.source==='Form1'));
});
for(const [body,pattern] of [
 ['Dim a() As Long\na=Split("x")',/dynamic variable-length String/],
 ['Dim a(1) As String\na=Split("x")',/dynamic variable-length String/],
 ['Dim a() As String * 3\na=Split("x")',/dynamic variable-length String/],
 ['Dim a() As Long\nDim s As String\ns=Join(a)',/String array/],
 ['Dim s As String\ns=Join("x")',/String array/],
 ['Dim a() As String\na=Split()',/required|argument/i],
 ['Dim a() As String\na=Split("x",bogus:=1)',/Unknown|argument/i],
 ['Dim a() As String\na=Split("x",expression:="y")',/Duplicate|argument/i],
 ['Dim a() As String\na=Filter()',/required|argument/i],
 ['Dim s As String\ns=Split("x")(0,1)',/index|argument/i]
])test('array-string lowering diagnoses '+body,()=>assert.throws(()=>compileWin32(project(body)),pattern));
test('user Join procedures shadow the native builtin',()=>{
 assert.doesNotThrow(()=>compileWin32(project('Dim s As String\ns=Join(12)',`Private Function Join(ByVal x As Long) As String\nJoin=CStr(x)\nEnd Function`)));
});
for(const body of [
 'Dim a() As String\na=Split(expression:="a,b",delimiter:=",",limit:=2,compare:=0)',
 'Dim a() As String\nDim s As String\na=Split("a,b",",")\ns=Join(delimiter:="-",sourcearray:=a)',
 'Dim a() As String\na=Filter(match:="a",sourcearray:=Split("a,b",","))',
 'Dim s As String\ns=Filter(Split("a,b",","),"a")(0)',
 'Dim n As Long\nn=UBound(Split("a,b",","),1)'
])test('named and nested native String-array compilation: '+body,()=>assert.doesNotThrow(()=>compileWin32(project(body))));

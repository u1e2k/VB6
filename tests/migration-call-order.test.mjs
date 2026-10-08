import test from 'node:test';
import assert from 'node:assert/strict';
import {convertVbNetProject} from '../src/migration/index.js';
import {compileProject} from '../src/language/compiler.js';
import {VirtualMachine} from '../src/runtime/vm.js';
import {CALL_ORDER_FIXTURE,CALL_ORDER_EXPECTED} from './migration-call-order-fixtures.mjs';
import {OPTIONAL_FIXTURE} from './migration-optional-fixtures.mjs';
import {project} from './migration-fixtures.mjs';

for(const codeStyle of ['native','compatibility'])test(codeStyle+': reorder named values using typed positional adapters, not named call text',()=>{
 const r=convertVbNetProject(CALL_ORDER_FIXTURE,{platform:'AnyCPU',codeStyle,strict:true});
 assert.ok(r.success,JSON.stringify(r.diagnostics));
 const source=r.files['Application/Module1.vb'];
 assert.match(source,/__vbCallOrder\d+\]?\(\[?Mark\]?\(2S\), \[?Mark\]?\(1S\)\)/);
 assert.match(source,/Private Function __vbCallOrder\d+\(ByVal __vbArg1 As Integer, ByVal __vbArg0 As Integer\) As Integer/);
 assert.match(source,/ByVal __vbReceiver As \[?Calculator\]?, ByVal __vbArg1 As Integer, ByVal __vbArg0 As Integer/);
 assert.match(source,/Return __vbReceiver.\[?Sum\]?\(__vbArg0, __vbArg1\)/);
 assert.match(source,/Private Sub __vbCallOrder\d+\(ByRef __vbArg1 As Integer, ByRef __vbArg0 As Integer\)/);
 assert.match(source,/While .*__vbCallOrder/);
 const adapters=source.slice(source.indexOf('    Private Function __vbCallOrder'));
 assert.doesNotMatch(adapters,/Function\(\)|DynamicInvoke|New Object\(\) \{/);
});

test('optional Currency uses the same typed permutation without boxing or resetting defaults',()=>{
 const r=convertVbNetProject(OPTIONAL_FIXTURE,{platform:'AnyCPU'});
 assert.ok(r.success,JSON.stringify(r.diagnostics));
 assert.match(r.files['Application/Module1.vb'],/Private Function __vbCallOrder\d+\(ByVal __vbArg1 As VbCurrency, ByVal __vbArg0 As VbCurrency\) As VbCurrency/);
 assert.match(r.files['Application/Module1.vb'],/Return Module1.Price\(__vbArg0, __vbArg1\)/);
});

test('already ordered names remain idiomatic and require no generated forwarding method',()=>{
 const r=convertVbNetProject(project('Public Sub Main()\nDebug.Print Add(a:=1,b:=2)\nEnd Sub\nPublic Function Add(ByVal a As Long, ByVal b As Long) As Long\nAdd=a+b\nEnd Function'),{runtime:'none'});
 assert.ok(r.success,JSON.stringify(r.diagnostics));
 assert.doesNotMatch(r.files['Application/Module1.vb'],/__vbCallOrder/);
});

test('permutations are reused and do not leak between independent conversions',()=>{
 const a=convertVbNetProject(CALL_ORDER_FIXTURE,{platform:'AnyCPU'}),b=convertVbNetProject(CALL_ORDER_FIXTURE,{platform:'AnyCPU'});
 assert.deepEqual(a.files,b.files);
 assert.equal((a.files['Application/Module1.vb'].match(/Private (Function|Sub) __vbCallOrder/g)||[]).length,4);
 assert.deepEqual(a.report.runtime.features,[]);
});

test('source VM independently exercises the named-argument fixture expectations',async()=>{
 const compiled=compileProject(CALL_ORDER_FIXTURE),output=[];
 assert.deepEqual(compiled.diagnostics,[]);
 await new VirtualMachine(compiled,{print:value=>output.push(value)}).start();
 assert.deepEqual(output,CALL_ORDER_EXPECTED);
});

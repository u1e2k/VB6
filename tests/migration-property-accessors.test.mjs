
import test from 'node:test';
import assert from 'node:assert/strict';
import {convertVbNetProject} from '../src/migration/index.js';
import {propertyPlan} from '../src/migration/property-plan.js';
import {compileProject} from '../src/language/compiler.js';

import {PROPERTY_FIXTURE} from './migration-property-fixtures.mjs';

const convert=(input,options={})=>convertVbNetProject(input,{platform:'AnyCPU',...options});
for(const codeStyle of ['native','compatibility'])test(codeStyle+': mutable indexes and independent Let/Set lower to real accessor methods',()=>{
  const result=convert(PROPERTY_FIXTURE,{codeStyle});
  assert.ok(result.success,JSON.stringify(result.diagnostics));
  const body=result.files['Application/Box.vb'],main=result.files['Application/Module1.vb'];
  assert.match(body,/Function \[?__vbGet_Item\]?\(ByRef \[?index\]? As Integer\)/);
  assert.match(body,/Sub \[?__vbLet_Item\]?\(ByRef \[?index\]? As Integer, ByVal \[?amount\]? As Integer\)/);
  assert.match(body,/Sub \[?__vbLet_Value\]?\(/);
  assert.match(body,/Sub \[?__vbSet_Value\]?\(/);
  assert.ok(main.includes(codeStyle==='native'?'.__vbLet_Value(amount:=17S)':'.[__vbLet_Value]([amount]:=VbRuntime.CopyValue(17S))')); 
  assert.match(main,/__vbSet_Value/);
  assert.match(main,/__vbLet_WriteOnly/);
  assert.doesNotMatch(body,/Property \[?(Item|Value|WriteOnly)\]?/);
});

test('ordinary ByVal indexed properties remain idiomatic properties',()=>{
  const result=convert({name:'Native',startup:'Sub Main',settings:{},modules:[{name:'C',kind:'class',code:`Public Property Get Item(ByVal index As Long) As Long
Item=index
End Property
Public Property Let Item(ByVal index As Long, ByVal value As Long)
End Property`}]},{target:'library',runtime:'none'});
  assert.ok(result.success,JSON.stringify(result.diagnostics));
  assert.match(result.files['Application/C.vb'],/Public Property Item\(/);
  assert.doesNotMatch(result.files['Application/C.vb'],/__vbGet_Item/);
});

test('write-only accessor binding uses the setter value type',()=>{
  const compiled=compileProject(PROPERTY_FIXTURE,{retainSyntax:true});
  const plan=propertyPlan(compiled.modules.get('box'),'WriteOnly');
  assert.equal(plan.get,undefined);assert.equal(plan.let.params.at(-1).type,'Long');assert.equal(plan.methods,true);
});

test('attempted reads of write-only method-backed properties stay blocking',()=>{
  const input=structuredClone(PROPERTY_FIXTURE);
  input.modules[0].code='Public Sub Main()\nDim c As New Box, i As Long\nDebug.Print c.WriteOnly(i)\nEnd Sub';
  const result=convert(input);
  assert.equal(result.success,false);assert.ok(result.diagnostics.some(d=>d.code==='MIG_PROPERTY_ACCESSOR'));
});

test('accessor methods preserve Implements interface dispatch',()=>{
  const input={name:'Contracts',startup:'Sub Main',settings:{},modules:[
    {name:'Contract',kind:'class',code:'Public Property Get Item(ByRef index As Long) As Long\nEnd Property\nPublic Property Let Item(ByRef index As Long, ByVal value As Long)\nEnd Property'},
    {name:'Impl',kind:'class',code:'Implements Contract\nPrivate Property Get Contract_Item(ByRef index As Long) As Long\nindex=index+1\nContract_Item=index\nEnd Property\nPrivate Property Let Contract_Item(ByRef index As Long, ByVal value As Long)\nindex=value\nEnd Property'},
    {name:'Module1',kind:'module',code:'Public Sub Main()\nDim c As Contract, i As Long\nSet c=New Impl\nc.Item(i)=4\nDebug.Print c.Item(i)\nDebug.Print i\nEnd Sub'}]};
  const result=convert(input);assert.ok(result.success,JSON.stringify(result.diagnostics));
  assert.match(result.files['Application/Contract.vb'],/Interface IContract/);
  assert.match(result.files['Application/Impl.vb'],/Implements IContract.__vbGet_Item/);
  assert.match(result.files['Application/Impl.vb'],/Implements IContract.__vbLet_Item/);
});

test('known default indexed properties use the same method plan at call sites',()=>{
  const input=structuredClone(PROPERTY_FIXTURE);
  input.modules[1].code+='\nAttribute Item.VB_UserMemId = 0\n';
  input.modules[0].code='Public Sub Main()\nDim c As New Box, i As Long\nc(i)=9\nDebug.Print c(i)\nEnd Sub';
  const result=convert(input);
  assert.ok(result.success,JSON.stringify(result.diagnostics));
  assert.match(result.files['Application/Module1.vb'],/__vbLet_Item\(i, amount:=9S\)/);
  assert.match(result.files['Application/Module1.vb'],/__vbGet_Item\(i\)/);
});

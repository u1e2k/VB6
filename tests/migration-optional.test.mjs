import test from 'node:test';
import assert from 'node:assert/strict';
import {convertVbNetProject} from '../src/migration/index.js';
import {OPTIONAL_FIXTURE,OPTIONAL_INTERFACE_FIXTURE} from './migration-optional-fixtures.mjs';
import {project} from './migration-fixtures.mjs';

for(const codeStyle of ['native','compatibility'])test(codeStyle+': optional Currency uses typed, linear forwarding overloads',()=>{
 const r=convertVbNetProject(OPTIONAL_FIXTURE,{codeStyle,platform:'AnyCPU'});
 assert.ok(r.success,JSON.stringify(r.diagnostics));
 const source=r.files['Application/Module1.vb'];
 assert.equal((source.match(/Overloads Function \[?Price\]?\(/g)||[]).length,3);
 assert.match(source,/Overloads Function \[?Price\]?\(\) As VbCurrency/);
 assert.match(source,/ByRef \[?amount\]? As VbCurrency/);
 assert.doesNotMatch(source,/Optional .* As VbCurrency/);
 assert.match(source,/Price\]?\(\)/);
 assert.ok(source.indexOf('Mark](2S)')<source.indexOf('Mark](1S)')||source.indexOf('Mark(2S)')<source.indexOf('Mark(1S)'));
 assert.match(source,/extra\]?:=VbCurrency.FromObject\(7S\)/);
 assert.doesNotMatch(source,/Optional .*VbCurrency.FromDecimal/);
});

test('optional Currency interface members and implementing wrappers share signatures',()=>{
 const r=convertVbNetProject(OPTIONAL_INTERFACE_FIXTURE,{platform:'AnyCPU'});
 assert.ok(r.success,JSON.stringify(r.diagnostics));
 assert.match(r.files['Application/Contract.vb'],/Overloads Function Amount\(\) As VbCurrency/);
 assert.equal((r.files['Application/Implementation.vb'].match(/Implements IContract.Amount/g)||[]).length,2);
});

test('optional Currency defaults are exact at both 64-bit endpoints',()=>{
 const input=project('Public Sub Main()\nPrintDefaults last:=1@\nEnd Sub\nPublic Sub PrintDefaults(Optional ByVal low As Currency=-922337203685477.5808@, Optional ByVal high As Currency=922337203685477.5807@, Optional ByVal last As Currency=0@)\nEnd Sub');
 const r=convertVbNetProject(input,{platform:'AnyCPU'});
 assert.ok(r.success,JSON.stringify(r.diagnostics));
 assert.match(r.files['Application/Module1.vb'],/FromDecimal\(-922337203685477.5808D\)/);
 assert.match(r.files['Application/Module1.vb'],/FromDecimal\(922337203685477.5807D\)/);
});

test('optional defaults are bound in the callee module despite caller shadowing',()=>{
 const input=project('Private Const DefaultAmount As Currency=99@\nPublic Sub Main()\nDebug.Print Other.Amount(extra:=0@)\nEnd Sub');
 input.modules.push({name:'Other',kind:'module',code:'Private Const DefaultAmount As Currency=1.2345@\nPublic Function Amount(Optional ByVal value As Currency=DefaultAmount, Optional ByVal extra As Currency=0@) As Currency\nAmount=value+extra\nEnd Function'});
 const r=convertVbNetProject(input,{platform:'AnyCPU'});
 assert.ok(r.success,JSON.stringify(r.diagnostics));
 assert.match(r.files['Application/Module1.vb'],/value:=VbCurrency.FromDecimal\(1.2345D\)/);
});

test('ordinary and approved Decimal optional parameters remain native metadata',()=>{
 for(const [input,options] of [[project('Public Function F(Optional ByVal value As Long=42) As Long\nF=value\nEnd Function'),{}],
  [project('Public Function F(Optional ByVal value As Currency=1.25@) As Currency\nF=value\nEnd Function'),{semanticPolicy:'modernize',acceptedRules:['currency-decimal']}]]){
  const r=convertVbNetProject(input,{target:'library',runtime:'none',...options});
  assert.ok(r.success,JSON.stringify(r.diagnostics));
  assert.match(r.files['Application/Module1.vb'],/Optional ByVal value As (Integer|Decimal)/);
  assert.doesNotMatch(r.files['Application/Module1.vb'],/Overloads/);
 }
});

test('read-only optional Currency indexes share overload lowering',()=>{
 const input={name:'OptionalProperty',settings:{},modules:[{name:'Value',kind:'class',code:'Public Property Get Amount(Optional ByVal value As Currency=1.2345@) As Currency\nAmount=value\nEnd Property'}]};
 const r=convertVbNetProject(input,{target:'library'});
 assert.ok(r.success,JSON.stringify(r.diagnostics));
 assert.match(r.files['Application/Value.vb'],/Overloads Function __vbGet_Amount\(\) As VbCurrency/);
});

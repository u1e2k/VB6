import test from 'node:test';
import assert from 'node:assert/strict';
import {planNativeInStrArguments} from '../src/native/calls.js';
import {nativeStringLibraryMethods,emitNativeStringLibrary} from '../src/native/string-library.js';
import {parseExpression} from '../src/language/expression.js';
import {compileWin32} from '../src/native/compiler.js';
import {newProject} from '../src/project/model.js';
import {X86} from '../src/native/x86.js';
import {BinarySection,PE32Image} from '../src/native/pe32.js';
import {nativeStringLibraryFixture} from '../tools/win32-string-library-fixtures.mjs';
const plan=text=>planNativeInStrArguments(parseExpression(text).args);
const project=body=>({...newProject('NativeStringBinding'),startup:'Sub Main',modules:[{id:'m',name:'Entry',kind:'module',code:'Sub Main()\nDim s As String,n As Long\n'+body+'\nEnd Sub'}]});

test('InStr positional shorthand maps its two strings after an omitted start',()=>{
 const p=plan('InStr("haystack","needle")');assert.deepEqual(p.slots.map(x=>x.omitted),[true,false,false,true]);
 assert.deepEqual(p.order.map(x=>x.index),[1,2,0,3]);assert.equal(p.slots[1].node.value,'haystack');
});
test('InStr named and omitted arguments retain authored evaluation order and input identity',()=>{
 const node=parseExpression('InStr(compare:=1,string2:=Mark(2),start:=Mark(1),string1:=Mark(3))'),before=JSON.stringify(node);
 const p=planNativeInStrArguments(node.args);assert.deepEqual(p.order.map(x=>x.index),[3,2,0,1]);assert.equal(JSON.stringify(node),before);
 assert.deepEqual(plan('InStr(,"abc","b")').slots.map(x=>x.omitted),[true,false,false,true]);
});
for(const text of ['InStr()','InStr(1)','InStr(1,2,3,4,5)','InStr(,,"b")','InStr(string1:="a")','InStr(string1:="a",string2:="b",compare:=1)','InStr(,"a","b",1)','InStr(start:=1,1,"b")','InStr(start:=1,START:=2,string1:="a",string2:="b")','InStr(typo:="a",string2:="b")'])test('InStr validates before emission: '+text,()=>assert.throws(()=>plan(text)));
for(const expression of ['Replace()','Replace("x","y")','Replace("a","b","c",1,-1,0,0)','Replace("a",,"c")','Replace(expression:="a",find:="a",replace:="b",typo:=0)','Replace("a",expression:="b",find:="a",replace:="c")'])test('Replace rejects invalid signatures: '+expression,()=>assert.throws(()=>compileWin32(project('s='+expression)),/expects/));

test('Replace lowering stages strings in authored order and keeps Option Compare defaults',()=>{
 for(const option of ['binary','text']){
  const trace=[],section=new BinarySection('.text',0),x=new X86(section,new PE32Image());let offset=0;
  const c={...nativeStringLibraryMethods,x,context:{module:{module:{optionCompare:option}}},resolveProcedure:()=>null,
   fail:message=>{throw Error(message);},arrayWorkspace:()=>({offset:offset-=4}),ownString:()=>trace.push(['own']),
   textExpression:expr=>{trace.push(['text',expr.value]);x.value(0);},numeric:expr=>{trace.push(['number',expr.value]);x.value(expr.value);}};
  const node=parseExpression('Replace(replace:="replacement",expression:="source",find:="find")');
  assert.equal(c.stringLibraryBuiltin(node,'replace'),true);assert.equal(c.nativeReplaceUsed,true);
  assert.deepEqual(trace,[['text','replacement'],['text','source'],['text','find'],['number',1],['number',-1],['number',option==='text'?1:0],['own']]);
  assert.ok(section.fixups.some(f=>f.label==='native:string-library:replace'));assert.equal(c.stringLibraryType(node),'string');
 }
});
test('Replace machine helper is emitted only after an actual builtin use',()=>{
 for(const enabled of [false,true]){const section=new BinarySection('.text',0),c={x:new X86(section,new PE32Image()),nativeReplaceUsed:enabled};emitNativeStringLibrary(c);assert.equal(section.labels.has('native:string-library:replace'),enabled);}
});
test('project procedures continue to shadow Replace and InStr builtins',()=>{
 for(const name of ['Replace','InStr']){const p=project('n='+name+'(7)');p.modules[0].code+='\nFunction '+name+'(ByVal n As Long) As Long\n'+name+'=n\nEnd Function';assert.ok(compileWin32(p).bytes.length);}
});
for(const options of [{optimization:0},{optimization:1},{optimization:2},{optimization:2,pruneUnusedProcedures:true}])test('expanded native string fixture links deterministically '+JSON.stringify(options),()=>{
 const {project:p,checks}=nativeStringLibraryFixture(),before=JSON.stringify(p),a=compileWin32(p,options);
 assert.ok(checks.length>=50);assert.deepEqual(a.bytes,compileWin32(p,options).bytes);assert.equal(JSON.stringify(p),before);
 assert.ok(checks.some(s=>s.includes('output budget')));assert.ok(checks.some(s=>s.includes('Option Compare')));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {compileWin32,extractNativeDeclarations,NativeCompileError} from '../src/native/compiler.js';
import {compileProject} from '../src/language/compiler.js';
import {lowerNativeDeclarations} from '../src/native/declarations.js';
const module=(code,name='MainModule')=>({id:name,name,kind:'module',code});
const project=(code,settings={})=>({schema:1,name:'NativeSharedDeclarations',startup:'Sub Main',modules:[module(code)],settings});
const main=body=>'Sub Main\n'+body+'\nEnd Sub';
for(const args of ['', '()', ' ( )'])test('native Declare accepts empty argument-list spelling '+JSON.stringify(args),()=>{
  const source='Private Declare Function Tick Lib "kernel32" Alias "GetTickCount"'+args+' As Long\n'+main('Dim n As Long\nn = Tick()');
  const p=project(source),before=structuredClone(p),out=compileWin32(p);
  assert.ok(out.report.imports.some(i=>i.symbol==='GetTickCount'));
  assert.deepEqual(p,before);assert.equal(out.bytes[0],0x4d);
});
for(const name of ['[Then]','Żółć','Tick&'])test('native Declare preserves escaped/Unicode/suffixed source identifiers '+name,()=>{
  const out=compileWin32(project('Declare Function '+name+' Lib "kernel32" Alias "GetTickCount" As Long\n'+main('Dim n As Long\nn = '+name+'()')));
  assert.ok(out.report.imports.some(i=>i.symbol==='GetTickCount'));
});
test('native Declare default types and enum storage bind once in the original project',()=>{
  const source='DefLng T\nEnum ResultCode\nOk = 0\nEnd Enum\nDeclare Function Tick Lib "kernel32" Alias "GetTickCount"\nDeclare Function Code Lib "kernel32" Alias "GetTickCount" As ResultCode\n'+main('Dim n As Long\nn = Tick() + Code()');
  const bound=compileProject(project(source));assert.deepEqual(bound.diagnostics,[]);
  const declarations=lowerNativeDeclarations(bound.modules.get('mainmodule'));
  assert.equal(declarations.get('tick').returnType,'Long');assert.equal(declarations.get('code').returnType,'Long');
  assert.equal(compileWin32(project(source)).bytes[1],0x5a);
});
test('inactive unsupported DLL declarations are not native errors or imports',()=>{
  const source='#If NativeProbe Then\nDeclare Function Tick Lib "kernel32" Alias "GetTickCount" As Long\n#Else\nDeclare Function Tick Lib "unsupported path.dll" (value As Object) As Object\n#End If\n'+main('Dim n As Long\nn = Tick()');
  const out=compileWin32(project(source,{conditionalConstants:{NativeProbe:true}}));
  assert.ok(out.report.imports.some(i=>i.symbol==='GetTickCount'));assert.ok(!out.report.imports.some(i=>String(i.dll).includes('unsupported')));
  assert.throws(()=>compileWin32(project(source,{conditionalConstants:{NativeProbe:false}})),NativeCompileError);
});
test('shared extraction handles colon declarations and preserves physical line count',()=>{
  const source='Option Explicit\nDeclare Function Tick Lib "kernel32" _\n Alias "GetTickCount" As Long: Dim count As Long\n'+main('count = Tick()');
  const out=extractNativeDeclarations(module(source));
  assert.equal(out.code.split('\n').length,source.split('\n').length);assert.equal(out.declarations.get('tick').line,2);
  assert.match(out.code,/Dim count As Long/);assert.doesNotMatch(out.code,/Declare|Alias/);
  assert.ok(compileWin32(project(source)).report.imports.some(i=>i.symbol==='GetTickCount'));
});
for(const alias of ['#0','#65536','#999999999999999999999999999999','bad entry','x/y'])test('native import name or ordinal cannot silently truncate: '+alias,()=>{
  assert.throws(()=>extractNativeDeclarations(module('\nDeclare Function F Lib "probe" Alias "'+alias+'" As Long')),e=>e instanceof NativeCompileError&&e.diagnostics[0].line===2);
});
for(const ordinal of [1,65535])test('native ordinal inclusive endpoint '+ordinal,()=>{
  const result=extractNativeDeclarations(module('Declare Function F Lib "probe" Alias "#'+ordinal+'" As Long'));
  assert.equal(result.declarations.get('f').symbol,ordinal);
});
for(const type of ['Object','Variant','String()'])test('valid language types do not imply a supported native return ABI '+type,()=>{
  assert.throws(()=>compileWin32(project('Declare Function F Lib "probe" As '+type+'\n'+main(''))),NativeCompileError);
});
test('native private and public declarations preserve module visibility',()=>{
  const p=project(main('Dim n As Long\nn = Api.Tick()'));p.modules.push(module('Private Declare Function Tick Lib "kernel32" Alias "GetTickCount" As Long','Api'));
  assert.throws(()=>compileWin32(p),/Private|accessible/);p.modules[1].code=p.modules[1].code.replace('Private','Public');
  assert.ok(compileWin32(p).report.imports.some(i=>i.symbol==='GetTickCount'));
});

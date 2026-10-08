import test from 'node:test';
import assert from 'node:assert/strict';
import {compileWin32} from '../src/native/compiler.js';
import {newProject} from '../src/project/model.js';
import {nativeVariantFixture} from '../tools/win32-variant-fixtures.mjs';
import {nativeVariantArrayMethods} from '../src/native/variant-arrays.js';
import {PE32Image} from '../src/native/pe32.js';
import {X86} from '../src/native/x86.js';
import {NativeX86Machine} from './support/native-x86-machine.mjs';
const project=(body,extra='',optionBase=0)=>({...newProject('VariantArrays'),startup:'Sub Main',modules:[{id:'m',name:'Entry',kind:'module',code:`Option Explicit\nOption Base ${optionBase}\nSub Main()\n${body}\nEnd Sub\n${extra}`}]});
for(const type of ['Byte','Integer','Long','Boolean','Single','Double','Currency','Date','String','Variant'])test('native scalar Variant supports typed '+type+' array value snapshots and element l-values',()=>{
 const p=project(`Dim a(1 To 3) As ${type}, out() As ${type}, v As Variant\nv=a\nout=v\nv(1)=a(2)`),before=JSON.stringify(p),r=compileWin32(p);
 assert.equal(JSON.stringify(p),before);for(const api of ['VariantCopyInd','SafeArrayPtrOfIndex','SafeArrayGetVartype','SafeArrayGetElemsize','SafeArrayLock'])assert.ok(JSON.stringify(r.report.imports).includes(api));
});
for(const optimization of [0,1,2])test('native Variant-array fixture deterministically preserves every source at O'+optimization,()=>{
 const {project:p,checks}=nativeVariantFixture(),before=JSON.stringify(p),r=compileWin32(p,{optimization});assert.equal(checks.length,214);assert.equal(JSON.stringify(p),before);assert.deepEqual(r.bytes,compileWin32(p,{optimization}).bytes);assert.equal(r.report.architecture,'x86');assert.equal(r.report.extraction,false);
});
for(const body of ['Dim v As Variant\nv=Array()','Dim v As Variant\nv=VBA.Array(1,2,,4)','Dim v As Variant\nv=Array(Array(1,2),Array(3,4))\nv(0)(1)=9','Dim v As Variant\nv=Array(Array(1,2))(0)(1)','Dim v As Variant\nReDim v(1 To 3) As String\nReDim Preserve v(1 To 5)\nErase v','Dim v As Variant\nReDim v(-2 To 3,7 To 10) As Double'])test('new Variant array source: '+body.split('\n').at(-1),()=>assert.ok(compileWin32(project(body)).bytes.length));
test('Array source-procedure shadowing precedes intrinsic construction',()=>{
 const p=project('Dim n As Long\nn=Array(7)','Function Array(ByVal value As Long) As Long\nArray=value\nEnd Function');const r=compileWin32(p);assert.ok(!JSON.stringify(r.report.imports).includes('SafeArrayPutElement'));
});
test('Array variable shadowing remains indexed Variant access',()=>{
 assert.ok(compileWin32(project('Dim Array As Variant\nArray=VBA.Array(1,2)\nArray(0)=3')).bytes.length);
});
test('VBA module qualification is not stolen by the intrinsic library',()=>{
 const p=project('Dim n As Long\nn=VBA.Array(7)');p.modules.push({id:'vba',name:'VBA',kind:'module',code:'Public Function Array(ByVal n As Long) As Long\nArray=n\nEnd Function'});const r=compileWin32(p);assert.ok(!JSON.stringify(r.report.imports).includes('SafeArrayPutElement'));
});
test('Array constructor applies the configured sixteen-byte element quota before emission',()=>{
 assert.ok(compileWin32(project('Dim v As Variant\nv=Array(1,2)'),{maxArrayBytes:32}).bytes.length);assert.throws(()=>compileWin32(project('Dim v As Variant\nv=Array(1,2,3)'),{maxArrayBytes:32}),/Array.*budget/);
});
for(const [body,message] of [['Dim a(2) As String * 7, v As Variant\nv=a',/fixed-length String/],['Dim a(2) As Long\na=Array(1,2)',/dynamic destination/],['Dim v As Variant\nv=Array(item:=1)',/positional/],['Dim v As Variant\nv=Array(ByVal 1)',/positional/],['Dim v As Variant\nReDim v(2) As String * 8',/variable-length/]])test('unsupported or invalid native array boundary remains explicit: '+body.split('\n').at(-1),()=>assert.throws(()=>compileWin32(project(body)),message));
for(const body of ['ReDim values(2)','Erase values'])test('direct ParamArray '+body+' is a language diagnostic',()=>assert.throws(()=>compileWin32(project('Pack 1',`Sub Pack(ParamArray values() As Variant)\n${body}\nEnd Sub`)),/ParamArray/));
test('whole-array ParamArray replacement remains an explicitly bounded native contract',()=>assert.throws(()=>compileWin32(project('Pack 1','Sub Pack(ParamArray values() As Variant)\nvalues=Array(2)\nEnd Sub')),/ParamArray/));

test('typed array extraction stages source Variant pointer without clobbering it with the element tag',()=>{
 const image=new PE32Image(),x=new X86(image.section('.text',0x60000020),image),value=0x20010000,dest=0x20020000;
 x.label('entry').enter();const c={x,variable:()=>null,type:()=> 'variant',useVariantArray:()=>{},boxVariant:()=>x.value(value),rawStorageAddress:()=>x.value(dest),fail:m=>{throw Error(m);}};
 assert.equal(nativeVariantArrayMethods.assignNativeVariantArray.call(c,{type:'Long',nativeDynamic:true},{}),true);x.leave().label('native:variant-array:take').ret(12).label('unused-import').api('kernel32.dll','GetLastError').ret();
 const cpu=new NativeX86Machine(image.finish('entry'));let args;cpu.hooks.set(cpu.symbol('native:variant-array:take'),{args:3,callback:a=>{args=a;return 0;}});cpu.invoke('entry');assert.deepEqual(args,[dest,value,3]);
});

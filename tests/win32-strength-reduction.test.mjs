import test from 'node:test';
import assert from 'node:assert/strict';
import {nativePowerOfTwoDivisor,emitNativePowerOfTwoDivision,emitNativeIntegerIdentity} from '../src/native/strength-reduction.js';
import {BinarySection} from '../src/native/pe32.js';
import {X86} from '../src/native/x86.js';
import {compileWin32} from '../src/native/compiler.js';
import {newProject} from '../src/project/model.js';
const section=()=>{const s=new BinarySection('.text',0x60000020);return {s,x:new X86(s,null)};};
const project=code=>({...newProject('Strength'),startup:'Sub Main',modules:[{id:'m',name:'M',kind:'module',code}]});
for(const value of [0,3,-3,2147483648,-2147483649,NaN,Infinity,1.5,'2',null])test('power-of-two lowering rejects '+value+' atomically',()=>{
  assert.equal(nativePowerOfTwoDivisor(value),null);const {s,x}=section();assert.equal(emitNativePowerOfTwoDivision(x,'\\',value),false);assert.equal(s.length,0);
});
for(let shift=0;shift<=31;shift++)for(const sign of [-1,1]){
  const value=sign*2**shift;if(value>2147483647)continue;
  test('power-of-two plan '+value,()=>assert.deepEqual(nativePowerOfTwoDivisor(value),{shift,negative:sign<0,mask:2**shift-1}));
}
test('only division by minus one emits an overflow edge; remainder does not',()=>{
  for(const op of ['\\','mod'])for(const divisor of [-2147483648,-2,-1,1,2,1073741824]){
    const {s,x}=section();assert.equal(emitNativePowerOfTwoDivision(x,op,divisor),true);
    assert.equal(s.fixups.length,op==='\\'&&divisor===-1?1:0);
    if(s.fixups.length)assert.equal(s.fixups[0].label,'error:6');
  }
});
test('unsupported operation and nonidentity emit no bytes',()=>{
  const {s,x}=section();assert.equal(emitNativePowerOfTwoDivision(x,'/',2),false);assert.equal(emitNativeIntegerIdentity(x,'+',1),false);assert.equal(s.length,0);
});
test('O2 lowers signed powers and identities while preserving source checkpoints and calls',()=>{
  const p=project(`Private n As Long
Private Function Touch() As Long
 n=n+1
 Touch=-7
End Function
Sub Main()
 Dim x As Long
 x=Touch() \\ 4&
 x=Touch() Mod -8&
 x=Touch()*0&
 x=Touch()+0&
 x=Touch() Eqv 7&
 x=Touch() Imp 7&
End Sub`);
  const a=compileWin32(p,{optimization:0}),b=compileWin32(p,{optimization:2,pruneUnusedProcedures:true});
  assert.ok(b.report.optimization.strengthReductions>=4);
  assert.ok(!b.report.optimization.removedProcedures.includes('proc:M:Touch'));
  assert.deepEqual(a.report.sourceMap.map(({rva,...s})=>s),b.report.sourceMap.map(({rva,...s})=>s));
  const size=r=>r.report.sections.find(s=>s.name==='.text').size;assert.ok(size(b)<size(a));
});
test('mixed real and zero/nonpower divisors stay in established numeric lowering',()=>{
  for(const expression of ['x / 2&','x \\ 3&','x Mod 3&','x \\ 0&','x Mod 0&','x \\ 2!']){
    const p=project(`Sub Main()\nDim x As Long,y As Long\ny=${expression}\nEnd Sub`),r=compileWin32(p,{optimization:2});
    assert.equal(r.report.optimization.strengthReductions||0,0,expression);
  }
});

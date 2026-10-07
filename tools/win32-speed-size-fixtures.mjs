/** Full optimizer execution matrix. Retains every baseline fixture and adds
 * typed/strength/pruning integration plus real IA-32 flag/string assertions.
 */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {newProject} from '../src/project/model.js';
import {compileWin32} from '../src/native/compiler.js';
import {PE32Image} from '../src/native/pe32.js';
import {X86} from '../src/native/x86.js';
import {mem8,mem16,mem32} from '../src/native/x86-operands.js';
import {emitNativeCountedEqual} from '../src/native/string-kernels.js';
import {writeOptimizerFixtures} from './win32-optimizer-fixtures.mjs';
export function speedSizeFixture(){
 const checks=[],body=['Dim n As Long,s As String'],procedures=[];
 const check=(expr,label)=>{checks.push(label);body.push(`If Not (${expr}) Then ExitProcess ${checks.length}`);};
 const long=n=>`${Object.is(n,-0)?0:n}&`;
 const divisors=[-2147483648,-65536,-8,-1,1,2,16,1073741824];
 for(const [i,d]of divisors.entries()){
  for(const [name,op]of [['Divide','\\'],['Remainder','Mod']]){
   procedures.push(`Private Function ${name}${i}(ByVal a As Long) As Long\n${name}${i}=a ${op} ${long(d)}\nEnd Function`);
   for(const a of [-2147483648,-2147483647,-65537,-17,-1,0,17,2147483647]){
    if(name==='Divide'&&a===-2147483648&&d===-1)continue;
    const value=name==='Divide'?Math.trunc(a/d):a%d;
    check(`${name}${i}(${long(a)})=${long(value)}`,`${name} ${a} by ${d}`);
   }
  }
 }
 check('SameJoin(True)=124 And SameJoin(False)=124','equal forward-join facts retain Integer type');
 check('DifferentJoin(True)=123 And DifferentJoin(False)=456','different forward facts never leak between branches');
 check('ByteNot()=0 And BooleanNot()=0','Byte masking and Boolean store normalization');
 check('LoopTotal()=6','loop backedges invalidate changing locals');
 body.push('sequence=0\nn=Touch() * 0&');check('sequence=1 And n=0','annihilator retains an eager call');
 body.push('sequence=0\nn=Touch() + 0&');check('sequence=1 And n=-17','neutral operation retains an eager call');
 check('GetCurrentProcessId()>0','live scalar Win32 Declare still executes');
 body.push('s=String$(1000,"A") & ChrW(0) & "B"');
 check('InStrRev(s,ChrW(0) & "B")=1001 And InStrRev(s,ChrW(0) & "B",1001)=0','bounded REP search includes NUL and respects end boundary');
 check('InStrRev("abABab","ab",4,1)=3','text mode keeps Windows collation');
 body.push('On Error Resume Next\nErr.Clear\nn=OverflowTyped()');check('Err.Number=6','typed propagation retains intermediate Integer overflow');
 body.push('Err.Clear\nn=Divide3(-2147483648&)');check('Err.Number=6','optimized LONG_MIN divided by -1 raises VB error 6');
 body.push('Err.Clear\nOn Error GoTo 0\nExitProcess 0');
 const project=newProject('AotSpeedSize');project.startup='Sub Main';project.modules=[{id:'m',name:'Entry',kind:'module',code:`Option Explicit
Private sequence As Long
Private Declare Sub ExitProcess Lib "kernel32" (ByVal code As Long)
Private Declare Function GetCurrentProcessId Lib "kernel32" () As Long
Private Declare Function UnusedVersionQuery Lib "version" Alias "GetFileVersionInfoSizeW" (ByVal file As Long, ByRef handle As Long) As Long
Private Sub NeverCalled()
 Dim ignored As Long
 ignored=UnusedVersionQuery(0,ignored)
End Sub
${procedures.join('\n')}
Private Function SameJoin(ByVal choose As Boolean) As Long
 Dim i As Integer,j As Integer
 If choose Then
  i=123
 Else
  i=123
 End If
 j=i+1
 SameJoin=j
End Function
Private Function DifferentJoin(ByVal choose As Boolean) As Long
 Dim i As Integer
 If choose Then
  i=123
 Else
  i=456
 End If
 DifferentJoin=i
End Function
Private Function ByteNot() As Long
 Dim b As Byte
 b=255
 ByteNot=Not b
End Function
Private Function BooleanNot() As Long
 Dim t As Boolean
 t=7
 BooleanNot=Not t
End Function
Private Function LoopTotal() As Long
 Dim i As Integer,total As Long
 i=0
 Do While i<4
  total=total+i
  i=i+1
 Loop
 LoopTotal=total
End Function
Private Function OverflowTyped() As Long
 Dim i As Integer
 i=32767
 OverflowTyped=i+1
End Function
Private Function Touch() As Long
 sequence=sequence+1
 Touch=-17
End Function
Public Sub Main()
 ${body.join('\n ')}
End Sub`}];return {project,checks};
}
export function compactAssemblerFixture(optimization=1){
 const image=new PE32Image(),s=image.section('.text',0x60000020),data=image.section('.data',0xc0000040),x=new X86(s,image),checks=[];
 const check=(name,condition='e')=>{checks.push(name);const ok=x.unique('assert');x.branch(condition,ok).api('kernel32.dll','ExitProcess',[checks.length]).label(ok);};
 const equal=(n,name)=>{x.compare(n);check(name);};
 x.label('entry').enter(16).mov('ebx',0).stc().inc('ebx');check('compact INC preserves CF','b');x.mov('eax','ebx');equal(1,'compact INC value');
 x.stc().dec('ebx');check('compact DEC preserves CF','b');x.mov('eax','ebx');equal(0,'compact DEC value');
 x.mov('eax',0x12347fff).stc().inc('ax');check('word INC raises OF','o');check('word INC retains CF','b');equal(0x12348000,'word INC preserves high word');
 x.mov('eax',0x12340001).add('ax',65535);check('signed imm8 word ADD retains carry','b');equal(0x12340000,'signed imm8 word ADD bits');
 x.clc().pushFlags().stc().popFlags();check('PUSHFD/POPFD round trip CF','nc');x.cmc();check('CMC flips CF','b');x.clc();
 for(const width of [8,16,32])for(const length of [0,1,2,3,4,7,8]){
  const a=`left-${width}-${length}`,b=`right-${width}-${length}`,bytes=Array.from({length:length*width/8},(_,i)=>i%3===0?0:(i*19)&255);
  data.label(a).emit(...bytes).label(b).emit(...bytes);
  if(length)x.value(a).mov('esi','eax').value(b).mov('edi','eax');else x.mov('esi',0).mov('edi',0);
  x.mov('ecx',length);emitNativeCountedEqual(x,width);equal(1,`counted equal width ${width} length ${length}`);
  if(length){x.mov(mem8({label:b,displacement:bytes.length-1}),bytes.at(-1)^0x81).value(a).mov('esi','eax').value(b).mov('edi','eax').mov('ecx',length);emitNativeCountedEqual(x,width);equal(0,`counted mismatch width ${width} length ${length}`);}
 }
 data.align(4).label('words').u16(65).u16(0).u16(66).u16(65535).label('destination').zero(8).label('guard').u32(0xdeadbeef);
 x.value('words').mov('esi','eax').value('destination').mov('edi','eax').mov('ecx',4).cld().repMove(16);
 x.movzx('eax',mem16({label:'destination',displacement:6}));equal(65535,'REP MOVSW copies the final code unit');x.mov('eax',mem32({label:'guard'}));equal(0xdeadbeef,'REP MOVSW retains destination guard');
 x.value('words').mov('edi','eax').mov('ecx',4).mov('eax',0).repScan(16);check('REPNE SCASW finds embedded NUL');x.mov('eax','ecx');equal(2,'SCAS consumes exactly two words');
 x.value('words').add('eax',6).mov('esi','eax').std().stringInstruction('lods',16).cld().movzx('eax','ax');equal(65535,'backward LODSW reads final code unit');
 x.value('destination').add('eax',6).mov('edi','eax').mov('eax',1234).mov('ecx',2).std().repStore(16).cld();
 x.movzx('eax',mem16({label:'destination',displacement:4}));equal(1234,'backward REP STOSW stores bounded words');
 x.pushFlags().popOperand('eax').and('eax',0x400);equal(0,'direction flag restored before calling Windows');x.mov('eax',mem32({label:'guard'}));equal(0xdeadbeef,'backward store retains guard');
 x.api('kernel32.dll','ExitProcess',[0]);const linked=image.finish('entry',{optimization});
 return {bytes:linked.bytes,checks,report:{size:linked.bytes.length,optimization:linked.optimization,sections:linked.sections,imports:linked.imports,architecture:'x86',target:'assembler-test'}};
}
export function writeSpeedSizeFixtures(directory='reports/native-optimizer'){
 const reports=writeOptimizerFixtures(directory),fixture=speedSizeFixture();
 const save=(name,result,checks)=>{const report={name,checks,sha256:createHash('sha256').update(result.bytes).digest('hex'),...result.report};fs.writeFileSync(path.join(directory,name+'.exe'),result.bytes);fs.writeFileSync(path.join(directory,name+'.build.json'),JSON.stringify(report,null,2)+'\n');reports.push(report);};
 for(const optimization of [0,1,2]){
  const result=compileWin32(fixture.project,{optimization});
  if(optimization===2&&result.report.optimization.constantsPropagated<5)throw new Error('Typed/forward constant propagation was not exercised');
  save('AotSpeedSize-O'+optimization,result,fixture.checks);
  const assembled=compactAssemblerFixture(optimization);save('AotCompactAssembler-O'+optimization,assembled,assembled.checks);
 }
 const pruned=compileWin32(fixture.project,{optimization:2,pruneUnusedProcedures:true});
 if(!pruned.report.optimization.removedProcedures.includes('proc:Entry:NeverCalled')||!pruned.report.optimization.removedImports.includes('version.dll!GetFileVersionInfoSizeW'))throw new Error('Pruning did not remove the unused procedure/import together');
 save('AotSpeedSize-O2-pruned',pruned,fixture.checks);
 fs.writeFileSync(path.join(directory,'builds.json'),JSON.stringify(reports,null,2)+'\n');return reports;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)console.log(JSON.stringify(writeSpeedSizeFixtures(process.argv[2]).map(r=>({name:r.name,bytes:r.size,checks:r.checks.length,optimization:r.optimization})),null,2));

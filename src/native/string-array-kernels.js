/** Private IA-32 kernels over owned SAFEARRAY/BSTR snapshots. Source pointers
 * cannot be changed by later argument expressions or by destination assignment.
 * New descriptors use SafeArrayCreate, not fixed-size SafeArrayCreateVector. */
import {mem16,mem32} from './x86-operands.js';
import {MAX_NATIVE_STRING} from './storage.js';
const P='native:string-array:',D='oleaut32.dll',arg=argument=>({argument});
const m=offset=>mem32({base:'ebp',displacement:offset}),at=(base,displacement=0)=>mem32({base,displacement});
export function emitNativeStringArrayHelpers(c){
 const used=c.nativeStringArraysUsed;if(!used?.size)return;const x=c.x;
 const max=Math.floor(c.maxArrayBytes/4),split=used.has('split'),filter=used.has('filter');
 const destroy=x.unique();x.label(P+'release').enter().value(arg(8)).test().branch('e',destroy).push().invoke(D,'SafeArrayDestroy').call('native:array:check').label(destroy).value(0).leave(4);
 if(used.has('publish')){
  const ready=x.unique();x.label(P+'publish').enter().value(arg(8)).mov('ebx','eax').mov('eax',at('ebx')).test().branch('e',ready);
  x.testOperand(mem16({base:'eax',displacement:2}),0x10).branch('ne','error:10').cmp(at('eax',8),0).branch('ne','error:10');
  x.push().invoke(D,'SafeArrayDestroy').call('native:array:check').label(ready).value(arg(12)).mov('ecx',at('eax')).mov(at('ebx'),'ecx').mov(at('eax'),0).value(0).leave(8);
 }
 if(used.has('snapshot')){
  x.label(P+'snapshot').enter(4).value(arg(8)).test().branch('e','error:9').cmp(mem16({base:'eax'}),1).branch('ne','error:13').cmp(at('eax',4),4).branch('ne','error:13');
  x.testOperand(mem16({base:'eax',displacement:2}),0x100).branch('e','error:13').cmp(at('eax',16),max).branch('a','error:7');
  x.mov(m(-4),0).api(D,'SafeArrayCopy',[arg(8),{address:-4}]).call('native:array:check').value(arg(-4)).leave(4);
 }
 for(const upper of [false,true])if(used.has(upper?'ubound':'lbound')){
  x.label(P+(upper?'ubound':'lbound')).enter(4).value(arg(12)).compare(1).branch('ne','error:9');
  x.api(D,upper?'SafeArrayGetUBound':'SafeArrayGetLBound',[arg(8),1,{address:-4}]).call('native:array:check').value(arg(-4)).leave(8);
 }
 if(used.has('element')){
  x.label(P+'element').enter(4).mov(m(-4),0).api(D,'SafeArrayGetElement',[arg(8),{address:12},{address:-4}]).call('native:array:check').value(arg(-4)).leave(8);
 }
 if(split||filter){
  x.label(P+'create').enter(8).value(arg(8)).compare(max).branch('a','error:7').mov(m(-8),'eax').mov(m(-4),0);
  x.api(D,'SafeArrayCreate',[8,1,{address:-8}]).test().branch('e','error:7').leave(4);
  // equal(left, right, codeUnits, compare): 0/1, or -5 on NLS failure.
  // No error jump: an allocating caller must release partial results first.
  const text=x.unique(),loop=x.unique(),yes=x.unique(),no=x.unique(),done=x.unique(),failed=x.unique();
  x.label(P+'equal').enter().value(arg(16)).test().branch('e',yes).value(arg(20)).test().branch('ne',text);
  x.value(arg(8)).mov('esi','eax').value(arg(12)).mov('edi','eax').mov('ecx',m(16));
  x.label(loop).movzx('eax',mem16({base:'esi'})).movzx('edx',mem16({base:'edi'})).cmp('eax','edx').branch('ne',no).add('esi',2).add('edi',2).dec('ecx').branch('ne',loop).jump(yes);
  x.label(text).api('kernel32.dll','CompareStringW',[0x400,1,arg(8),arg(16),arg(12),arg(16)]).test().branch('e',failed).compare(2).branch('e',yes);
  x.label(no).value(0).jump(done).label(yes).value(1).jump(done).label(failed).value(-5).label(done).leave(16);
 }
 if(split)emitSplit(x,max);
 if(filter)emitFilter(x,max);
 if(used.has('join'))emitJoin(x);
}
function emitSplit(x,max){
 const L={length:-4,needle:-8,count:-12,result:-16,start:-20,index:-24,written:-28,error:-32};
 const failed=x.unique(),empty=x.unique(),done=x.unique();
 x.label(P+'split').enter(32).mov(m(L.result),0).mov(m(L.error),5);
 x.value(arg(16)).compare(-1).branch('l','error:5').value(arg(20)).compare(1).branch('a','error:5');
 x.api(D,'SysStringLen',[arg(8)]).compare(MAX_NATIVE_STRING).branch('a','error:7').mov(m(L.length),'eax');
 x.api(D,'SysStringLen',[arg(12)]).compare(MAX_NATIVE_STRING).branch('a','error:7').mov(m(L.needle),'eax');
 x.cmp(m(L.length),0).branch('e',empty).cmp(m(16),0).branch('e',empty).mov(m(L.count),1);
 function pass(write){
  const loop=x.unique(),tail=x.unique(),next=x.unique(),finish=x.unique();
  x.mov(m(L.start),0).mov(m(L.index),0).mov(m(L.written),0);
  function append(tail){
   x.mov('eax',m(L.written)).cmp('eax',m(L.count)).branch('ae',failed);
   x.mov('eax',tail?m(L.length):m(L.index)).sub('eax',m(L.start)).push();
   x.value(arg(8)).mov('ecx',m(L.start)).lea('eax',mem32({base:'eax',index:'ecx',scale:2})).push().invoke(D,'SysAllocStringLen');
   const allocated=x.unique();x.test().branch('ne',allocated).mov(m(L.error),7).jump(failed).label(allocated);
   x.mov('ebx',m(L.result)).mov('ebx',at('ebx',12)).mov('ecx',m(L.written)).mov(mem32({base:'ebx',index:'ecx',scale:4}),'eax').inc(m(L.written));
  }
  x.cmp(m(L.needle),0).branch('e',tail).label(loop);
  x.mov('eax',write?m(L.written):m(L.count));if(write)x.inc('eax');
  x.cmp('eax',m(16)).branch('ae',tail);
  x.mov('eax',m(L.length)).sub('eax',m(L.index)).cmp('eax',m(L.needle)).branch('b',tail);
  x.value(arg(8)).mov('ecx',m(L.index)).lea('ebx',mem32({base:'eax',index:'ecx',scale:2}));
  x.push(arg(20)).push(arg(L.needle)).push(arg(12)).pushOperand('ebx').call(P+'equal').test().branch('s',failed).branch('e',next);
  if(write)append(false);else x.inc(m(L.count)).cmp(m(L.count),max).branch('a','error:7');
  x.mov('eax',m(L.index)).add('eax',m(L.needle)).mov(m(L.index),'eax').mov(m(L.start),'eax').jump(loop);
  x.label(next).inc(m(L.index)).jump(loop).label(tail);if(write)append(true);x.label(finish);
 }
 pass(false);x.push(arg(L.count)).call(P+'create').mov(m(L.result),'eax');pass(true);
 x.value(arg(L.written)).cmp('eax',m(L.count)).branch('ne',failed);
 x.value(arg(L.result)).jump(done).label(empty).push(0).call(P+'create').jump(done);
 x.label(failed).push(arg(L.result)).call(P+'release').value(arg(L.error)).jump('native:error:raise').label(done).leave(16);
}
function emitFilter(x,max){
 // contains returns 0/1 or a negative VB error, never unwinds its allocating caller.
 const empty=x.unique(),loop=x.unique(),no=x.unique(),bad=x.unique(),done=x.unique();
 x.label(P+'contains').enter(8).api(D,'SysStringLen',[arg(8)]).compare(MAX_NATIVE_STRING).branch('a',bad).mov(m(-4),'eax');
 x.api(D,'SysStringLen',[arg(12)]).compare(MAX_NATIVE_STRING).branch('a',bad).mov(m(-8),'eax').test().branch('e',empty).mov('ebx',0);
 x.label(loop).mov('eax',m(-4)).sub('eax','ebx').cmp('eax',m(-8)).branch('b',no);
 x.value(arg(8)).lea('esi',mem32({base:'eax',index:'ebx',scale:2})).push(arg(16)).push(arg(-8)).push(arg(12)).pushOperand('esi').call(P+'equal').test().branch('ne',done);
 x.inc('ebx').jump(loop).label(no).value(0).jump(done).label(empty).value(1).jump(done).label(bad).value(-7).label(done).leave(12);
 const failed=x.unique(),finish=x.unique();
 x.label(P+'filter').enter(24).mov(m(-4),0).mov(m(-8),0).mov(m(-24),5);
 x.value(arg(20)).compare(1).branch('a','error:5').value(arg(8)).test().branch('e','error:9');
 x.cmp(mem16({base:'eax'}),1).branch('ne','error:13').cmp(at('eax',4),4).branch('ne','error:13').cmp(at('eax',16),max).branch('a','error:7').mov('esi','eax');
 // -4 selected count, -8 result, -12 scan index, -16 written, -20 source string.
 function pass(write){
  const loop=x.unique(),next=x.unique(),done=x.unique(),valid=x.unique(),wanted=x.unique(),oom=x.unique();
  x.mov(m(-12),0).mov(m(-16),0).label(loop).mov('ebx',m(-12)).cmp('ebx',at('esi',16)).branch('ae',done);
  x.mov('eax',at('esi',12)).mov('eax',mem32({base:'eax',index:'ebx',scale:4})).mov(m(-20),'eax');
  x.push(arg(20)).push(arg(12)).push(arg(-20)).call(P+'contains').test().branch('ns',valid).neg('eax').mov(m(-24),'eax').jump(failed);
  x.label(valid).cmp(m(16),0).branch('ne',wanted).xor('eax',1).label(wanted).test().branch('e',next);
  if(write){
   x.mov('eax',m(-16)).cmp('eax',m(-4)).branch('ae',failed);
   x.api(D,'SysStringLen',[arg(-20)]).push().push(arg(-20)).invoke(D,'SysAllocStringLen').test().branch('e',oom);
   x.mov('edi',m(-8)).mov('edi',at('edi',12)).mov('ecx',m(-16)).mov(mem32({base:'edi',index:'ecx',scale:4}),'eax').inc(m(-16)).jump(next);
   x.label(oom).mov(m(-24),7).jump(failed);
  }else x.inc(m(-4));
  x.label(next).inc(m(-12)).jump(loop).label(done);
 }
 pass(false);x.push(arg(-4)).call(P+'create').mov(m(-8),'eax');pass(true);
 x.value(arg(-16)).cmp('eax',m(-4)).branch('ne',failed);
 x.value(arg(-8)).jump(finish).label(failed).push(arg(-8)).call(P+'release').value(arg(-24)).jump('native:error:raise').label(finish).leave(16);
}
function emitJoin(x){
 const empty=x.unique(),sizing=x.unique(),allocate=x.unique(),copy=x.unique(),item=x.unique(),done=x.unique();
 x.label(P+'join').enter(24).value(arg(8)).test().branch('e','error:9').cmp(mem16({base:'eax'}),1).branch('ne','error:13').mov('ebx','eax');
 x.mov('ecx',at('ebx',16)).mov(m(-4),'ecx').mov('ecx',at('ebx',12)).mov(m(-24),'ecx');
 x.api(D,'SysStringLen',[arg(12)]).compare(MAX_NATIVE_STRING).branch('a','error:7').mov(m(-8),'eax').mov(m(-12),0).mov(m(-20),0);
 x.cmp(m(-4),0).branch('e',allocate).mov('ecx',m(-4)).dec('ecx').imul('eax','ecx').branch('o','error:7').compare(MAX_NATIVE_STRING).branch('a','error:7').mov(m(-12),'eax');
 x.label(sizing).mov('ecx',m(-20)).cmp('ecx',m(-4)).branch('ae',allocate).mov('eax',m(-24)).pushOperand(mem32({base:'eax',index:'ecx',scale:4})).invoke(D,'SysStringLen');
 x.add('eax',m(-12)).branch('o','error:7').compare(MAX_NATIVE_STRING).branch('a','error:7').mov(m(-12),'eax').inc(m(-20)).jump(sizing);
 x.label(allocate).push(arg(-12)).push(0).invoke(D,'SysAllocStringLen').test().branch('e','error:7').mov(m(-16),'eax').mov('edi','eax').mov(m(-20),0);
 x.label(copy).mov('ecx',m(-20)).cmp('ecx',m(-4)).branch('ae',done).testOperand('ecx','ecx').branch('e',item);
 x.value(arg(12)).mov('esi','eax').mov('ecx',m(-8)).cld().repMove(16);
 x.label(item).mov('ecx',m(-20)).mov('eax',m(-24)).mov('esi',mem32({base:'eax',index:'ecx',scale:4})).pushOperand('esi').invoke(D,'SysStringLen').mov('ecx','eax').cld().repMove(16);
 x.inc(m(-20)).jump(copy).label(done).value(arg(-16)).leave(8);
}

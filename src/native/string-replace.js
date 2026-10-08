/** Counted UTF-16 replacement for the freestanding x86 target.
 * https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/replace-function
 * Two bounded passes allocate one result BSTR. No scratch buffer, source mutation,
 * runtime extraction, NUL scanning, or growing/reallocating concatenation chain.
 */
import {mem32} from './x86-operands.js';
import {emitNativeCountedEqual} from './string-kernels.js';
import {MAX_NATIVE_STRING} from './storage.js';
const arg=argument=>({argument});
const local=offset=>mem32({base:'ebp',displacement:offset});
const L=Object.freeze({source:-4,find:-8,replacement:-12,start:-16,length:-20,remaining:-24,result:-28,written:-32});

export function emitNativeReplace(c) {
  const x=c.x,empty=x.unique('replace-empty');
  const fail=x.unique('replace-failed'),done=x.unique('replace-done');
  x.label('native:string-library:replace').enter(32).mov(local(L.result),0);
  x.value(arg(20)).compare(1).branch('l','error:5').dec('eax').mov(local(L.start),'eax');
  x.value(arg(24)).compare(-1).branch('l','error:5');
  x.value(arg(28)).compare(0).branch('l','error:5').compare(1).branch('g','error:5');
  for(const [argument,offset]of [[8,L.source],[12,L.find],[16,L.replacement]])
    x.api('oleaut32.dll','SysStringLen',[arg(argument)]).compare(MAX_NATIVE_STRING).branch('a','error:7').mov(local(offset),'eax');
  x.mov('eax',local(L.source)).cmp('eax',local(L.start)).branch('be',empty);
  x.sub('eax',local(L.start)).mov(local(L.length),'eax');

  // append consumes ESI/ECX. Validate the destination before every copy, including
  // second-pass NLS failures/differences; an owned result is freed on failure.
  const append=()=>{
    x.mov('eax',local(L.written)).mov('edi',local(L.result)).lea('edi',mem32({base:'edi',index:'eax',scale:2}));
    x.add('eax','ecx').branch('o',fail).cmp('eax',local(L.length)).branch('a',fail).mov(local(L.written),'eax').cld().repMove(16);
  };
  const pass=writing=>{
    const loop=x.unique('replace-scan'),found=x.unique('replace-found'),next=x.unique('replace-next');
    const tail=x.unique('replace-tail'),text=x.unique('replace-nls'),advance=x.unique('replace-advance'),finish=x.unique('replace-pass-done');
    x.mov('ebx',local(L.start)).value(arg(24)).mov(local(L.remaining),'eax');
    x.label(loop).cmp('ebx',local(L.source)).branch('ae',finish);
    x.cmp(local(L.remaining),0).branch('e',tail).cmp(local(L.find),0).branch('e',tail);
    x.mov('eax',local(L.source)).sub('eax','ebx').cmp('eax',local(L.find)).branch('b',tail);
    x.value(arg(28)).test().branch('ne',text);
    x.value(arg(8)).lea('esi',mem32({base:'eax',index:'ebx',scale:2}));
    x.value(arg(12)).mov('edi','eax').mov('ecx',local(L.find));
    emitNativeCountedEqual(x);x.test().branch('ne',found).jump(next);
    x.label(text).value(arg(8)).lea('edx',mem32({base:'eax',index:'ebx',scale:2}));
    x.pushOperand(local(L.find)).pushOperand(local(12)).pushOperand(local(L.find)).pushOperand('edx').pushOperand(1).pushOperand(0x400);
    x.invoke('kernel32.dll','CompareStringW').test().branch('e',fail).compare(2).branch('e',found);
    x.label(next);
    if(writing){x.value(arg(8)).lea('esi',mem32({base:'eax',index:'ebx',scale:2})).mov('ecx',1);append();}
    x.inc('ebx').jump(loop);
    x.label(found);
    if(writing){x.value(arg(16)).mov('esi','eax').mov('ecx',local(L.replacement));append();}
    else x.mov('eax',local(L.length)).sub('eax',local(L.find)).add('eax',local(L.replacement)).branch('o','error:7').compare(MAX_NATIVE_STRING).branch('a','error:7').mov(local(L.length),'eax');
    x.add('ebx',local(L.find)).cmp(local(L.remaining),-1).branch('e',advance).dec(local(L.remaining));
    x.label(advance).jump(loop).label(tail);
    if(writing){x.value(arg(8)).lea('esi',mem32({base:'eax',index:'ebx',scale:2})).mov('ecx',local(L.source)).sub('ecx','ebx');append();}
    x.label(finish);
  };
  pass(false);
  x.push(arg(L.length)).push(0).invoke('oleaut32.dll','SysAllocStringLen').test().branch('e','error:7').mov(local(L.result),'eax').mov(local(L.written),0);
  pass(true);
  x.mov('eax',local(L.written)).cmp('eax',local(L.length)).branch('ne',fail).mov('eax',local(L.result)).jump(done);
  x.label(empty).api('oleaut32.dll','SysAllocStringLen',[0,0]).test().branch('e','error:7').jump(done);
  x.label(fail).push(arg(L.result)).invoke('oleaut32.dll','SysFreeString').jump('error:5');
  x.label(done).leave(24);
}

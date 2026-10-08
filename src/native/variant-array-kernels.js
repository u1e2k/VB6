/** Checked PE32 Variant/SAFEARRAY address and mutation helpers.
 * All data access is through a live locked descriptor with exact element width.
 * Failed coercion/allocation never replaces the previous destination owner.
 */
import {mem16,mem32} from './x86-operands.js';
import {NATIVE_VARIANT_ARRAY_WIDTHS} from './variant-types.js';
const P='native:variant-array:',V='native:variant:',A='native:array:',DLL='oleaut32.dll';
const arg=argument=>({argument}),addr=address=>({address});
const at=(base,displacement=0)=>mem32({base,displacement}),local=displacement=>at('ebp',displacement);
export function emitNativeVariantArrayHelpers(c){
 const x=c.x,features=c.nativeVariantArrayFeatures||new Set();
 // deref(Variant*) -> original non-VT_BYREF|VT_VARIANT descriptor, not a copy.
 const follow=x.unique(),followed=x.unique();x.label(P+'deref').enter().value(arg(8)).mov('ecx',64).label(follow).test().branch('e','error:91');
 x.cmp(mem16({base:'eax'}),0x400c).branch('ne',followed).dec('ecx').branch('e','error:13').mov('eax',at('eax',8)).jump(follow).label(followed).leave(4);
 // slot(Variant*) -> SAFEARRAY** in EAX, element VARTYPE in EDX. A null array
 // pointer is valid unallocated storage; users needing elements/bounds reject it.
 const supported=x.unique(),direct=x.unique(),slotDone=x.unique();x.label(P+'slot').enter().push(arg(8)).call(P+'deref').movzx('edx',mem16({base:'eax'}));
 x.testOperand('edx',0x2000).branch('e','error:13').mov('ecx','edx').and('edx',0x9fff);
 for(const t of Object.keys(NATIVE_VARIANT_ARRAY_WIDTHS))x.cmp('edx',Number(t)).branch('e',supported);
 x.jump('error:13').label(supported).testOperand('ecx',0x4000).branch('e',direct).mov('eax',at('eax',8)).test().branch('e','error:91').jump(slotDone);
 x.label(direct).add('eax',8).label(slotDone).leave(4);
 if(features.has('element')){
  const typed=x.unique(),elementDone=x.unique(),widthDone=x.unique();
  // element(receiver, rank, indices, pinSlot, borrowedView) -> VARIANT*.
  x.label(P+'element').enter(8).push(arg(8)).call(P+'slot').mov('esi','edx').mov('ebx',at('eax')).testOperand('ebx','ebx').branch('e','error:9');
  x.pushOperand('ebx').invoke(DLL,'SafeArrayGetDim').cmp('eax',local(12)).branch('ne','error:9');
  x.mov(local(-4),0).push(addr(-4)).pushOperand('ebx').invoke(DLL,'SafeArrayGetVartype').call(V+'check').movzx('eax',mem16({base:'ebp',displacement:-4})).cmp('eax','esi').branch('ne','error:13');
  x.pushOperand('ebx').invoke(DLL,'SafeArrayGetElemsize');
  for(const [tag,width]of Object.entries(NATIVE_VARIANT_ARRAY_WIDTHS)){const next=x.unique();x.cmp('esi',Number(tag)).branch('ne',next).compare(width).branch('ne','error:13').jump(widthDone).label(next);}
  x.jump('error:13').label(widthDone).pushOperand('ebx').invoke(DLL,'SafeArrayLock').call(A+'check');
  x.value(arg(20)).mov(at('eax'),'ebx').push(addr(-8)).push(arg(16)).pushOperand('ebx').invoke(DLL,'SafeArrayPtrOfIndex').call(A+'check');
  x.value(arg(-8)).test().branch('e','error:13').cmp('esi',12).branch('ne',typed).jump(elementDone);
  x.label(typed).mov('edx','eax').value(arg(24)).or('esi',0x4000).mov(at('eax'),'esi').mov(at('eax',8),'edx');
  x.label(elementDone).leave(20);
 }
 if(features.has('bound'))for(const upper of [false,true]){
  x.label(P+(upper?'upper':'lower')).enter().push(arg(8)).call(P+'slot').pushOperand(local(12)).push().call(A+(upper?'upper':'lower')).leave(8);
 }
 if(features.has('erase'))x.label(P+'erase').enter().push(arg(8)).call(P+'slot').push().call(A+'destroy').leave(4);
 if(features.has('take')){
  const noOld=x.unique(),publish=x.unique();
  // take(destinationSlot, ownedSourceVariant, expectedElementType). All callers
  // provide a statement-owned snapshot, so transfer avoids a second array copy.
  x.label(P+'take').enter().push(arg(12)).call(P+'slot').cmp('edx',local(16)).branch('ne','error:13').mov('esi','eax').mov('edi',at('eax'));
  x.value(arg(8)).mov('ebx','eax').mov('eax',at('eax')).test().branch('e',noOld);
  x.testOperand(mem16({base:'eax',displacement:2}),0x10).branch('ne','error:10').cmp(at('eax',8),0).branch('ne','error:10').push().invoke(DLL,'SafeArrayDestroy').call(A+'check');
  x.label(noOld).testOperand('edi','edi').branch('e',publish).and(mem16({base:'edi',displacement:2}),0xffef).label(publish).mov(at('ebx'),'edi').mov(at('esi'),0);
  // The source retains its array tag with a null pointer, safe for VariantClear.
  x.value(0).leave(12);
 }
 if(features.has('redim')){
  const existing=x.unique(),specified=x.unique(),typeOK=x.unique(),done=x.unique();
  // redim(destinationVariant, requestedVT-or-zero, rank, bounds, preserve).
  // Empty is the initial allocation case. Other scalar values are not arrays.
  x.label(P+'redim').enter(16);for(const off of [-16,-12,-8,-4])x.mov(local(off),0);
  x.push(arg(8)).call(P+'deref').mov('ebx','eax').cmp(mem16({base:'ebx'}),0).branch('ne',existing);
  x.value(arg(12)).test().branch('ne',specified).value(12).label(specified).mov('esi','eax');
  x.push(0).push(0).push(arg(20)).push(arg(16)).pushOperand('esi').push(addr(-8)).call(A+'redim');
  x.or('esi',0x2000).mov(local(-16),'esi').push(addr(-16)).pushOperand('ebx').call(V+'publish').jump(done);
  x.label(existing).pushOperand('ebx').call(P+'slot').mov('edi','eax').mov('esi','edx');
  x.value(arg(12)).test().branch('e',typeOK).cmp('eax','esi').branch('e',typeOK);
  x.cmp(local(24),0).branch('ne','error:13');
  // A borrowed whole-array reference cannot change its declared element type.
  x.testOperand(mem16({base:'ebx'}),0x4000).branch('ne','error:13').mov('esi','eax');
  x.label(typeOK).push(0).push(arg(24)).push(arg(20)).push(arg(16)).pushOperand('esi').pushOperand('edi').call(A+'redim');
  x.testOperand(mem16({base:'ebx'}),0x4000).branch('ne',done).or('esi',0x2000).mov(mem16({base:'ebx'}),'si');
  x.label(done).value(0).leave(20);
 }
}

/** OleAut32 arithmetic does not classify zero divisors consistently across
 * Windows builds. Correct only arithmetic-error results, after the real API
 * has validated its operands. Preserve genuine overflow and conversion errors.
 * MS-VBAL 5.6.9.3.5 distinguishes numeric 0/0, Decimal and Empty operands.
 * https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/8628f21c-3f02-42b1-908c-201bd7ffe1b5
 */
import {mem16,mem32} from './x86-operands.js';
const DLL='oleaut32.dll',arg=argument=>({argument}),addr=address=>({address});
const m=displacement=>mem32({base:'ebp',displacement});
const tag=base=>mem16({base,displacement:0});
export const NATIVE_VARIANT_DIVIDE_API='native:variant:divide-api';
export function emitNativeVariantDivision(x){
 const inspect=x.unique(),cleanup=x.unique(),zero=x.unique(),overflow=x.unique(),decimal=x.unique();
 // ABI: HRESULT divideApi(left*, right*, output*). The output belongs to the
 // outer transaction, which also disposes any failed partial API result.
 x.label(NATIVE_VARIANT_DIVIDE_API).enter(20).api(DLL,'VarDiv',[arg(8),arg(12),arg(16)]);
 x.compare(0x8002000a).branch('e',inspect).compare(0x80020012).branch('e',inspect).leave(12);
 x.label(inspect).mov(m(-20),'eax');for(const offset of [-16,-12,-8,-4])x.mov(m(offset),0);
 // Normalize to R8 only for zero classification, not to compute the quotient.
 // Every native numeric subtype has an exact zero representation in Double.
 x.api(DLL,'VariantChangeTypeEx',[addr(-16),arg(12),0x400,2,5]).test().branch('s',cleanup);
 x.cmp(m(-8),0).branch('ne',cleanup).mov('eax',m(-4)).and('eax',0x7fffffff).test().branch('ne',cleanup);
 x.api(DLL,'VariantClear',[addr(-16)]).test().branch('s',cleanup);
 x.api(DLL,'VariantChangeTypeEx',[addr(-16),arg(8),0x400,2,5]).test().branch('s',cleanup);
 x.cmp(m(-8),0).branch('ne',zero).mov('eax',m(-4)).and('eax',0x7fffffff).test().branch('ne',zero);
 // 0/0 normally overflows. Decimal wins over integral/Single/Empty operands,
 // but / overrides Decimal when either operand is Double/String/Currency/Date.
 x.value(arg(8)).movzx('ebx',tag('eax')).value(arg(12)).movzx('esi',tag('eax'));
 x.cmp('ebx',14).branch('e',decimal).cmp('esi',14).branch('e',decimal);
 x.testOperand('esi','esi').branch('ne',overflow);
 for(const vt of [4,5,7,8])x.cmp('ebx',vt).branch('e',zero);
 x.jump(overflow).label(decimal);
 for(const vt of [5,6,7,8])x.cmp('ebx',vt).branch('e',overflow).cmp('esi',vt).branch('e',overflow);
 x.label(zero).mov(m(-20),0x80020012).jump(cleanup);
 x.label(overflow).mov(m(-20),0x8002000a);
 x.label(cleanup).api(DLL,'VariantClear',[addr(-16)]).mov('eax',m(-20)).leave(12);
}

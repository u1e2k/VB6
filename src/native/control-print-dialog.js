/** PRINTDLGEXW lowering. Printer settings are operation-local; cancellation
 * preserves the prior accepted HDC/range. No print job is started by ShowPrinter.
 * Printer-global defaults, hooks/templates and driver-managed copies are separate
 * contracts and are rejected rather than silently ignored.
 */
import {mem32} from './x86-operands.js';
import {NATIVE_DIALOG_FIELDS as F} from './dialog-contract.js';
const m=(base,displacement=0)=>mem32({base,displacement}),U='user32.dll',G='gdi32.dll',O='ole32.dll',K='kernel32.dll';
export const nativePrintDialogMethods={
 emitNativePrintDialog(){
  const x=this.x,base=-128,q=o=>m('ebp',base+o),invalid=x.unique(),cleanup=x.unique(),done=x.unique(),cancel=x.unique(),accepted=x.unique(),range=x.unique(),noDC=x.unique(),noOle=x.unique();
  x.label('native:dialog:showprinter').enter(128).local(-128).mov('edi','eax').mov('ecx',32).xor('eax','eax').cld().repStore(32).mov('esi',m('ebp',12));
  x.cmp(m('esi',76),0).branch('ne','error:5').mov('eax',m('esi',F.flags.offset)).testOperand('eax',0x7f040).branch('ne','error:380');
  // Reject invalid ranges before acquiring COM or native resources.
  x.mov('eax',m('esi',F.min.offset)).compare(1).branch('l','error:380').mov('ebx','eax').mov('eax',m('esi',F.max.offset)).compare(65535).branch('g','error:380').cmp('eax','ebx').branch('l','error:380');
  x.mov('eax',m('esi',F.copies.offset)).compare(1).branch('l','error:380').compare(32767).branch('g','error:380');
  x.mov(m('esi',76),1).mov(m('esi',F.lasterror.offset),0).mov(q(0),84).mov('eax',m('ebp',8)).mov(q(4),'eax');
  x.mov('eax',m('esi',F.flags.offset)).testOperand('eax',0x200);const hasIC=x.unique();x.branch('ne',hasIC).or('eax',0x100).label(hasIC).mov(q(20),'eax');
  for(const [field,prop]of [[44,'min'],[48,'max'],[52,'copies']])x.mov('eax',m('esi',F[prop].offset)).mov(q(field),'eax');
  x.mov(q(36),1).local(-28).mov(q(40),'eax').mov(q(76),-1);
  x.mov('eax',m('esi',F.frompage.offset)).mov(m('ebp',-28),'eax').mov('eax',m('esi',F.topage.offset)).mov(m('ebp',-24),'eax');
  x.testOperand(q(20),2).branch('e',range);
  x.mov('eax',m('ebp',-28)).cmp('eax',q(44)).branch('l',invalid).cmp('eax',q(48)).branch('g',invalid).mov('ebx','eax').mov('eax',m('ebp',-24)).cmp('eax','ebx').branch('l',invalid).cmp('eax',q(48)).branch('g',invalid).mov(q(32),1);
  x.label(range).api(O,'OleInitialize',[0]).mov(m('esi',F.lasterror.offset),'eax').test().branch('s',invalid).mov(m('ebp',-8),1);
  x.local(base).push().invoke('comdlg32.dll','PrintDlgExW').mov(m('esi',F.lasterror.offset),'eax').test().branch('s',invalid);
  x.cmp(q(80),1).branch('e',accepted).cmp(q(80),2).branch('e',accepted);
  // PD_RETURNDEFAULT performs no UI and returns useful handles with CANCEL.
  x.testOperand(q(20),0x400).branch('ne',accepted).jump(cancel);
  x.label(accepted).cmp(q(32),1).branch('a',invalid);
  x.mov('eax',q(16)).test().branch('e',invalid);
  // Commit all scalar settings and the accepted HDC together. Old owned HDC is
  // deleted only after a successful new selection; callers must not DeleteDC it.
  x.mov('ebx',m('esi',F.hdc.offset)).mov(m('esi',F.hdc.offset),'eax').mov(q(16),0);
  for(const [field,prop]of [[20,'flags'],[52,'copies']])x.mov('eax',q(field)).mov(m('esi',F[prop].offset),'eax');
  const noRange=x.unique();x.cmp(q(32),0).branch('e',noRange).mov('eax',m('ebp',-28)).mov(m('esi',F.frompage.offset),'eax').mov('eax',m('ebp',-24)).mov(m('esi',F.topage.offset),'eax').label(noRange);
  x.testOperand('ebx','ebx').branch('e',cleanup).pushOperand('ebx').invoke(G,'DeleteDC').jump(cleanup);
  x.label(cancel).cmp(m('esi',F.cancelerror.offset),0).branch('e',cleanup).mov(m('ebp',-4),32755).jump(cleanup);
  x.label(invalid).mov(m('ebp',-4),380);
  x.label(cleanup).mov('eax',q(16)).test().branch('e',noDC).push().invoke(G,'DeleteDC').label(noDC);
  for(const field of [8,12]){const empty=x.unique();x.mov('eax',q(field)).test().branch('e',empty).push().invoke(K,'GlobalFree').label(empty);}
  x.cmp(m('ebp',-8),0).branch('e',noOle).api(O,'OleUninitialize').label(noOle).mov(m('esi',76),0).mov('eax',m('ebp',-4)).test().branch('e',done).jump('native:error:raise').label(done).leave(8);
 }
};

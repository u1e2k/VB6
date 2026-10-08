/** Nonvisual CommonDialog lowering, using real comdlg32 dialogs. Buffers, masks,
 * and string snapshots are operation-local; cancellation does not overwrite
 * accepted state. No current-directory change, hook, or template injection.
 */
import {nativePrintDialogMethods} from './control-print-dialog.js';
import {mem8,mem16,mem32} from './x86-operands.js';
import {NATIVE_DIALOG_FIELDS as F,NATIVE_DIALOG_BYTES,nativeDialogSeed} from './dialog-contract.js';
const U='user32.dll',O='oleaut32.dll',C='comdlg32.dll',K='kernel32.dll',G='gdi32.dll',R='native:dialog:';
const m=(base,displacement=0)=>mem32({base,displacement}),w=(base,displacement=0)=>mem16({base,displacement}),b=(base,displacement=0)=>mem8({base,displacement});
const a=argument=>({argument}),mem=memory=>({memory}),lit=value=>({kind:'literal',value});
const ownStrings=Object.entries(F).filter(([,f])=>f.type==='string');
const zero=(x,offset,size)=>x.local(offset).mov('edi','eax').mov('ecx',size/4).xor('eax','eax').cld().repStore(32);
export const nativeDialogMethods={
 ...nativePrintDialogMethods,
 prepareNativeDialog(control){
  if(control.model.type!=='CommonDialog')return;
  try{control.dialogSeed=nativeDialogSeed(control.model.properties);}catch(e){this.fail(control.model.name+': '+e.message,control.module);}
  control.dialogExactFontSize=Number(Object.entries(control.model.properties).find(([name])=>name.toLowerCase()==='fontsize')?.[1]??8.25);
  this.data.zero(NATIVE_DIALOG_BYTES-76);
 },
 initializeNativeDialog(control){
  if(!control.dialogSeed)return;
  const x=this.x,s=control.state;
  x.value(s).add('eax',76).mov('edi','eax').mov('ecx',(NATIVE_DIALOG_BYTES-76)/4).xor('eax','eax').cld().repStore(32);
  for(const [name,f]of Object.entries(F)){
   const value=control.dialogSeed[name];
   if(f.type==='string')x.api(O,'SysAllocString',[this.string(value)]).test().branch('e','error:7');else x.value(value);
   x.store(s,f.offset);
  }
  const fontSize=this.floatLiteral(control.dialogExactFontSize);x.value({memory:fontSize}).store(s,240).value({memory:fontSize,addend:4}).store(s,244);
  if(control.model.properties.Tag)x.push(this.string(control.model.properties.Tag)).call('native:string:copy').store(s,28);
  // A nonvisual control's private identity is its own state, never an HWND.
  x.value(s).store(control.handle);
 },
 disposeNativeDialog(control){
  if(!control.dialogSeed)return;
  const x=this.x;
  for(const [,f]of ownStrings)x.api(O,'SysFreeString',[{memory:control.state,addend:f.offset}]).value(0).store(control.state,f.offset);
  const done=x.unique();x.value({memory:control.state,addend:F.hdc.offset}).test().branch('e',done).push().invoke(G,'DeleteDC').value(0).store(control.state,F.hdc.offset).label(done);
 },
 nativeDialogType(node){
  if(node.kind!=='member'||this.object(node.object)?.model?.type!=='CommonDialog')return null;
  const f=F[String(node.name).toLowerCase()];return f?.type==='string'?'string':f?.type==='points'?'double':null;
 },
 getNativeDialogProperty(object,property){
  if(object.model?.type!=='CommonDialog')return false;
  const f=F[property],x=this.x;
  if(!f){if(['name','tag','index'].includes(property))return false;this.fail('Native nonvisual CommonDialog property is not lowered: '+property);}
  this.ensure(object);this.nativeControlState(object);
  if(f.type==='points'){const out=this.floatWorkspace();x.mov('ecx',m('eax',240)).mov('edx',m('eax',244));this.rawStorageAddress(out);x.mov(m('eax'),'ecx').mov(m('eax',4),'edx');return true;}
  x.mov('eax',m('eax',f.offset));
  if(f.type==='string'){
   x.mov('ebx','eax').push().invoke(O,'SysStringLen').push().pushOperand('ebx').invoke(O,'SysAllocStringLen').test().branch('e','error:7');this.ownString();
  }
  return true;
 },
 setNativeDialogProperty(object,property,expr){
  if(object.model?.type!=='CommonDialog')return false;
  const f=F[property],x=this.x;
  if(!f){if(['tag'].includes(property))return false;this.fail('Native nonvisual CommonDialog property is not lowered: '+property);}
  if(['filetitle','hdc','lasterror'].includes(property))this.fail('CommonDialog '+property+' is read-only');
  if(f.type==='points'){
   // Preserve the authored Double exactly. CHOOSEFONT's tenths-of-a-point
   // integer is only the display/accepted-result ABI, not our property storage.
   this.floatExpression(expr);x.call('native:number:finite').mov('ebx','eax').push(this.floatLiteral(0)).pushOperand('ebx').call('native:number:compare').compare(0).branch('le','error:380');
   x.push(this.floatLiteral(16383.5)).pushOperand('ebx').call('native:number:compare').compare(0).branch('g','error:380');
   const scaled=this.floatWorkspace();this.rawStorageAddress(scaled);x.push().push(this.floatLiteral(10)).pushOperand('ebx').call('native:number:multiply').push().call('native:number:integer').push();
   this.nativeControlState(object);x.mov('esi','eax').popOperand('ecx').mov(m('esi',f.offset),'ecx').mov('ecx',m('ebx')).mov(m('esi',240),'ecx').mov('ecx',m('ebx',4)).mov(m('esi',244),'ecx');return true;
  }
  if(f.type==='string'){
   this.textExpression(expr);x.mov('ebx','eax').push().invoke(O,'SysStringLen').mov('edi','eax');
   if(property!=='filename'){
    x.pushOperand('ebx').invoke(K,'lstrlenW').cmp('eax','edi').branch('ne','error:380');
   }
   if(property==='fontname')x.mov('eax','edi').compare(1).branch('l','error:380').compare(31).branch('g','error:380');
   x.pushOperand('edi').pushOperand('ebx').invoke(O,'SysAllocStringLen').test().branch('e','error:7').push();
   this.nativeControlState(object);x.popOperand('edi').mov('ebx',m('eax',f.offset)).mov(m('eax',f.offset),'edi').pushOperand('ebx').invoke(O,'SysFreeString');
  }else{
   this.numeric(f.type==='points'?{kind:'binary',op:'*',left:expr,right:lit(10)}:expr);
   if(f.type==='boolean')this.check('Boolean');
   if(f.type==='points')x.compare(1).branch('l','error:380').compare(163835).branch('g','error:380');
   if(property==='maxfilesize')x.compare(256).branch('l','error:380').compare(1048576).branch('g','error:380');
   if(['filterindex','min','max','frompage','topage','copies'].includes(property))x.compare(0).branch('l','error:380');
   x.push();this.nativeControlState(object);x.popOperand('ecx').mov(m('eax',f.offset),'ecx');
  }
  return true;
 },
 nativeDialogMethod(object,method,args){
  if(object.model?.type!=='CommonDialog')return false;
  if(!['showopen','showsave','showcolor','showfont','showprinter'].includes(method)||args.length)this.fail('Native CommonDialog method is not lowered: '+method);
  this.ensure(object);(this.nativeDialogs ||= new Set()).add(method);this.nativeControlState(object);
  this.x.push().push(mem(object.module.handle)).call(R+method);this.checkNativeError();return true;
 },
 emitNativeDialogHelpers(){
  const features=this.nativeDialogs;if(!features?.size)return;
  if(features.has('showopen')||features.has('showsave')){this.emitNativeDialogFilter();for(const method of ['showopen','showsave'])if(features.has(method))this.emitNativeFileDialog(method);}
  if(features.has('showcolor'))this.emitNativeColorDialog();
  if(features.has('showfont'))this.emitNativeFontDialog();
  if(features.has('showprinter'))this.emitNativePrintDialog();
 },
 emitNativeDialogFilter(){
  const x=this.x,bad=x.unique(),oom=x.unique(),loop=x.unique(),separator=x.unique(),next=x.unique(),end=x.unique(),count=x.unique(),valid=x.unique(),empty=x.unique();
  x.label(R+'filter').enter(8).mov('esi',m('ebp',8)).pushOperand('esi').invoke(O,'SysStringLen').mov(m('ebp',-8),'eax').compare(1048575).branch('a',oom).inc('eax').push().push(0).invoke(O,'SysAllocStringLen').test().branch('e',oom).mov(m('ebp',-4),'eax').mov('edi','eax').mov('ecx',m('ebp',-8)).add('ecx',2).xor('eax','eax').cld().repStore(16).mov('edi',m('ebp',-4)).xor('ebx','ebx').xor('edx','edx').xor('ecx','ecx');
  x.cmp(m('ebp',-8),0).branch('e',empty);
  x.label(loop).cmp('ecx',m('ebp',-8)).branch('ae',end).movzx('eax',mem16({base:'esi',index:'ecx',scale:2})).test().branch('e',bad).compare(124).branch('e',separator);
  x.mov(mem16({base:'edi',index:'ecx',scale:2}),'ax').inc('ebx').jump(next);
  x.label(separator).testOperand('ebx','ebx').branch('e',bad).inc('edx').xor('ebx','ebx');
  x.label(next).inc('ecx').jump(loop);
  x.label(end).testOperand('ebx','ebx').branch('e',count).inc('edx').label(count).testOperand('edx',1).branch('ne',bad);
  x.label(empty).mov('eax',m('ebp',-4)).xor('edx','edx').leave(4);
  x.label(bad).push(a(-4)).invoke(O,'SysFreeString').mov('edx',380).xor('eax','eax').leave(4);
  x.label(oom).mov('edx',7).xor('eax','eax').leave(4);
 },
 emitNativeFileDialog(method){
  const x=this.x,base=-152,q=o=>m('ebp',base+o),fail=x.unique(),oom=x.unique(),invalid=x.unique(),cancel=x.unique(),cleanup=x.unique(),returning=x.unique(),scan=x.unique(),scanned=x.unique(),single=x.unique(),next=x.unique();
  const slots=[-4,-8,-12,-16,-20,-24,-28,-32];
  x.label(R+method).enter(152);zero(x,-152,152);x.mov('esi',m('ebp',12)).cmp(m('esi',76),0).branch('ne','error:5');
  x.mov('eax',m('esi',F.flags.offset)).testOperand('eax',0x004000e0).branch('ne','error:380');
  x.mov(m('esi',F.lasterror.offset),0).mov(m('esi',76),1).mov('eax',m('esi',F.cancelerror.offset)).mov(m('ebp',-44),'eax');
  x.mov(q(0),88).mov('eax',m('ebp',8)).mov(q(4),'eax');
  x.mov('eax',m('esi',F.flags.offset)).or('eax',0x80008).mov(q(52),'eax'); // OFN_EXPLORER | OFN_NOCHANGEDIR
  x.mov('eax',m('esi',F.filterindex.offset)).mov(q(24),'eax');
  x.mov('ebx',m('esi',F.maxfilesize.offset)).mov(q(32),'ebx').mov(q(40),'ebx');
  for(const [local,field]of [[-4,28],[-8,36]]){x.mov('eax','ebx').dec('eax').push().push(0).invoke(O,'SysAllocStringLen').test().branch('e',oom).mov(m('ebp',local),'eax').mov(q(field),'eax').mov('edi','eax').mov('ecx','ebx').xor('eax','eax').cld().repStore(16);}
  // Existing multi-select values seed only their first string, never overflow.
  x.pushOperand(m('esi',F.filename.offset)).invoke(K,'lstrlenW').cmp('eax','ebx').branch('ae',invalid);
  x.pushOperand('ebx').pushOperand(m('esi',F.filename.offset)).push(a(-4)).invoke(K,'lstrcpynW');
  x.pushOperand(m('esi',F.filter.offset)).call(R+'filter').test().branch('ne',next).mov(m('ebp',-36),'edx').jump(cleanup);
  x.label(next).mov(m('ebp',-12),'eax').mov(q(12),'eax');
  for(const [local,field,prop]of [[-16,44,'initdir'],[-20,48,'dialogtitle'],[-24,60,'defaultext']])x.pushOperand(m('esi',F[prop].offset)).invoke(O,'SysAllocString').test().branch('e',oom).mov(m('ebp',local),'eax').mov(q(field),'eax');
  x.local(base).push().invoke(C,method==='showopen'?'GetOpenFileNameW':'GetSaveFileNameW').test().branch('e',fail);
  x.mov('ebx',m('ebp',-4)).xor('ecx','ecx');
  // Return counted BSTR data. Explorer multi-selection includes embedded NULs;
  // a single selection remains a normal path with no embedded terminators.
  x.label(scan).cmp('ecx',q(32)).branch('ae',invalid).movzx('eax',mem16({base:'ebx',index:'ecx',scale:2})).test().branch('ne',single);
  x.mov('eax',q(52)).testOperand('eax',0x200).branch('e',scanned);
  x.mov('edx','ecx').inc('edx').cmp('edx',q(32)).branch('ae',invalid).cmp(mem16({base:'ebx',index:'edx',scale:2}),0).branch('e',scanned);
  x.label(single).inc('ecx').jump(scan).label(scanned).pushOperand('ecx').pushOperand('ebx').invoke(O,'SysAllocStringLen').test().branch('e',oom).mov(m('ebp',-28),'eax');
  x.push(a(-8)).invoke(O,'SysAllocString').test().branch('e',oom).mov(m('ebp',-32),'eax');
  for(const [local,prop]of [[-28,'filename'],[-32,'filetitle']]){
   x.pushOperand(m('esi',F[prop].offset)).invoke(O,'SysFreeString').mov('eax',m('ebp',local)).mov(m('esi',F[prop].offset),'eax').mov(m('ebp',local),0);
  }
  x.mov('eax',q(24)).mov(m('esi',F.filterindex.offset),'eax').mov('eax',q(52)).mov(m('esi',F.flags.offset),'eax').jump(cleanup);
  x.label(fail).api(C,'CommDlgExtendedError').mov(m('esi',F.lasterror.offset),'eax').test().branch('e',cancel).compare(0x3003).branch('e',oom).jump(invalid);
  x.label(cancel).cmp(m('ebp',-44),0).branch('e',cleanup).mov(m('ebp',-36),32755).jump(cleanup);
  x.label(oom).mov(m('ebp',-36),7).jump(cleanup).label(invalid).mov(m('ebp',-36),380);
  x.label(cleanup);for(const local of slots)x.push(a(local)).invoke(O,'SysFreeString');
  x.mov(m('esi',76),0).mov('eax',m('ebp',-36)).test().branch('e',returning).jump('native:error:raise').label(returning).leave(8);
 },
 emitNativeColorDialog(){
  const x=this.x,fail=x.unique(),cleanup=x.unique(),cancel=x.unique(),invalid=x.unique(),done=x.unique(),base=-112,q=o=>m('ebp',base+o);
  x.label(R+'showcolor').enter(112);zero(x,-112,112);x.mov('esi',m('ebp',12)).cmp(m('esi',76),0).branch('ne','error:5');
  x.mov('eax',m('esi',F.flags.offset)).testOperand('eax',0x70).branch('ne','error:380').or('eax',1).mov(q(20),'eax').mov(m('esi',F.lasterror.offset),0).mov(m('esi',76),1).mov(q(0),36).mov('eax',m('ebp',8)).mov(q(4),'eax');
  x.local(-76).mov(q(16),'eax').mov('edi','eax').lea('eax',m('esi',176)).pushOperand('esi').mov('esi','eax').mov('ecx',16).cld().repMove(32).popOperand('esi');
  x.local(base+12).push().push(0).pushOperand(m('esi',F.color.offset)).invoke(O,'OleTranslateColor').test().branch('s',invalid);
  x.local(base).push().invoke(C,'ChooseColorW').test().branch('e',fail);
  x.mov('eax',q(12)).mov(m('esi',F.color.offset),'eax').lea('edi',m('esi',176)).pushOperand('esi').local(-76).mov('esi','eax').mov('ecx',16).cld().repMove(32).popOperand('esi').jump(cleanup);
  x.label(fail).api(C,'CommDlgExtendedError').mov(m('esi',F.lasterror.offset),'eax').test().branch('ne',invalid).cmp(m('esi',F.cancelerror.offset),0).branch('e',cleanup).mov(m('ebp',-4),32755).jump(cleanup);
  x.label(invalid).mov(m('ebp',-4),380);
  x.label(cleanup).mov(m('esi',76),0).mov('eax',m('ebp',-4)).test().branch('e',done).jump('native:error:raise').label(done).leave(8);
 },
 emitNativeFontDialog(){
  const x=this.x,base=-176,q=o=>m('ebp',base+o),lf=-116,l=o=>m('ebp',lf+o),fail=x.unique(),invalid=x.unique(),oom=x.unique(),cleanup=x.unique(),done=x.unique();
  x.label(R+'showfont').enter(176);zero(x,-176,176);x.mov('esi',m('ebp',12)).cmp(m('esi',76),0).branch('ne','error:5');
  x.mov('eax',m('esi',F.flags.offset)).testOperand('eax',0x238).branch('ne','error:380').or('eax',0x41).mov(q(20),'eax').mov(m('esi',F.lasterror.offset),0).mov(m('esi',76),1).mov(q(0),60).mov('eax',m('ebp',8)).mov(q(4),'eax');
  x.local(lf).mov(q(12),'eax').mov('eax',m('esi',F.fontsize.offset)).mov(q(16),'eax');
  x.api(U,'GetDC',[0]).test().branch('e',invalid).mov('ebx','eax').push(90).pushOperand('ebx').invoke(G,'GetDeviceCaps').mov('edi','eax').pushOperand('ebx').push(0).invoke(U,'ReleaseDC').testOperand('edi','edi').branch('le',invalid);
  x.push(720).pushOperand('edi').pushOperand(m('esi',F.fontsize.offset)).invoke(K,'MulDiv').neg('eax').mov(l(0),'eax');
  x.mov('eax',m('esi',F.fontbold.offset)).neg('eax').imul('eax','eax',300).add('eax',400).mov(l(16),'eax');
  for(const [prop,offset]of [['fontitalic',20],['fontunderline',21],['fontstrikethru',22]])x.mov('eax',m('esi',F[prop].offset)).neg('eax').mov(b('ebp',lf+offset),'al');
  x.mov(b('ebp',lf+23),1).push(32).pushOperand(m('esi',F.fontname.offset)).local(lf+28).push().invoke(K,'lstrcpynW');
  x.local(base+24).push().push(0).pushOperand(m('esi',F.color.offset)).invoke(O,'OleTranslateColor').test().branch('s',invalid);
  x.mov('eax',m('esi',F.min.offset)).mov(q(52),'eax').mov('eax',m('esi',F.max.offset)).mov(q(56),'eax').mov('eax',m('esi',F.hdc.offset)).mov(q(8),'eax');
  x.local(base).push().invoke(C,'ChooseFontW').test().branch('e',fail);
  x.local(lf+28).push().invoke(O,'SysAllocString').test().branch('e',oom).mov('ebx','eax');
  x.pushOperand(m('esi',F.fontname.offset)).invoke(O,'SysFreeString').mov(m('esi',F.fontname.offset),'ebx');
  x.mov('eax',q(16)).mov(m('esi',F.fontsize.offset),'eax').push().emit(0xdb,0x04,0x24,0xdc,0x35).addr(this.floatLiteral(10)).emit(0xdd,0x9e).imm(240).add('esp',4).mov('eax',q(24)).mov(m('esi',F.color.offset),'eax');
  x.cmp(l(16),400).setcc('g','al').movzx('eax','al').neg('eax').mov(m('esi',F.fontbold.offset),'eax');
  for(const [prop,offset]of [['fontitalic',20],['fontunderline',21],['fontstrikethru',22]])x.movzx('eax',b('ebp',lf+offset)).test().setcc('ne','al').movzx('eax','al').neg('eax').mov(m('esi',F[prop].offset),'eax');
  x.jump(cleanup).label(fail).api(C,'CommDlgExtendedError').mov(m('esi',F.lasterror.offset),'eax').test().branch('ne',invalid).cmp(m('esi',F.cancelerror.offset),0).branch('e',cleanup).mov(m('ebp',-4),32755).jump(cleanup);
  x.label(oom).mov(m('ebp',-4),7).jump(cleanup).label(invalid).mov(m('ebp',-4),380);
  x.label(cleanup).mov(m('esi',76),0).mov('eax',m('ebp',-4)).test().branch('e',done).jump('native:error:raise').label(done).leave(8);
 }
};

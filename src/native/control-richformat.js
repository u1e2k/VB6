/** Additional scalar RichEdit operations. No Variant storage or JS runtime is
 * embedded. Mixed formatting can be queried with IsNull without converting the
 * selection to a scalar first; ordinary mixed getters still raise error 94.
 * Native contracts: EM_GETCHARFORMAT/EM_GETPARAFORMAT, FINDTEXTEXW,
 * EM_FINDTEXTEXW, EM_EXLINEFROMCHAR, EM_CANUNDO, EM_CANREDO and EM_REDO.
 * https://learn.microsoft.com/windows/win32/controls/em-findtextexw
 * https://learn.microsoft.com/windows/win32/controls/em-getparaformat
 */
import {mem32} from './x86-operands.js';
const m=(base,displacement=0)=>mem32({base,displacement});
const lit=value=>({kind:'literal',value}),U='user32.dll',O='oleaut32.dll';
const optional=(args,index,value)=>!args[index]||args[index].kind==='missing'?lit(value):args[index];
export const nativeRichFormatMethods={
 nativeRichFormatNull(node,name){
  if(name!=='isnull'||node.args.length!==1)return false;
  let member=node.args[0];while(member.kind==='group')member=member.expr;
  if(member.kind!=='member')return false;
  const object=this.object(member.object),property=String(member.name).toLowerCase(),spec=this.nativeRichFormatSpec(property);
  if(object?.model?.type!=='RichTextBox'||!spec)return false;
  this.ensure(object);(this.nativeSelectionFormats ||= new Set()).add(property);
  const record=this.nativeFormatRecord(spec),x=this.x;
  this.rawStorageAddress(record);x.push().push(spec.paragraph?0:1).push(spec.paragraph?0x43d:0x43a).push(this.controlHandleRef(object)).invoke(U,'SendMessageW');
  // Use the filled record mask, not the first run's actual effect/value.
  this.rawStorageAddress(record);x.mov('eax',m('eax',4)).and('eax',spec.mask).compare(spec.mask);this.boolean('<>');return true;
 },
 nativeRichFormatMethod(object,method,args){
  if(object.model?.type!=='RichTextBox')return false;
  const x=this.x,messages={undo:0xc7,redo:0x454,canundo:0xc6,canredo:0x455};
  if(Object.hasOwn(messages,method)){
   if(args.length)this.fail('RichTextBox.'+method+' expects no arguments');
   this.ensure(object);this.useNativeRichText(method);
   x.api(U,'SendMessageW',[this.controlHandleRef(object),messages[method],0,0]).test();this.boolean('<>');return true;
  }
  if(method==='getlinefromchar'){
   if(args.length!==1)this.fail('GetLineFromChar expects one character position');
   this.ensure(object);this.useNativeRichText('line');this.numeric(args[0]);
   x.compare(-1).branch('l','error:380').push().push(0).push(0x436).push(this.controlHandleRef(object)).invoke(U,'SendMessageW');return true;
  }
  if(method!=='find')return false;
  if(args.length<1||args.length>4||args[0].kind==='missing')this.fail('RichTextBox.Find expects text, optional start/end and flags');
  if(args.some(arg=>arg.kind==='named'))this.fail('Native RichTextBox.Find expects positional arguments');
  this.ensure(object);this.useNativeRichText('find');
  const find=this.arrayWorkspace(24,'rich-find'),flags=this.arrayWorkspace(4,'rich-find-flags');
  this.textExpression(args[0]);x.push().call('native:string:copy');const text=this.ownString();
  // FINDTEXTEXW accepts a NUL-terminated string; reject embedded NUL rather
  // than silently searching a prefix. Keep its length for the empty-string case.
  x.push().invoke(O,'SysStringLen').push();this.rawStorageAddress(text);x.mov('eax',m('eax')).push().invoke('kernel32.dll','lstrlenW');
  x.popOperand('ecx').cmp('eax','ecx').branch('ne','error:380').push();this.rawStorageAddress(find);x.popOperand('ecx').mov(m('eax',20),'ecx');
  for(const [index,fallback,offset] of [[1,0,0],[2,-1,4]]){
   this.numeric(optional(args,index,fallback));x.compare(index===1?0:-1).branch('l','error:380').push();this.rawStorageAddress(find);x.popOperand('ecx').mov(m('eax',offset),'ecx');
  }
  this.numeric(optional(args,3,0));x.testOperand('eax',~14>>>0).branch('ne','error:380').push();this.rawStorageAddress(flags);x.popOperand('ecx').mov(m('eax'),'ecx');
  this.rawStorageAddress(find);const bounds=x.unique();x.mov('ecx',m('eax',4)).cmp('ecx',-1).branch('e',bounds).cmp('ecx',m('eax')).branch('l','error:380').label(bounds);
  const empty=x.unique(),done=x.unique();x.cmp(m('eax',20),0).branch('e',empty);
  this.rawStorageAddress(text);x.mov('ecx',m('eax'));this.rawStorageAddress(find);x.mov(m('eax',8),'ecx').mov(m('eax',12),-1).mov(m('eax',16),-1).push();
  // VB rtfWholeWord=2 and rtfMatchCase=4 match the Win32 FR_* flags;
  // rtfNoHighlight=8 changes selection behavior, never native search flags.
  this.rawStorageAddress(flags);x.mov('eax',m('eax')).and('eax',6).or('eax',1).push().push(0x47c).push(this.controlHandleRef(object)).invoke(U,'SendMessageW');
  x.compare(-1).branch('e',done).push();this.rawStorageAddress(flags);const noSelect=x.unique();x.testOperand(m('eax'),8).branch('ne',noSelect);
  this.rawStorageAddress(find);x.add('eax',12).push().push(0).push(0x437).push(this.controlHandleRef(object)).invoke(U,'SendMessageW');
  x.label(noSelect).popOperand('eax').jump(done).label(empty).value(-1).label(done);return true;
 }
};

/** RichEdit selection formatting. These are native message records, not RTF
 * rewriting; untouched attributes are excluded from each setter's mask.
 * All workspaces belong to the current invocation and survive reentrant HWND
 * notifications. A heterogeneous selection raises error 94 in this scalar-only
 * AOT ABI instead of silently returning the first run's format as a Boolean.
 * Contracts: CHARFORMAT2W, PARAFORMAT2, EM_GET/SETCHARFORMAT, EM_GET/SETPARAFORMAT.
 */
const lit=value=>({kind:'literal',value});
const define=(mask,offset,kind='long',paragraph=false)=>Object.freeze({mask:mask>>>0,offset,kind,paragraph,size:paragraph?188:116});
export const NATIVE_SELECTION_FORMAT=Object.freeze({
 selbold:define(1,8,'flag'),selitalic:define(2,8,'flag'),selunderline:define(4,8,'flag'),selstrikethru:define(8,8,'flag'),
 selcolor:define(0x40000000,20,'color'),selbackcolor:define(0x04000000,96,'color'),
 selfontname:define(0x20000000,26,'string'),selfontsize:define(0x80000000,12,'points'),
 selalignment:define(8,24,'alignment',true),selindent:define(1,12,'long',true),
 selrightindent:define(2,16,'long',true),selhangingindent:define(4,20,'long',true)
});
export const nativeSelectionFormatMethods={
 nativeSelectionFormatType(node){
  if(node.kind!=='member')return null;
  const spec=NATIVE_SELECTION_FORMAT[String(node.name).toLowerCase()];
  if(!spec||this.object(node.object)?.model?.type!=='RichTextBox')return null;
  return spec.kind==='string'?'string':spec.kind==='points'?'double':'long';
 },
 nativeFormatRecord(spec){
  const record=this.arrayWorkspace(spec.size,'richedit-format'),x=this.x;
  this.rawStorageAddress(record);x.emit(0x89,0xc7,0xb9).imm(spec.size/4).emit(0x31,0xc0,0xfc,0xf3,0xab);
  this.rawStorageAddress(record);x.emit(0xc7,0x00).imm(spec.size);return record;
 },
 getNativeSelectionFormat(object,property){
  const spec=NATIVE_SELECTION_FORMAT[property];if(object.model?.type!=='RichTextBox'||!spec)return false;
  (this.nativeSelectionFormats ||= new Set()).add(property);this.ensure(object);
  const record=this.nativeFormatRecord(spec),x=this.x;
  this.rawStorageAddress(record);x.push().push(spec.paragraph?0:1).push(spec.paragraph?0x43d:0x43a).push(this.controlHandleRef(object)).invoke('user32.dll','SendMessageW');
  x.emit(0x25).imm(spec.mask).compare(spec.mask).branch('ne','error:94');
  this.rawStorageAddress(record);
  if(spec.kind==='string'){x.emit(0x05).imm(spec.offset).push().invoke('oleaut32.dll','SysAllocString').test().branch('e','error:7');this.ownString();return true;}
  if(spec.kind==='color'){
   const explicit=x.unique(),done=x.unique();
   // CFE_AUTOCOLOR/AUTOBACKCOLOR leave the RGB field undefined. Resolve the
   // active system color instead of returning that indeterminate field.
   x.emit(0xf7,0x40,8).imm(spec.mask).branch('e',explicit).api('user32.dll','GetSysColor',[property==='selcolor'?8:5]).jump(done);
   x.label(explicit).emit(0x8b,0x80).imm(spec.offset).label(done);return true;
  }
  if(spec.kind==='alignment')x.emit(0x0f,0xb7,0x80).imm(spec.offset).emit(0x48);
  else x.emit(0x8b,0x80).imm(spec.offset);
  if(spec.kind==='flag'){x.emit(0x25).imm(spec.mask).test();this.boolean('<>');}
  if(spec.kind==='points'){
   const out=this.floatWorkspace();x.push();this.rawStorageAddress(out);x.emit(0xdb,0x04,0x24,0xdc,0x35).addr(this.floatLiteral(20)).emit(0xdd,0x18,0x83,0xc4,4);
  }
  return true;
 },
 setNativeSelectionFormat(object,property,expr){
  const spec=NATIVE_SELECTION_FORMAT[property];if(object.model?.type!=='RichTextBox'||!spec)return false;
  (this.nativeSelectionFormats ||= new Set()).add(property);
  const record=this.nativeFormatRecord(spec),x=this.x;
  if(spec.kind==='string'){
   this.textExpression(expr);x.emit(0x89,0xc6).push().invoke('oleaut32.dll','SysStringLen').compare(1).branch('l','error:380').compare(31).branch('g','error:380').emit(0x89,0xc3,0x56).invoke('kernel32.dll','lstrlenW').emit(0x39,0xd8).branch('ne','error:380');
   this.rawStorageAddress(record);x.emit(0x05).imm(spec.offset).emit(0x89,0xc7,0x8d,0x4b,1,0xfc,0xf3,0x66,0xa5);
  }else{
   this.numeric(spec.kind==='points'?{kind:'binary',op:'*',left:expr,right:lit(20)}:expr);
   if(spec.kind==='flag'){this.check('Boolean');x.emit(0x25).imm(spec.mask);}
   if(spec.kind==='points')x.compare(1).branch('l','error:380').compare(327670).branch('g','error:380');
   if(spec.kind==='alignment')x.compare(0).branch('l','error:380').compare(3).branch('g','error:380').emit(0x40);
   if(spec.paragraph&&spec.kind==='long')x.compare(-31680).branch('l','error:380').compare(31680).branch('g','error:380');
   x.push();this.rawStorageAddress(record);x.emit(0x59);
  if(spec.kind==='alignment')x.emit(0x66,0x89,0x88).imm(spec.offset);
   else x.emit(0x89,0x88).imm(spec.offset);
   if(spec.kind==='color'){
    // Resolve negative OLE system colors through the actual OS, not RGB masking.
    x.emit(0x05).imm(spec.offset).push().push(0).emit(0x51).invoke('oleaut32.dll','OleTranslateColor').test().branch('s','error:380');
   }
  }
  this.rawStorageAddress(record);x.emit(0xc7,0x40,4).imm(spec.mask).push().push(spec.paragraph?0:1).push(spec.paragraph?0x447:0x444).push(this.controlHandleRef(object)).invoke('user32.dll','SendMessageW').test().branch('e','error:380');
  return true;
 }
};

/** x86 Win32 CommonDialog property storage. Native dialogs are nonvisual objects,
 * never placeholder STATIC windows. Offsets below follow the common 76-byte
 * control state; UI callbacks only receive the owner HWND, not this state pointer.
 */
const f=(offset,type='long',initial=0)=>Object.freeze({offset,type,initial});
export const NATIVE_DIALOG_FIELDS=Object.freeze({
 filename:f(80,'string',''),filter:f(84,'string',''),dialogtitle:f(88,'string',''),initdir:f(92,'string',''),defaultext:f(96,'string',''),filetitle:f(100,'string',''),fontname:f(104,'string','MS Sans Serif'),
 flags:f(108),filterindex:f(112,'long',1),cancelerror:f(116,'boolean'),color:f(120),maxfilesize:f(124,'long',32768),fontsize:f(128,'points',8.25),fontbold:f(132,'boolean'),fontitalic:f(136,'boolean'),fontunderline:f(140,'boolean'),fontstrikethru:f(144,'boolean'),
 min:f(148,'long',1),max:f(152,'long',16383),frompage:f(156,'long',1),topage:f(160,'long',1),copies:f(164,'long',1),hdc:f(168),lasterror:f(172)
});
export const NATIVE_DIALOG_BYTES=248;
export const NATIVE_DIALOG_RECORDS=Object.freeze({OPENFILENAMEW:88,CHOOSECOLORW:36,CHOOSEFONTW:60,LOGFONTW:92,PRINTDLGEXW:84});
export function nativeDialogFilter(value){
 if(typeof value!=='string'||value.includes('\0')||value.length>1048575)throw new TypeError('Invalid CommonDialog Filter');
 if(!value)return '\0\0';
 const parts=value.endsWith('|')?value.slice(0,-1).split('|'):value.split('|');
 if(parts.length%2||parts.some(s=>!s))throw new TypeError('CommonDialog Filter requires nonempty description/pattern pairs');
 return parts.join('\0')+'\0\0';
}
export function nativeDialogSeed(properties){
 const input=Object.fromEntries(Object.entries(properties).map(([k,v])=>[k.toLowerCase(),v])),result={};
 for(const [name,field]of Object.entries(NATIVE_DIALOG_FIELDS)){
  let value=input[name]??field.initial;
  if(field.type==='string'){
   if(typeof value!=='string'||value.includes('\0')||value.length>1048575)throw new TypeError('Invalid CommonDialog '+name);
   if(name==='filter')nativeDialogFilter(value);
   if(name==='fontname'&&(!value||value.length>31))throw new TypeError('CommonDialog font face must contain 1..31 UTF-16 units');
  }else if(field.type==='points'){
   value=Number(value);if(!Number.isFinite(value)||value<=0||value>16383.5)throw new TypeError('Invalid CommonDialog FontSize');value=Math.round(value*10);
  }else{
   value=Number(value);if(!Number.isInteger(value)||value< -2147483648||value>4294967295)throw new TypeError('Invalid CommonDialog '+name);
   if(field.type==='boolean')value=value?-1:0;
   if(name==='maxfilesize'&&(value<256||value>1048576))throw new TypeError('CommonDialog MaxFileSize must be 256..1048576');
   if(['filterindex','min','max','frompage','topage','copies'].includes(name)&&value<0)throw new TypeError('Invalid CommonDialog '+name);
   if(['hdc','lasterror'].includes(name)&&value)throw new TypeError('CommonDialog '+name+' is read-only');
  }
  result[name]=value;
 }
 return Object.freeze(result);
}

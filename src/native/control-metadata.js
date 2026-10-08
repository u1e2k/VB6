/** Common VB object metadata over owned BSTR slots and real HWND styles.
 * Tag is counted UTF-16, never window text. Forms and windowless timers have
 * separate slots; HWND controls retain their existing state-layout Tag field.
 */
import {mem32} from './x86-operands.js';
import {NATIVE_CONTROL_CATALOG} from './control-catalog.js';
const TAG_OFFSET=28,WS_TABSTOP=0x10000,GWL_STYLE=-16;
const tabbable=new Set(['TextBox','RichTextBox','CommandButton','CheckBox','OptionButton','ListBox','ComboBox','HScrollBar','VScrollBar','Slider','UpDown','TreeView','ListView','Toolbar','TabStrip','SSTab','DTPicker','MonthView','DriveListBox','DirListBox','FileListBox']);
const key=value=>String(value).toLowerCase();
const valid=object=>object&&!object.controlArray&&(object.form||object.model);
function standaloneTagSlot(c,object){
 const name=object.form?'form-tag:'+object.name:'timer-tag:'+object.module.name+':'+object.key;
 if(!c.data.labels.has(name))c.slot(name);return name;
}
function tagAddress(c,object){
 const x=c.x;
 if(object.form){x.value(standaloneTagSlot(c,object));return;}
 if(object.model.type!=='Timer'){c.nativeControlState(object);x.add('eax',TAG_OFFSET);return;}
 if(!object.indexed&&!object.boundIndex){x.value(standaloneTagSlot(c,object));return;}
 // Timers have no HWND user data. Resolve the already-evaluated array Index,
 // including With-bound receivers, instead of reevaluating a user expression.
 const index=object.indexSlot,done=x.unique('timer-tag');
 x.value(index.label?{memory:index.label}:{argument:index.offset});
 for(const [value,control]of object.group.entries){const next=x.unique('timer-tag-next');x.compare(value).branch('ne',next).value(standaloneTagSlot(c,control)).jump(done).label(next);}
 x.jump('error:340').label(done);
}
function requireLiveObject(c,object){
 const type=object.model?.type;
 const windowless=type==='Timer'||NATIVE_CONTROL_CATALOG[type]?.nonvisual;
 const owner=windowless?object.module:object;
 c.x.api('user32.dll','IsWindow',[c.controlHandleRef(owner)]).test().branch('e','error:5');
}
function checkWindowLong(c){
 const x=c.x,done=x.unique('window-long-ok');
 x.test().branch('ne',done).api('kernel32.dll','GetLastError',[]).test().branch('ne','error:5').label(done);
}
function readStyle(c,object){
 const x=c.x;
 x.api('kernel32.dll','SetLastError',[0]).api('user32.dll','GetWindowLongW',[c.controlHandleRef(object),GWL_STYLE]).mov('ebx','eax');
 checkWindowLong(c);x.mov('eax','ebx');
}
export function nativeMetadataType(c,node){
 if(node.kind!=='member')return null;
 const object=c.object(node.object);if(!valid(object))return null;
 const property=key(node.name);
 if(property==='tag'||property==='name')return 'string';
 return property==='tabstop'&&tabbable.has(object.model?.type)?'boolean':null;
}
export function getNativeMetadataProperty(c,object,property){
 if(!valid(object))return false;const x=c.x;
 if(property==='name'){c.withGuard(object.nativeWithActive);if(object.indexed)c.ensure(object);x.value(c.string(object.form?object.name:object.model.name));return true;}
 if(property==='tag'){
  c.ensure(object);requireLiveObject(c,object);tagAddress(c,object);
  x.mov('eax',mem32({base:'eax'})).push().call('native:string:copy');c.ownString();return true;
 }
 if(property==='tabstop'&&tabbable.has(object.model?.type)){
  c.ensure(object);requireLiveObject(c,object);readStyle(c,object);x.and('eax',WS_TABSTOP).test();c.boolean('<>');return true;
 }
 return false;
}
export function setNativeMetadataProperty(c,object,property,expr){
 if(!valid(object))return false;const x=c.x;
 if(property==='name')c.fail('Native Name is read-only');
 if(property==='tag'){
  c.textExpression(expr);x.push();requireLiveObject(c,object);tagAddress(c,object);x.mov('ebx','eax').popOperand('eax');
  // Resolve a valid receiver before allocating. Copy before releasing its old
  // value; null BSTR is a valid empty result, not an allocation failure.
  x.push().call('native:string:copy').mov('ecx',mem32({base:'ebx'})).mov(mem32({base:'ebx'}),'eax').pushOperand('ecx').invoke('oleaut32.dll','SysFreeString');return true;
 }
 if(property==='tabstop'&&tabbable.has(object.model?.type)){
  c.numeric(expr);c.check('Boolean');x.and('eax',WS_TABSTOP).push();requireLiveObject(c,object);readStyle(c,object);
  x.popOperand('ecx').and('eax',~WS_TABSTOP).or('eax','ecx').push();
  x.api('kernel32.dll','SetLastError',[0]).push(GWL_STYLE).push(c.controlHandleRef(object)).invoke('user32.dll','SetWindowLongW');checkWindowLong(c);return true;
 }
 return false;
}
export function initializeNativeObjectTag(c,object){
 const value=String((object.form?object.form.properties:object.model.properties).Tag??'');
 tagAddress(c,object);const x=c.x;
 if(!value){x.mov(mem32({base:'eax'}),0);return;}
 x.mov('ebx','eax').push(c.string(value)).call('native:string:copy').mov(mem32({base:'ebx'}),'eax');
}
export function disposeNativeStandaloneTags(c,module){
 for(const object of [module,...[...module.controls.values()].filter(control=>control.model.type==='Timer')]){
  const slot=standaloneTagSlot(c,object);
  c.x.push({memory:slot}).invoke('oleaut32.dll','SysFreeString').value(0).store(slot);
 }
}

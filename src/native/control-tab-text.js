/** Unicode tab captions use native TCITEMW messages. TCM_GETITEM may replace
 * pszText or return NULL; copy that value immediately, with a bounded scan.
 * Buffer retries distinguish a full buffer from a complete caption. */
import {NATIVE_TAB_CONTROLS} from './control-plan.js';
import {MAX_NATIVE_STRING} from './storage.js';
const key=v=>String(v).toLowerCase(),lit=value=>({kind:'literal',value}),arg=argument=>({argument});
export const nativeTabTextMethods={
 nativeTabTextType(node){const target=node.kind==='call'?node.callee:node;return target.kind==='member'&&key(target.name)==='tabcaption'&&NATIVE_TAB_CONTROLS.has(this.object(target.object)?.model?.type)?'string':null;},
 nativeTabText(object,index,value,ensured=false){
  if(!NATIVE_TAB_CONTROLS.has(object?.model?.type))return false;
  if(!ensured)this.ensure(object);this.nativeTabTextFeatures ||= new Set();this.nativeTabTextFeatures.add(value===undefined?'get':'set');
  const x=this.x,receiver=this.arrayWorkspace(8,'tab-caption-receiver');x.value(this.controlHandleRef(object)).push();this.rawStorageAddress(receiver);x.emit(0x59,0x89,0x08);
  if(index===null)x.api('user32.dll','SendMessageW',[this.controlHandleRef(object),0x130b,0,0]);else this.numeric(index);
  x.push();this.rawStorageAddress(receiver);x.emit(0x59,0x89,0x48,4);
  if(value===undefined){const out=this.temporaryString();this.rawStorageAddress(out);x.push();this.rawStorageAddress(receiver);x.emit(0xff,0x70,4,0xff,0x30).call('native:tab:caption-get');}
  else{this.textExpression(value);x.push();this.rawStorageAddress(receiver);x.emit(0xff,0x70,4,0xff,0x30).call('native:tab:caption-set');}
  return true;
 },
 nativeTabTextAssignment(target,value){if(target.kind!=='call'||target.callee.kind!=='member'||key(target.callee.name)!=='tabcaption')return false;const object=this.object(target.callee.object);if(!NATIVE_TAB_CONTROLS.has(object?.model?.type))return false;if(target.args.length!==1)this.fail('TabCaption expects one zero-based tab index');return this.nativeTabText(object,target.args[0],value);},
 nativeTabTextMethod(object,name,args){if(name!=='tabcaption'||!NATIVE_TAB_CONTROLS.has(object?.model?.type))return false;if(args.length!==1)this.fail('TabCaption expects one zero-based tab index');return this.nativeTabText(object,args[0]);},
 emitNativeTabTextHelpers(){
  if(!this.nativeTabTextFeatures?.size)return;const x=this.x;
  x.label('native:tab:caption-index').enter().value(arg(12)).test().branch('s','error:381').api('user32.dll','SendMessageW',[arg(8),0x1304,0,0]).emit(0x3b,0x45,12).branch('le','error:381').leave(8);
  const record=()=>{x.local(-28).emit(0x89,0xc7,0xb9).imm(7).emit(0x31,0xc0,0xfc,0xf3,0xab).value(1).emit(0x89,0x45,0xe4);};
  if(this.nativeTabTextFeatures.has('set')){
   x.label('native:tab:caption-set').enter(28).push(arg(12)).push(arg(8)).call('native:tab:caption-index');record();
   x.value(arg(16)).emit(0x89,0x45,0xf0).push().invoke('oleaut32.dll','SysStringLen').compare(MAX_NATIVE_STRING).branch('a','error:7').emit(0x89,0xc3).api('kernel32.dll','lstrlenW',[arg(16)]).emit(0x39,0xd8).branch('ne','error:380');
   x.local(-28).push().push(arg(12)).push(0x133d).push(arg(8)).invoke('user32.dll','SendMessageW').test().branch('e','error:381').leave(12);
  }
  if(!this.nativeTabTextFeatures.has('get'))return;
  const loop=x.unique(),scan=x.unique(),counted=x.unique(),copy=x.unique(),grow=x.unique(),size=x.unique();
  x.label('native:tab:caption-get').enter(28).push(arg(12)).push(arg(8)).call('native:tab:caption-index').value(arg(16)).emit(0x89,0xc6,0xbb).imm(32);
  x.label(loop).emit(0xff,0x36).invoke('oleaut32.dll','SysFreeString').emit(0xc7,0x06,0,0,0,0);record();
  x.emit(0x53).push(0).invoke('oleaut32.dll','SysAllocStringLen').test().branch('e','error:7').emit(0x89,0x06,0x89,0x45,0xf0,0x89,0x5d,0xf4);
  x.local(-28).push().push(arg(12)).push(0x133c).push(arg(8)).invoke('user32.dll','SendMessageW').test().branch('e','error:381');
  x.value(arg(-16)).emit(0x89,0xc2,0x31,0xc9).test().branch('e',copy);
  x.label(scan).emit(0x66,0x83,0x3c,0x4a,0).branch('e',counted).emit(0x41,0x81,0xf9).imm(MAX_NATIVE_STRING+1).branch('a','error:7').jump(scan);
  x.label(counted).emit(0x3b,0x16).branch('ne',copy).emit(0x8d,0x43,0xff,0x39,0xc1).branch('ae',grow);
  x.label(copy).emit(0x81,0xf9).imm(MAX_NATIVE_STRING).branch('a','error:7').emit(0x51,0x52,0x56).invoke('oleaut32.dll','SysReAllocStringLen').test().branch('e','error:7').emit(0x8b,0x06).leave(12);
  x.label(grow).emit(0x81,0xfb).imm(MAX_NATIVE_STRING+2).branch('ae','error:7').emit(0xd1,0xe3,0x81,0xfb).imm(MAX_NATIVE_STRING+2).branch('be',size).emit(0xbb).imm(MAX_NATIVE_STRING+2).label(size).jump(loop);
 }
};

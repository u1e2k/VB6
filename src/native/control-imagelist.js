/** Owned, nonvisual HIMAGELIST controls. Metadata nodes hold counted key/tag
 * strings and refcounted pictures; HWND clients borrow only the image list.
 * All collection indexes exposed to VB are 1-based; native image indexes are 0-based.
 * External mutation through hImageList is the caller's responsibility.
 */
import {mem32} from './x86-operands.js';
const C='comctl32.dll',K='kernel32.dll',U='user32.dll',O='oleaut32.dll',R='native:imagelist:',P='native:picture:';
const m=(base,displacement=0)=>mem32({base,displacement}),arg=argument=>({argument}),mem=(memory,addend=0)=>({memory,addend}),lit=value=>({kind:'literal',value}),key=s=>String(s).toLowerCase();
const fields={himagelist:76,imagewidth:88,imageheight:92}; // handle, head, count, width, height
export function nativeImageListPlan(properties){
 const width=Number(properties.ImageWidth??16),height=Number(properties.ImageHeight??16),images=properties.ListImages??properties.Images??[];
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>2048||height>2048)throw new TypeError('Native ImageList dimensions must be 1..2048 pixels');
 if(!Array.isArray(images)||images.length>10000)throw new TypeError('Native ImageList requires at most 10000 images');
 const keys=new Set();return {width,height,images:images.map(item=>{const name=String(item.Key||'');if(name.includes('\0')||name.length>1048575)throw new TypeError('Invalid ImageList key');if(name&&keys.has(name.toLowerCase()))throw new TypeError('Duplicate ImageList key: '+name);keys.add(name.toLowerCase());if(!item.Picture)throw new TypeError('ImageList item requires a picture');return {...item,Key:name};})};
}
const bindings={TreeView:{imagelist:[0x1109,0]},ListView:{icons:[0x1003,0],smallicons:[0x1003,1]},Toolbar:{imagelist:[0x430,0]},TabStrip:{imagelist:[0x1303,0]},SSTab:{imagelist:[0x1303,0]}};
export const nativeImageListMethods={
 prepareNativeImageList(control){if(control.model.type!=='ImageList')return;this.nativeImageLists=true;this.data.zero(20);try{control.imageListPlan=nativeImageListPlan(control.model.properties);}catch(e){this.fail(e.message,control.module);}control.imageListPlan.images=control.imageListPlan.images.map(item=>({...item,pictureSeed:this.addNativePicture(item.Picture,control.module)}));if(control.imageListPlan.images.length){this.needNativePicture('icon-handle');this.needNativeImageList('add');}},
 needNativeImageList(feature){(this.nativeImageListFeatures ||= new Set()).add(feature);},
 initializeNativeImageList(control){if(!control.imageListPlan)return;const x=this.x,p=control.imageListPlan;
  x.value(control.state).store(control.handle).value(0).store(control.state,76).store(control.state,80).store(control.state,84).value(p.width).store(control.state,88).value(p.height).store(control.state,92);
  x.api(C,'ImageList_Create',[p.width,p.height,0x21,p.images.length,1]).test().branch('e','error:7').store(control.state,76);
  for(const item of p.images){this.loadNativePictureSeed(item.pictureSeed);x.push().push(this.string(item.Key)).push(0).push(control.state).call(R+'add');if(item.Tag){x.mov('ebx','eax').push(this.string(item.Tag)).call('native:string:copy').mov(m('ebx',8),'eax');}}
  if(control.model.properties.Tag)x.push(this.string(control.model.properties.Tag)).call('native:string:copy').store(control.state,28);
 },
 disposeNativeImageList(control){if(control.imageListPlan)this.x.push(control.state).call(R+'destroy');},
 nativeImageCollectionObject(node){if(node.kind!=='member'||key(node.name)!=='listimages')return null;const owner=this.object(node.object);return owner?.model?.type==='ImageList'?{nativeImageCollection:true,owner,module:owner.module}:null;},
 nativeImageItemObject(node){if(node.kind!=='call')return null;let collection=this.nativeImageCollectionObject(node.callee);if(!collection&&node.callee.kind==='member'&&key(node.callee.name)==='item')collection=this.nativeImageCollectionObject(node.callee.object);if(!collection)return null;if(node.args.length!==1)this.fail('ListImages.Item expects an index or key');return {nativeImageItem:true,owner:collection.owner,selector:node.args[0],module:collection.module};},
 nativeImageItemAddress(item){const x=this.x;if(item.boundImageItem){this.withGuard(item.nativeWithActive);this.rawStorageAddress(item.boundImageItem);x.mov('eax',m('eax')).test().branch('e','error:91').push().call(R+'index');this.needNativeImageList('index');return;}this.ensure(item.owner);const text=this.type(item.selector)==='string';if(text)this.textExpression(item.selector);else this.numeric(item.selector);x.push().push(text?1:0);this.nativeControlState(item.owner);x.push().call(R+'find').test().branch('e','error:35601').cmp(m('eax',16),0x7fffffff).branch('ae','error:6').inc(m('eax',16)).pushOperand('edx');this.ownNativePointer(R+'free-node');x.popOperand('edx');this.needNativeImageList('find');},
 nativeImageListType(node){if(node.kind!=='member')return null;const object=this.object(node.object);return object?.nativeImageItem&&['key','tag'].includes(key(node.name))?'string':null;},
 getNativeImageListProperty(object,property){const x=this.x;
  if(object.nativeImageItem){if(!['key','tag','index'].includes(property))this.fail('Native ListImage property is not lowered: '+property);this.nativeImageItemAddress(object);if(property==='index')x.mov('eax','edx').inc('eax');else{x.pushOperand(m('eax',property==='key'?4:8)).call('native:string:copy');this.ownString();}return true;}
  if(object.nativeImageCollection){if(property!=='count')this.fail('Native ListImages property is not lowered: '+property);this.ensure(object.owner);this.nativeControlState(object.owner);x.mov('eax',m('eax',84));return true;}
  if(object.model?.type!=='ImageList')return false;
  if(property in fields){this.ensure(object);this.nativeControlState(object);x.mov('eax',m('eax',fields[property]));return true;}
  if(['name','tag','index'].includes(property))return false;
  this.fail('Native nonvisual ImageList property is not lowered: '+property);
 },
 setNativeImageListProperty(object,property,node){const x=this.x;
  if(object.nativeImageItem){if(property==='picture')return this.setNativeImageItemPicture(object,node);if(!['key','tag'].includes(property))this.fail('Native ListImage property is read-only or unsupported: '+property);this.nativeImageItemAddress(object);x.push();this.textExpression(node);x.push();this.nativeControlState(object.owner);x.push().call(R+(property==='key'?'key':'tag'));this.needNativeImageList(property);return true;}
  if(object.model?.type!=='ImageList')return false;if(property==='tag')return false;
  if(property!=='imagewidth'&&property!=='imageheight')this.fail('Native ImageList property is read-only or unsupported: '+property);
  this.numeric(node);x.compare(1).branch('l','error:380').compare(2048).branch('g','error:380').mov('ebx','eax');this.nativeControlState(object);x.mov('esi','eax').cmp(m('esi',84),0).branch('ne','error:5');
  x.pushOperand(property==='imageheight'?'ebx':m('esi',92)).pushOperand(property==='imagewidth'?'ebx':m('esi',88)).pushOperand(m('esi',76)).invoke(C,'ImageList_SetIconSize').test().branch('e','error:5').mov(m('esi',fields[property]),'ebx');return true;
 },
 setNativeImageItemPicture(object,node){const x=this.x;this.nativeImageItemAddress(object);x.pushOperand('edx').push();this.nativePictureExpression(node);x.push();this.nativeControlState(object.owner);x.push().call(R+'replace');this.needNativePicture('icon-handle');this.needNativeImageList('replace');this.invalidateNativeImageClients(object.owner);return true;},
 invalidateNativeImageClients(owner){this.x.api(U,'RedrawWindow',[mem(owner.module.handle),0,0,0x85]);},
 nativeImageListMethod(object,method,args){const x=this.x;if(!object.nativeImageCollection){if(object.model?.type==='ImageList')this.fail('Native ImageList method is not lowered: '+method);return false;}const owner=object.owner;this.ensure(owner);
  if(method==='add'){
   if(args.length<3||args.length>3)this.fail('Native ListImages.Add expects index, key and picture');
   this.numeric(args[0]?.kind==='missing'?lit(0):args[0]);x.push();this.textExpression(args[1]?.kind==='missing'?lit(''):args[1]);x.push();this.nativePictureExpression(args[2]);x.popOperand('ecx').popOperand('edx').push().pushOperand('ecx').pushOperand('edx');this.nativeControlState(owner);x.push().call(R+'add');this.needNativePicture('icon-handle');this.needNativeImageList('add');
  }else if(method==='clear'&&!args.length){this.nativeControlState(owner);x.push().call(R+'clear');this.needNativeImageList('clear');}
  else if(method==='remove'&&args.length===1){this.nativeImageItemAddress({owner,selector:args[0]});x.pushOperand('edx').push();this.nativeControlState(owner);x.push().call(R+'remove');this.needNativeImageList('remove');}
  else this.fail('Native ListImages method is not lowered: '+method);
  this.invalidateNativeImageClients(owner);return true;
 },
 initializeNativeImageBindings(module){for(const control of module.controls.values())for(const [name]of Object.entries(bindings[control.model.type]||{})){
  const entry=Object.entries(control.model.properties).find(([k])=>key(k)===name);if(!entry||!entry[1])continue;const target=module.controls.get(key(entry[1]));if(!target?.imageListPlan)this.fail('Missing native ImageList binding '+entry[1],module);this.emitNativeImageBinding(control,name,target);
 }},
 emitNativeImageBinding(object,property,target){const [message,which]=bindings[object.model.type][property],x=this.x;if(target){this.nativeControlState(target);x.mov('eax',m('eax',76));}else x.value(0);x.push().push(which).push(message).push(this.controlHandleRef(object)).invoke(U,'SendMessageW');},
 nativeImageBindingProperty(object,property){return !!bindings[object?.model?.type]?.[property];},
 setNativeImageBinding(object,property,node){if(!bindings[object.model?.type]?.[property])return false;const target=(node.kind==='nothing'||node.kind==='id'&&key(node.name)==='nothing')?null:this.object(node);if(!target&&!((node.kind==='nothing'||node.kind==='id'&&key(node.name)==='nothing'))||target&&target.model?.type!=='ImageList')this.fail('Native image binding requires an ImageList');if(target&&target.module!==object.module)this.fail('Cross-form native ImageList binding requires shared lifetime support');if(target)this.ensure(target);this.emitNativeImageBinding(object,property,target);return true;},
 nativeBoundImageIndex(control,value,property='imagelist'){
  if(value===undefined||value===null||value==='')return -1;const entry=Object.entries(control.model.properties).find(([k])=>key(k)===property);if(!entry||!entry[1])this.fail(control.model.name+' image requires '+property+' binding',control.module);const list=control.module.controls.get(key(entry[1]));if(!list?.imageListPlan)this.fail('Missing native ImageList '+entry[1],control.module);const images=list.imageListPlan.images,index=typeof value==='number'?value-1:images.findIndex(i=>key(i.Key)===key(value));if(index<0||index>=images.length)this.fail('ImageList image not found: '+value,control.module);return index;
 },
 emitNativeImageListHelpers(){if(!this.nativeImageLists)return;const x=this.x,features=this.nativeImageListFeatures||new Set(),done=x.unique(),nodeDone=x.unique();
  // Nodes own key, tag and picture references. Zero pointers are valid fields.
  x.label(R+'free-node').enter().mov('esi',m('ebp',8)).testOperand('esi','esi').branch('e',nodeDone).dec(m('esi',16)).branch('ne',nodeDone);
  for(const off of [4,8])x.pushOperand(m('esi',off)).invoke(O,'SysFreeString');
  if(this.nativePictureFeatures?.size)x.pushOperand(m('esi',12)).call(P+'release');
  x.pushOperand('esi').push(0).api(K,'GetProcessHeap').push().invoke(K,'HeapFree').label(nodeDone).value(0).leave(4);
  const loop=x.unique(),end=x.unique();x.label(R+'free-nodes').enter().mov('esi',m('ebp',8)).mov('ebx',m('esi',80)).mov(m('esi',80),0).mov(m('esi',84),0).label(loop).testOperand('ebx','ebx').branch('e',end).mov('edi',m('ebx')).mov(m('ebx'),0).mov(m('ebx',20),0).pushOperand('ebx').call(R+'free-node').mov('ebx','edi').jump(loop).label(end).value(0).leave(4);
  x.label(R+'destroy').enter().mov('esi',m('ebp',8)).pushOperand('esi').call(R+'free-nodes').mov('eax',m('esi',76)).mov(m('esi',76),0).test().branch('e',done).push().invoke(C,'ImageList_Destroy').label(done).value(0).leave(4);
  if(features.has('clear'))x.label(R+'clear').enter().mov('esi',m('ebp',8)).push(-1).pushOperand(m('esi',76)).invoke(C,'ImageList_Remove').test().branch('e','error:5').pushOperand('esi').call(R+'free-nodes').leave(4);
  if(features.has('index')){const scan=x.unique(),found=x.unique(),missing=x.unique();x.label(R+'index').enter().mov('eax',m('ebp',8)).mov('ecx',m('eax',20)).mov('edx',-1).testOperand('ecx','ecx').branch('e',found).mov('ecx',m('ecx',80)).xor('edx','edx').label(scan).testOperand('ecx','ecx').branch('e',missing).cmp('ecx','eax').branch('e',found).mov('ecx',m('ecx')).inc('edx').jump(scan).label(missing).mov('edx',-1).label(found).leave(4);}
  if(features.has('find')||features.has('add')||features.has('key'))this.emitNativeImageFind();
  if(features.has('add'))this.emitNativeImageAdd();
  if(features.has('remove')){const first=x.unique(),link=x.unique(),seek=x.unique();x.label(R+'remove').enter().mov('esi',m('ebp',8)).mov('edi',m('ebp',12)).push(arg(16)).pushOperand(m('esi',76)).invoke(C,'ImageList_Remove').test().branch('e','error:5').mov('ebx',m('esi',80)).cmp('ebx','edi').branch('e',first).label(seek).testOperand('ebx','ebx').branch('e','error:35601').cmp(m('ebx'),'edi').branch('e',link).mov('ebx',m('ebx')).jump(seek).label(link).mov('eax',m('edi')).mov(m('ebx'),'eax');const removed=x.unique();x.jump(removed).label(first).mov('eax',m('edi')).mov(m('esi',80),'eax').label(removed).dec(m('esi',84)).mov(m('edi'),0).mov(m('edi',20),0).pushOperand('edi').call(R+'free-node').leave(12);}
  for(const property of ['key','tag'])if(features.has(property))this.emitNativeImageStringSetter(property);
  if(features.has('replace'))this.emitNativeImageReplace();
 },
 emitNativeImageFind(){const x=this.x,scan=x.unique(),numeric=x.unique(),found=x.unique(),missing=x.unique(),advance=x.unique();
  // find(state, byKey, selector) -> EAX node or 0, EDX zero-based index.
  x.label(R+'find').enter().mov('esi',m('ebp',8)).mov('ebx',m('esi',80)).xor('edi','edi').cmp(m('ebp',12),0).branch('e',numeric);
  x.label(scan).testOperand('ebx','ebx').branch('e',missing).push(1).push(-1).push(arg(16)).push(-1).pushOperand(m('ebx',4)).invoke(K,'CompareStringOrdinal').compare(2).branch('e',found).mov('ebx',m('ebx')).inc('edi').jump(scan);
  x.label(numeric).mov('eax',m('ebp',16)).dec('eax').compare(10000).branch('a',missing).label(advance).testOperand('ebx','ebx').branch('e',missing).cmp('edi','eax').branch('e',found).mov('ebx',m('ebx')).inc('edi').jump(advance);
  x.label(found).mov('eax','ebx').mov('edx','edi').leave(12).label(missing).xor('eax','eax').mov('edx',-1).leave(12);
 },
 emitNativeImageAdd(){const x=this.x,cleanup=x.unique(),invalid=x.unique(),duplicate=x.unique(),oom=x.unique(),nativeFail=x.unique(),append=x.unique(),range=x.unique(),keyReady=x.unique(),swapping=x.unique(),swapped=x.unique(),rollback=x.unique(),rolled=x.unique(),linkFirst=x.unique(),linkLoop=x.unique(),linkHere=x.unique(),linked=x.unique();
  x.label(R+'add').enter(24).mov('esi',m('ebp',8)).mov(m('ebp',-4),0).mov(m('ebp',-8),0).cmp(m('esi',84),10000).branch('ae',oom).cmp(m('ebp',20),0).branch('e',invalid);
  x.mov('eax',m('ebp',12)).test().branch('e',append).dec('eax').cmp('eax',m('esi',84)).branch('a',invalid).jump(range).label(append).mov('eax',m('esi',84)).label(range).mov(m('ebp',-12),'eax');
  x.push(arg(16)).invoke(O,'SysStringLen').mov('edi','eax').push(arg(16)).invoke(K,'lstrlenW').cmp('eax','edi').branch('ne',invalid).testOperand('edi','edi').branch('e',keyReady).push(arg(16)).push(1).pushOperand('esi').call(R+'find').test().branch('ne',duplicate).label(keyReady);
  x.push(arg(20)).call(P+'icon-handle-status').testOperand('edx','edx').branch('ne',nativeFail).mov(m('ebp',-16),'eax');
  x.push(24).push(8).api(K,'GetProcessHeap').push().invoke(K,'HeapAlloc').test().branch('e',oom).mov(m('ebp',-4),'eax').mov('ebx','eax').mov(m('ebx',16),1).mov(m('ebx',20),'esi').mov('eax',m('ebp',20)).mov(m('ebx',12),'eax').mov(m('ebp',20),0);
  x.push(arg(16)).invoke(O,'SysAllocString').test().branch('e',oom).mov(m('ebx',4),'eax');
  x.push(arg(-16)).push(-1).pushOperand(m('esi',76)).invoke(C,'ImageList_ReplaceIcon').compare(-1).branch('e',nativeFail).mov('edi','eax');
  x.label(swapping).cmp('edi',m('ebp',-12)).branch('le',swapped).mov('eax','edi').dec('eax').pushOperand(1).pushOperand('eax').pushOperand(m('esi',76)).pushOperand('edi').pushOperand(m('esi',76)).invoke(C,'ImageList_Copy').test().branch('e',rollback).dec('edi').jump(swapping);
  x.label(rollback).mov(m('ebp',-20),'edi').inc('edi');const reverse=x.unique();x.label(reverse).cmp('edi',m('esi',84)).branch('g',rolled).mov('eax','edi').dec('eax').pushOperand(1).pushOperand('eax').pushOperand(m('esi',76)).pushOperand('edi').pushOperand(m('esi',76)).invoke(C,'ImageList_Copy').inc('edi').jump(reverse).label(rolled).pushOperand(m('esi',84)).pushOperand(m('esi',76)).invoke(C,'ImageList_Remove').jump(nativeFail);
  x.label(swapped).cmp(m('ebp',-12),0).branch('e',linkFirst).mov('edi',m('esi',80)).mov('ecx',m('ebp',-12)).dec('ecx').label(linkLoop).testOperand('ecx','ecx').branch('e',linkHere).mov('edi',m('edi')).dec('ecx').jump(linkLoop).label(linkHere).mov('eax',m('edi')).mov(m('ebx'),'eax').mov(m('edi'),'ebx').jump(linked);
  x.label(linkFirst).mov('eax',m('esi',80)).mov(m('ebx'),'eax').mov(m('esi',80),'ebx').label(linked).inc(m('esi',84)).mov('eax','ebx').leave(16);
  x.label(invalid).mov(m('ebp',-8),380).jump(cleanup).label(duplicate).mov(m('ebp',-8),35602).jump(cleanup).label(oom).mov(m('ebp',-8),7).jump(cleanup).label(nativeFail).mov(m('ebp',-8),481);
  x.label(cleanup).push(arg(-4)).call(R+'free-node').push(arg(20)).call(P+'release').mov('eax',m('ebp',-8)).jump('native:error:raise');
 },
 emitNativeImageStringSetter(property){const x=this.x,okay=x.unique(),field=property==='key'?4:8;
  // setter(state, borrowed BSTR, node). Copy before replacing owned storage.
  x.label(R+property).enter().mov('esi',m('ebp',8)).mov('edi',m('ebp',16)).mov('ebx',m('ebp',12));
  if(property==='key'){x.pushOperand('ebx').invoke(O,'SysStringLen').mov('ecx','eax').pushOperand('ecx').pushOperand('ebx').invoke(K,'lstrlenW').popOperand('ecx').cmp('eax','ecx').branch('ne','error:5').test().branch('e',okay).cmp(m('edi',20),'esi').branch('ne',okay).pushOperand('ebx').push(1).pushOperand('esi').call(R+'find').test().branch('e',okay).cmp('eax','edi').branch('ne','error:35602').label(okay);}
  x.pushOperand('ebx').call('native:string:copy').mov('ebx','eax').pushOperand(m('edi',field)).invoke(O,'SysFreeString').mov(m('edi',field),'ebx').value(0).leave(12);
 },
 emitNativeImageReplace(){const x=this.x,failed=x.unique(),detached=x.unique(),seek=x.unique(),positioned=x.unique();
  // replace(state, owned picture, statement-pinned node, previous native index).
  x.label(R+'replace').enter().mov('esi',m('ebp',8)).mov('edi',m('ebp',12)).mov('ebx',m('ebp',16)).testOperand('edi','edi').branch('e',failed);
  x.cmp(m('ebx',20),'esi').branch('ne',detached).mov('ecx',m('esi',80)).xor('edx','edx').label(seek).testOperand('ecx','ecx').branch('e',failed).cmp('ecx','ebx').branch('e',positioned).mov('ecx',m('ecx')).inc('edx').jump(seek);
  x.label(positioned).pushOperand('edx').pushOperand('edi').call(P+'icon-handle-status').popOperand('ecx').testOperand('edx','edx').branch('ne',failed).push().pushOperand('ecx').pushOperand(m('esi',76)).invoke(C,'ImageList_ReplaceIcon').compare(-1).branch('e',failed);
  x.label(detached).mov('eax',m('ebx',12)).mov(m('ebx',12),'edi').push().call(P+'release').leave(16);
  x.label(failed).pushOperand('edi').call(P+'release').jump('error:481');
 }
};

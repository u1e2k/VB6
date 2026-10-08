import {nativeTabTextMethods} from './control-tab-text.js';
/** Explicit tab-page ownership for the native export clone. Unassigned children
 * remain shared; names never silently pick the first control-array element.
 * A page masks its child's native WS_VISIBLE bit, without changing the child's
 * authored/runtime Visible value. No tab helper is emitted without page bindings.
 */
import {NATIVE_TAB_CONTROLS} from './control-plan.js';
const key=value=>String(value).toLowerCase(),mem=memory=>({memory}),arg=argument=>({argument});
export function nativeTabPagePlan(form){
 const controls=form.controls||[],tabs=[],pages=[],assigned=new Map();
 for(const owner of controls.filter(c=>NATIVE_TAB_CONTROLS.has(c.type))){
  const p=owner.properties||{},count=Array.isArray(p.Tabs)?p.Tabs.length:Number(p.Tabs)||3;
  if(!Number.isInteger(count)||count<1||count>32767)throw new TypeError('Invalid native tab count: '+owner.name);
  const entries=Array.from({length:count},(_,i)=>({...((Array.isArray(p.Tabs)&&p.Tabs[i])||{}),Caption:(Array.isArray(p.Tabs)?p.Tabs[i]?.Caption:undefined)??p[`TabCaption(${i})`]??'Tab '+(i+1)}));
  for(let i=0;i<count;i++){if(typeof entries[i].Caption!=='string'||entries[i].Caption.includes('\0')||entries[i].Caption.length>1048576)throw new TypeError('Invalid native tab caption: '+owner.name);
   for(const value of [entries[i].Visible,entries[i].Enabled,p[`TabVisible(${i})`],p[`TabEnabled(${i})`]]){if(value!==undefined&&![-1,0,1].includes(Number(value)))throw new TypeError('Invalid native tab header state');if(value!==undefined&&Number(value)===0)throw new TypeError('Native hidden/disabled tab headers are not yet lowered: '+owner.name);}}
  const children=controls.filter(c=>key(c.parent||'')===key(owner.name)&&(!c.nativeParentId||c.nativeParentId===owner.id));
  const bind=(child,page,origin)=>{
   if(!Number.isInteger(page)||page<0||page>=count)throw new TypeError('Invalid native TabPage: '+child.name);
   if(!children.includes(child))throw new TypeError('Tab page must own a direct child: '+child.name);
   if(!child.nativeParentId&&controls.filter(c=>key(c.name)===key(owner.name)).length!==1)throw new TypeError('Ambiguous indexed tab parent: '+owner.name);
   const previous=assigned.get(child.id);if(previous&&(previous.parentId!==owner.id||previous.page!==page))throw new TypeError('Conflicting tab page ownership: '+child.name);
   if(previous)return;
   const shifted=origin==='FRM'&&owner.type==='SSTab'&&page!==Number(p.Tab??0)&&Number(child.properties.Left)<=-30000;
   const binding={childId:child.id,parentId:owner.id,page,origin,...(shifted?{left:Number(child.properties.Left)+75000}:{})};assigned.set(child.id,binding);pages.push(binding);
  };
  const resolve=value=>{
   let name,index;
   if(typeof value==='string'){const match=value.trim().match(/^(.*?)(?:\(\s*(-?\d+)\s*\))?$/);name=match?.[1];index=match?.[2]===undefined?undefined:Number(match[2]);}
   else if(value&&typeof value==='object'){name=value.name??value.Name;index=value.index??value.Index;}
   const found=children.filter(c=>key(c.name)===key(name)&&((index===undefined&&(c.properties?.Index===undefined||c.properties.Index===null))||Number(c.properties?.Index)===index));
   if(found.length!==1)throw new TypeError('Invalid or ambiguous native tab child: '+String(name));return found[0];
  };
  for(const child of children)if(child.properties?.TabPage!==undefined)bind(child,Number(child.properties.TabPage),'TabPage');
  for(const [page,entry]of entries.entries()){
   if(entry.Controls!==undefined){if(!Array.isArray(entry.Controls))throw new TypeError('Native tab Controls must be an array');for(const value of entry.Controls)bind(resolve(value),page,'Controls');}
   const raw=Object.entries(p).flatMap(([name,value])=>{const m=name.match(/^Tab\((\d+)\)\.Control\((\d+)\)$/i);return m&&Number(m[1])===page?[{index:Number(m[2]),value}]:[];}).sort((a,b)=>a.index-b.index);
   const declared=p[`Tab(${page}).ControlCount`];
   if(declared!==undefined&&(Number(declared)!==raw.length||!Number.isInteger(Number(declared))))throw new TypeError('Native tab ControlCount does not match its saved controls');
   if(raw.some((item,i)=>item.index!==i))throw new TypeError('Native tab control ordinals must be contiguous');
   for(const item of raw)bind(resolve(item.value),page,'FRM');
  }
  for(const name of Object.keys(p)){const m=name.match(/^(?:TabCaption|TabVisible|TabEnabled)\((\d+)\)|^Tab\((\d+)\)\./i);if(m&&Number(m[1]??m[2])>=count)throw new TypeError('Saved tab property is outside the tab count: '+name);}
  tabs.push({id:owner.id,entries});
 }
 for(const child of controls)if(child.properties?.TabPage!==undefined&&!assigned.has(child.id))throw new TypeError('TabPage requires an explicit tab parent: '+child.name);
 return {tabs,pages};
}
export function normalizeNativeTabPages(project){
 for(const module of project.modules||[]){if(!module.form)continue;for(const control of module.form.controls)delete control.nativeTabPage;const plan=nativeTabPagePlan(module.form),controls=new Map(module.form.controls.map(c=>[c.id,c]));
  for(const tab of plan.tabs)controls.get(tab.id).properties.Tabs=tab.entries;
  for(const binding of plan.pages){const control=controls.get(binding.childId);control.nativeTabPage={parentId:binding.parentId,page:binding.page};if(binding.left!==undefined)control.properties.Left=binding.left;}
 }
 return project;
}
export const nativeTabPageMethods={
 ...nativeTabTextMethods,
 prepareNativeTabPages(){
  this.nativeTabPages=[];
  for(const module of this.modules.values())for(const control of module.controls.values())if(control.model.nativeTabPage){
   const binding=control.model.nativeTabPage,parent=[...module.controls.values()].find(c=>c.model.id===binding.parentId);
   if(!parent||!NATIVE_TAB_CONTROLS.has(parent.model.type)||control.nativeDescriptor.nonvisual||control.model.type==='Timer')this.fail('Invalid native tab-page control: '+control.model.name,module);
   control.tabPageRecord='native:tab-page:'+module.name+':'+control.key;
   this.data.align(4).label(control.tabPageRecord).reference(control.handle).reference(parent.handle).u32(binding.page).u32(control.model.properties.Visible===0?0:-1).u32(0);
   (parent.nativePageChildren ||= []).push(control);this.nativeTabPages.push({control,parent});
  }
 },
 initializeNativeTabPage(control){
  if(!control.tabPageRecord)return;const x=this.x;
  // The generation protects post-ShowWindow focus repair against an unload and
  // synchronous recreation, even when Windows reuses the same numeric HWND.
  x.value({memory:control.tabPageRecord,addend:16}).emit(0x40).store(control.tabPageRecord,16).value(control.model.properties.Visible===0?0:-1).store(control.tabPageRecord,12);
 },
 applyNativeTabPages(control){if(control.nativePageChildren?.length)this.x.push(mem(control.handle)).call('native:tab:apply');},
 nativeTabVisibility(object,property,value){
  if(property!=='visible'||!this.nativeTabPages.length||!object?.model||!(object.tabPageRecord||object.group&&[...object.group.entries.values()].some(c=>c.tabPageRecord)))return false;
  if(value===undefined)this.ensure(object);const x=this.x;
  if(value===undefined)x.push(this.controlHandleRef(object)).call('native:tab:visible');
  else{
   // Capture HWND before the RHS: a function which changes an array index may
   // not redirect the assignment to another child.
   const handle=this.arrayWorkspace(12,'tab-visible-hwnd');x.value(this.controlHandleRef(object)).push();this.rawStorageAddress(handle);x.emit(0x59,0x89,0x08,0x51).call('native:tab:capture').push();this.rawStorageAddress(handle);x.emit(0x59,0x89,0x48,4,0x85,0xc9);const captured=x.unique();x.branch('e',captured).emit(0x8b,0x49,16,0x89,0x48,8).label(captured);
   this.numeric(value);this.check('Boolean');x.push();this.rawStorageAddress(handle);x.emit(0x8b,0x48,4,0x85,0xc9);const current=x.unique();x.branch('e',current).emit(0x8b,0x51,16,0x3b,0x50,8).branch('ne','error:91').emit(0x8b,0x11,0x8b,0x12,0x3b,0x10).branch('ne','error:91').label(current).emit(0xff,0x30).call('native:tab:show');
  }
  return true;
 },
 emitNativeTabHelpers(){
  if(!this.nativeTabPages.length)return;
  const x=this.x,end=x.unique();
  x.label('native:tab:capture').enter();const captured=x.unique();for(const {control}of this.nativeTabPages){const next=x.unique();x.value(mem(control.handle)).test().branch('e',next).emit(0x3b,0x45,8).branch('ne',next).value(control.tabPageRecord).jump(captured).label(next);}x.value(0).label(captured).leave(4);
  x.label('native:tab:visible').enter();
  for(const {control}of this.nativeTabPages){const next=x.unique();x.value(mem(control.handle)).test().branch('e',next).emit(0x3b,0x45,8).branch('ne',next).value({memory:control.tabPageRecord,addend:12}).jump(end).label(next);}
  x.api('user32.dll','IsWindowVisible',[arg(8)]).emit(0xf7,0xd8).label(end).leave(4);
  x.label('native:tab:show').enter();const shown=x.unique();
  for(const {control}of this.nativeTabPages){const next=x.unique();x.value(mem(control.handle)).test().branch('e',next).emit(0x3b,0x45,8).branch('ne',next).value(arg(12)).store(control.tabPageRecord,12).push(control.tabPageRecord).call('native:tab:apply-item').jump(shown).label(next);}
  const zero=x.unique();x.value(arg(12)).test().branch('e',zero).value(5).label(zero).push().push(arg(8)).invoke('user32.dll','ShowWindow');x.label(shown).leave(8);
  x.label('native:tab:apply').enter();
  for(const {control,parent}of this.nativeTabPages){const next=x.unique();x.value(mem(parent.handle)).test().branch('e',next).emit(0x3b,0x45,8).branch('ne',next).push(control.tabPageRecord).call('native:tab:apply-item').label(next);}
  x.leave(4);
  x.label('native:tab:apply-item').enter(32).value(arg(8)).emit(0x89,0xc7,0x8b,0x00,0x8b,0x00,0x89,0x45,0xf0).test();const done=x.unique(),hidden=x.unique(),mask=x.unique(),noFocus=x.unique();x.branch('e',done);
  x.emit(0x8b,0x47,16,0x89,0x45,0xec,0x8b,0x47,4,0x8b,0x00,0x89,0x45,0xe8).test().branch('e',done);
  x.api('user32.dll','SendMessageW',[arg(-24),0x130b,0,0]).emit(0x3b,0x47,8).branch('ne',hidden).emit(0x8b,0x47,12).test().branch('e',hidden).value(0x10000000).jump(mask);
  x.label(hidden).value(0).label(mask).emit(0x89,0x45,0xe4);
  // Reentrant tab messages cannot apply a stale record to a recreated control.
  x.emit(0x8b,0x47,16,0x3b,0x45,0xec).branch('ne',done).emit(0x8b,0x07,0x8b,0x00,0x3b,0x45,0xf0).branch('ne',done);
  x.api('user32.dll','GetWindowLongW',[arg(-16),-16]).emit(0x25).imm(0x10000000).emit(0x3b,0x45,0xe4).branch('e',done);
  x.value(0).emit(0x89,0x45,0xe0);x.value(arg(-28)).test().branch('ne',noFocus).api('user32.dll','GetFocus',[]).test().branch('e',noFocus).emit(0x3b,0x45,0xf0);const ownFocus=x.unique();x.branch('e',ownFocus).push().push(arg(-16)).invoke('user32.dll','IsChild').test().branch('e',noFocus).label(ownFocus).value(1).emit(0x89,0x45,0xe0);
  x.label(noFocus).value(arg(-28)).test();const hide=x.unique();x.branch('e',hide).value(5).label(hide).push().push(arg(-16)).invoke('user32.dll','ShowWindow');
  x.value(arg(-32)).test().branch('e',done).emit(0x8b,0x47,16,0x3b,0x45,0xec).branch('ne',done).emit(0x8b,0x47,4,0x8b,0x00,0x3b,0x45,0xe8).branch('ne',done);
  x.api('user32.dll','IsWindow',[arg(-24)]).test().branch('e',done).api('user32.dll','SetFocus',[arg(-24)]);
  x.label(done).leave(4);
 }
};

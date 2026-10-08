import {compileProject} from '../language/compiler.js';
import {NATIVE_GRID_TYPES,NATIVE_GRID_FIELDS as F,NATIVE_GRID_PROPERTIES,nativeGridSeed} from './control-grid-contract.js';
import {nativeGridCoreSource,NATIVE_GRID_HOSTS} from './control-grid-core.js';
import {nativeGridEditMethods} from './control-grid-edit.js';
import {nativeGridHostMethods} from './control-grid-host.js';
import {nativeGridWindowMethods} from './control-grid-window.js';
const key=v=>String(v).toLowerCase(),lit=value=>({kind:'literal',value}),mem=memory=>({memory});
const properties=new Set(NATIVE_GRID_PROPERTIES.map(key)),indexed={colwidth:F.widths,rowheight:F.heights,rowdata:F.rowdata,coldata:F.coldata,colalignment:F.alignment};
export const nativeGridMethods={
 ...nativeGridHostMethods,...nativeGridWindowMethods,...nativeGridEditMethods,
 isNativeGrid(object){return NATIVE_GRID_TYPES.has(object?.model?.type);},
 prepareNativeGrid(control){
  if(!this.isNativeGrid(control))return;
  this.nativeGridControls ||= [];
  control.gridIndex=this.nativeGridControls.length;this.nativeGridControls.push(control);
  if(this.nativeGridControls.length>10000)this.fail('Native grid instance limit exceeded');
  try{control.gridSeed=nativeGridSeed(control.model);}catch(error){this.fail(control.model.name+': '+error.message,control.module);}
  this.data.zero(72); // fields76..144: receiver stamp, colors, editor and owner form
 },
 prepareGridKernel(){
  if(!this.nativeGridControls?.length)return;
  let name='VB6NativeGrid',i=0;while(this.modules.has(key(name)))name='VB6NativeGrid'+(++i);
  const p=compileProject({name,modules:[{id:name,name,kind:'module',code:nativeGridCoreSource(this.nativeGridControls.length)}]});
  if(!p.valid)throw new Error('Invalid private native grid kernel: '+JSON.stringify(p.diagnostics));
  const module=p.modules.get(key(name));module.nativeInternal=true;
  // D is a private fixed POD matrix: specialize only this compiler-owned symbol
  // to checked direct storage. User arrays keep their full SAFEARRAY semantics.
  module.declarations=module.declarations.filter(d=>key(d.name)!=='d');
  this.data.align(4).label('native:grid:state').zero(Object.keys(F).length*4*this.nativeGridControls.length);
  this.externals.set(key(name),new Map());const before=[this.preparingModule,this.preparingProcedure];this.prepareModule(module);[this.preparingModule,this.preparingProcedure]=before;
  this.gridModule=this.modules.get(key(name));this.gridModule.nativeState={label:'native:grid:state',fields:Object.keys(F).length,count:this.nativeGridControls.length};this.gridRoots=new Set();this.gridFeatures=new Set();
 },
 gridStateVariable(node,context){
  if(!context?.module?.nativeState||node.kind!=='call'||node.callee.kind!=='id'||key(node.callee.name)!=='d')return null;
  if(node.args.length!==2)this.fail('Invalid private grid state rank');return {type:'Long',nativeGridState:true,indices:node.args,table:context.module.nativeState};
 },
 gridStateAddress(variable){
  const [field,index]=variable.indices,x=this.x,f=this.constant(field),i=this.constant(index),{label,fields,count}=variable.table,stride=fields*4;
  if(Number.isInteger(f)&&Number.isInteger(i)){if(f<0||f>=fields||i<0||i>=count)this.fail('Invalid private grid state subscript');x.value(label).emit(0x05).imm(i*stride+f*4);return;}
  if(Number.isInteger(f)){
   if(f<0||f>=fields)this.fail('Invalid private grid field');this.numeric(index);x.compare(count).branch('ae','error:9').emit(0x69,0xc0).imm(stride).emit(0x05).addr(label,f*4);return;
  }
  this.numeric(field);x.compare(fields).branch('ae','error:9').push();this.numeric(index);x.compare(count).branch('ae','error:9').emit(0x69,0xc0).imm(stride).emit(0x59,0x8d,0x04,0x88,0x05).addr(label);
 },
 gridProc(name){this.gridRoots.add(key(name));return this.gridModule.procedures.get(key(name));},
 invokeGrid(name,args){const target=this.gridProc(name);this.nativeTypedCall(target,this.nativeCallPlan(target,args));},
 gridArgs(object){return ['index','hwnd','epoch'].map(field=>({kind:'gridReceiver',field,object}));},
 gridExpression(node){
  if(node.kind!=='gridReceiver'&&node.kind!=='gridField')return false;
  if(node.kind==='gridField'){this.invokeGrid('getfield',[...this.gridArgs(node.object),lit(node.field)]);return true;}
  if(node.field==='hwnd')this.x.value(this.controlHandleRef(node.object));
  else{this.nativeControlState(node.object);this.x.emit(0x8b,0x80).imm(node.field==='index'?76:80);}
  return true;
 },
 gridType(node){
  if(['gridReceiver','gridField'].includes(node.kind))return 'long';
  const n=node.kind==='call'?node.callee:node;if(n.kind!=='member')return null;
  const object=this.object(n.object);if(!this.isNativeGrid(object))return null;
  if(['text','textmatrix','clip','formatstring'].includes(key(n.name)))return 'string';
  if(properties.has(key(n.name))||Object.hasOwn(indexed,key(n.name)))return 'long';return null;
 },
 getNativeGridProperty(object,property){
  if(!this.isNativeGrid(object)||!properties.has(property)&&!['text','clip','formatstring'].includes(property))return false;
  this.ensure(object);this.gridFeatures.add(property);
  if(property==='text')this.invokeGrid('gettext',[...this.gridArgs(object),lit(-1),lit(-1)]);
  else if(property==='formatstring')this.invokeGrid('formattext',this.gridArgs(object));
  else if(property==='clip')this.invokeGrid('clip',this.gridArgs(object));
  else this.invokeGrid('getfield',[...this.gridArgs(object),lit(F[property])]);
  return true;
 },
 setNativeGridProperty(object,property,value){
  if(!this.isNativeGrid(object)||!properties.has(property)&&!['text','clip','formatstring'].includes(property))return false;
  this.gridFeatures.add(property);
  if(property==='text')this.invokeGrid('settext',[...this.gridArgs(object),lit(-1),lit(-1),value]);
  else if(['clip','formatstring'].includes(property))this.invokeGrid(property==='clip'?'setclip':'formatstring',[...this.gridArgs(object),value]);
  else this.invokeGrid('setfield',[...this.gridArgs(object),lit(F[property]),value]);return true;
 },
 gridIndexedAssignment(target,value){
  if(target.kind!=='call'||target.callee.kind!=='member')return false;
  const owner=this.object(target.callee.object),property=key(target.callee.name);if(!this.isNativeGrid(owner)||property!=='textmatrix'&&!Object.hasOwn(indexed,property))return false;
  if(target.args.length!==(property==='textmatrix'?2:1))this.fail('Native '+property+' has an invalid index count');
  this.ensure(owner);this.gridFeatures.add(property);
  this.invokeGrid(property==='textmatrix'?'settext':'setindexed',[...this.gridArgs(owner),...(property==='textmatrix'?[]:[lit(indexed[property])]),...target.args,value]);return true;
 },
 nativeGridMethod(object,method,args){
  if(!this.isNativeGrid(object))return false;
  if(method==='textmatrix'||Object.hasOwn(indexed,method)){
   if(args.length!==(method==='textmatrix'?2:1))this.fail('Native '+method+' has an invalid index count');this.ensure(object);this.gridFeatures.add(method);
   this.invokeGrid(method==='textmatrix'?'gettext':'getindexed',[...this.gridArgs(object),...(method==='textmatrix'?[]:[lit(indexed[method])]),...args]);return true;
  }
  if(!['additem','removeitem','clear'].includes(method))return false;
  if(method==='additem'&&(args.length<1||args.length>2)||method==='removeitem'&&args.length!==1||method==='clear'&&args.length)this.fail('Invalid native grid arguments for '+method);
  this.ensure(object);this.gridFeatures.add(method);this.invokeGrid(method,[...this.gridArgs(object),...args,...(method==='additem'&&args.length===1?[lit(-1)]:[])]);return true;
 },
 initializeNativeGrid(control){
  if(!this.isNativeGrid(control))return;
  const x=this.x,seed=control.gridSeed,receiver=this.gridArgs(control);
  x.value(control.gridIndex).store(control.state,76).value(mem(control.module.handle)).store(control.state,140);
  x.push(seed.fields.cols).push(seed.fields.rows).push(mem(control.handle)).push(control.gridIndex).call(this.gridProc('initialize').label);this.checkNativeError();
  x.push(control.gridIndex).call(this.gridProc('stamp').label);this.checkNativeError();x.store(control.state,80);
  // The seed contract already validates every design-time scalar. Store those
  // constants directly: creation must not pull in the mutable resize/selection
  // setter family, nor deliver user events before Form_Load.
  const seedBase=control.gridIndex*Object.keys(F).length*4;
  for(const [field,value]of Object.entries(seed.fields))x.value(field==='redraw'?0:value).store('native:grid:state',seedBase+F[field]*4);
  for(const cell of seed.cells)this.invokeGrid('settext',[...receiver,lit(cell.row),lit(cell.col),lit(cell.text)]);
  for(const [field,values,fallback]of [[F.widths,seed.widths,1200],[F.heights,seed.heights,315]])for(let i=0;i<values.length;i++)if(values[i]!==fallback)this.invokeGrid('setindexed',[...receiver,lit(field),lit(i),lit(values[i])]);
  if(seed.formatString)this.invokeGrid('formatstring',[...receiver,lit(seed.formatString)]);
  x.value(seed.fields.redraw).store('native:grid:state',seedBase+F.redraw*4);
 },
 disposeNativeGrid(control){if(!this.isNativeGrid(control))return;const end=this.x.unique();this.nativeGridEditing=true;this.x.value({memory:control.state,addend:108}).test().branch('e',end).push(0).push(0).push({memory:control.state,addend:108}).call('native:grid:edit-finish').label(end);this.x.value(0).store(control.state,80).push(control.gridIndex).call(this.gridProc('dispose').label);this.checkNativeError();},
 emitGridKernel(){
  if(!this.gridModule)return;
  const needed=new Set(),visit=name=>{if(needed.has(name))return;needed.add(name);const proc=this.gridModule.procedures.get(name);if(!proc)return;
   const walk=node=>{if(!node||typeof node!=='object')return;if(node.kind==='id'&&this.gridModule.procedures.has(key(node.name)))visit(key(node.name));if(Array.isArray(node)){for(const v of node)walk(v);}else for(const v of Object.values(node))walk(v);};walk(proc.proc.code);};
  for(const name of this.gridRoots)visit(name);
  for(const [name,proc]of this.gridModule.procedures)if(needed.has(name)){if(Object.hasOwn(NATIVE_GRID_HOSTS,name))this.emitGridHost(name,proc);else this.procedure(proc);}
  this.gridEmitted=[...needed].sort();
 }
};

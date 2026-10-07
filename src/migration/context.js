import {key, identifier, typeName} from './names.js';
import {diagnostic, invokePlugins} from './contracts.js';
import {INTRINSICS, INTRINSIC_CONSTANTS, BUILTIN_NAMES} from './registry.js';

export function moduleMember(module, name) {
  const k=key(name),decl=module.declarations.find(d=>key(d.name)===k);
  if(decl)return {...decl,owner:module};
  const proc=[...module.procedures.values()].find(p=>key(p.name)===k && p.accessor!=='let' && p.accessor!=='set');
  if(proc)return {...proc,type:proc.returnType,procedure:true,owner:module};
  const control=[...(module.form?.controls||[]),...(module.form?.menus||[])].find(c=>key(c.name)===k);
  if(control)return {...control,type:control.type||'Menu',control:true,owner:module,controlArray:control.properties?.Index!==undefined};
  const event=module.events?.get(k);if(event)return {...event,procedure:true,kind:'event',owner:module};
  const record=Object.keys(module.types).find(t=>key(t)===k);
  if(record)return {name:record,type:record,record:true,owner:module};
  return null;
}
export function createContext(state, module, proc=null) {
  const context={...state,module,proc,source:module.name,line:proc?.line||1,locals:new Map(),aliases:new Map(),temp:0};
  for(const param of proc?.params||[])context.locals.set(key(param.name),{...param,parameter:true});
  for(const op of proc?.code||[])if(op.op==='dim'||op.op==='redim')for(const decl of op.decls){
    if(op.op==='redim'&&(context.locals.has(key(decl.name))||moduleMember(module,decl.name)))continue;
    context.locals.set(key(decl.name),{...decl,...(op.op==='redim'?{bounds:[]}:{}),local:true,static:op.static||proc.static});
  }
  context.add=(code,message,severity='error',details={})=>{
    const value=diagnostic(code,message,context,severity,details);
    if(!state.diagnostics.some(d=>d.code===value.code&&d.source===value.source&&d.line===value.line&&d.message===value.message))state.diagnostics.push(value);
    return value;
  };
  context.hook=(hook,input)=>invokePlugins(state.plugins,hook,input,context);
  context.constants=new Map(module.constantBindings||[]);
  context.find=name=>{
    const k=key(name);
    if(context.locals.has(k))return context.locals.get(k);
    const local=moduleMember(module,name);if(local)return local;
    if(module.form&&['caption','left','top','width','height','backcolor','forecolor','visible','enabled','show','hide','refresh','move','hwnd'].includes(k))return {name,formMember:true,type:k==='caption'?'String':k==='visible'||k==='enabled'?'Boolean':'Long'};
    const owner=state.compiled.modules.get(k);if(owner)return {name:owner.name,type:owner.name,module:owner,form:!!owner.form};
    const found=[];
    for(const other of state.compiled.modules.values())if(other!==module&&other.kind==='module'){
      const member=moduleMember(other,name);if(member&&member.scope==='public')found.push(member);
    }
    if(found.length>1)context.add('MIG_AMBIGUOUS_NAME','Ambiguous project member: '+name);
    if(found.length)return found[0];
    if(k==='me')return {name:'Me',type:module.name,module,form:!!module.form};
    return null;
  };
  context.resolve=node=>{
    if(!node)return null;
    if(node.kind==='group')return context.resolve(node.expr);
    if(node.kind==='with')return context.withSymbol;
    if(node.kind==='id')return context.find(node.name);
    if(node.kind==='new')return {name:node.name,type:node.name};
    if(node.kind==='member'){
      const receiver=context.resolve(node.object);
      const owner=receiver?.module||state.compiled.modules.get(key(receiver?.type||''));
      if(owner)return moduleMember(owner,node.name);
    }
    if(node.kind==='call'){
      const callee=context.resolve(node.callee);
      if(callee?.controlArray)return {...callee,controlArray:false};
      if(callee?.bounds!==undefined&&callee.bounds!==null)return {...callee,bounds:null,arrayElement:true};
      if(callee?.procedure)return {type:callee.returnType,owner:callee.owner};
      if(callee&&['variant','object'].includes(key(callee.type)))return {type:'Variant',arrayElement:true,variantIndex:true};
    }
    return null;
  };
  context.type=node=>{
    if(!node)return 'Variant';
    if(node.kind==='literal')return node.valueType||'Variant';
    if(node.kind==='currency')return 'Currency';
    if(node.kind==='date')return 'Date';
    if(node.kind==='group'||node.kind==='unary')return context.type(node.expr);
    if(node.kind==='typeof')return 'Boolean';
    if(node.kind==='binary'){
      if(['=','<>','<','>','<=','>=','is','like'].includes(node.op)&&![context.type(node.left),context.type(node.right)].some(t=>['variant','object'].includes(key(t))))return 'Boolean';
      if(node.op==='&')return 'String';
      const a=key(context.type(node.left)),b=key(context.type(node.right));
      if(['variant','object'].includes(a)||['variant','object'].includes(b))return 'Variant';
      if(node.op==='/')return 'Double';
      if(a===b)return a;
      return a==='double'||b==='double'?'Double':a==='single'||b==='single'?'Single':a==='currency'||b==='currency'?'Currency':'Long';
    }
    if(node.kind==='call'&&node.callee.kind==='id'){
      const k=key(node.callee.name),types={cint:'Integer',clng:'Long',ccur:'Currency',cstr:'String',cdate:'Date',cbool:'Boolean',csng:'Single',cdbl:'Double',cbyte:'Byte',cdec:'Decimal',len:'Long',lenb:'Long',ubound:'Long',lbound:'Long',instr:'Long',msgbox:'Long'};
      if(types[k])return types[k];
    }
    return context.resolve(node)?.type||'Variant';
  };
  context.netType=(type)=>{
    const k=key(type),mapped=typeName(type,state.interfaces);
    if(['byte','boolean','integer','long','single','double','currency','date','string','variant','object','any'].includes(k)||state.interfaces.has(k))return mapped;
    const owner=[...state.compiled.modules.values()].find(m=>Object.keys(m.types).some(t=>key(t)===k)||Object.keys(m.enums).some(t=>key(t)===k));
    return owner&&owner!==module?identifier(owner.name)+'.'+identifier(type):mapped;
  };
  context.name=name=>context.aliases.get(key(name))||identifier(name);
  return context;
}
export function isBuiltin(name) { const k=key(name);return Object.hasOwn(INTRINSICS,k)||Object.hasOwn(INTRINSIC_CONSTANTS,k)||BUILTIN_NAMES.has(k)||/^vb\w+$/i.test(name)||['me','debug','err','app','screen','clipboard','printer'].includes(k); }

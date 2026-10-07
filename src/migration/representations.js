import {key} from './names.js';
import {createContext} from './context.js';
import {recordTraits} from './record-types.js';

const scalars=new Set(['byte','integer','long','single','double','boolean']);
const array=decl=>decl?.bounds!=null&&!decl.paramArray;
const procKey=proc=>proc?key(proc.name)+':'+(proc.accessor||proc.kind):'';
const identity=(module,proc,name)=>key(module.name)+'/'+procKey(proc)+'/'+key(name);
const normalized=node=>node?.kind==='group'?normalized(node.expr):node;
function constant(node,context){
  node=normalized(node);if(!node)return context.module.optionBase;
  if(node.kind==='literal'&&typeof node.value==='number')return node.value;
  if(node.kind==='id')return context.constants.get(key(node.name));
  if(node.kind==='unary'&&node.op==='-'){const value=constant(node.expr,context);return typeof value==='number'?-value:undefined;}
}
function visit(node,action,parent=null,slot='') {
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(const child of node)visit(child,action,parent,slot);return;}
  action(node,parent,slot);
  for(const [name,value] of Object.entries(node))if(name!=='decls'&&value&&typeof value==='object')visit(value,action,node,name);
}
function successors(code,pc){
  const op=code[pc];if(['return','end'].includes(op.op))return [];
  if(op.op==='jump')return [op.target];
  if(['branch','forInit','forNext','eachInit','eachNext'].includes(op.op))return [pc+1,op.target];
  return [pc+1];
}
/** Forward must analysis. Exceptional/resumable control flow is rejected by the
 * caller; a successful ReDim dominates subsequent accesses on normal paths. */
function definitely(code,initial,transfer){
  const incoming=Array(code.length).fill(true),outgoing=Array(code.length).fill(true),reachable=new Set(),pred=code.map(()=>[]);
  const queue=[0];while(queue.length){const pc=queue.pop();if(pc>=code.length||pc<0||reachable.has(pc))continue;reachable.add(pc);for(const next of successors(code,pc)){if(next>=0&&next<code.length){pred[next].push(pc);queue.push(next);}}}
  let changed=true;while(changed){changed=false;for(const pc of reachable){const input=pc===0?initial:pred[pc].every(from=>outgoing[from]);const output=transfer(code[pc],input);if(input!==incoming[pc]||output!==outgoing[pc]){incoming[pc]=input;outgoing[pc]=output;changed=true;}}}
  return {incoming,reachable};
}

/** A conservative whole-procedure plan. A rejected optimization retains the
 * compatibility representation; it never removes an unsupported-code diagnostic. */
export function createRepresentationPlan(state) {
  const arrays=new Map(),specialized=new Map(),records=new Map(),decisions=[];
  const enabled=state.options.codeStyle==='native';
  const opaque=state.plugins.some(plugin=>['expression','statement','control','finalize'].some(hook=>plugin[hook])&&plugin.representationSafe!==true);
  const risky=new Set(['onError','resume','gosub','gosubReturn','computedJump']);
  for(const module of state.compiled.modules.values()){
    for(const type of Object.keys(module.types)){
      const traits=recordTraits(state.compiled,module,type,records);
      decisions.push({source:module.name,symbol:type,kind:'record',representation:enabled&&!traits.copy?'structure':'owned-value',initialization:traits.initialize?'factory':'default',reason:traits.copy?'Owned array/Variant fields require copying':'Fields use native value semantics'});
    }
    for(const proc of module.procedures.values()){
      const context=createContext(state,module,proc),candidates=new Map();
      for(const decl of context.locals.values())if(array(decl)){
        const item={id:identity(module,proc,decl.name),decl,context,rank:decl.bounds.length||null,uses:new Set(),edges:new Set(),reason:null};
        if(!enabled)item.reason='Compatibility profile';
        else if(opaque)item.reason='Opaque extension may observe representation';
        else if(decl.parameter)item.reason='Public/call-bound array contract remains compatibility storage';
        else if((!scalars.has(key(decl.type))&&!(key(decl.type)==='string'&&!decl.bounds.length))||decl.fixedLength)item.reason='Element initialization/ownership requires compatibility storage';
        else if(proc.code.some(op=>risky.has(op.op)))item.reason='Resumable/indirect control flow requires compatibility storage';
        if(decl.bounds.length&&decl.bounds.some(([lower,upper])=>!Number.isInteger(constant(lower,context))||!Number.isInteger(constant(upper,context))||constant(upper,context)<constant(lower,context)||constant(upper,context)-constant(lower,context)>=2147483647))item.reason='Unproven or invalid declared bounds';
        if(decl.bounds.length>1&&decl.bounds.some(([lower])=>constant(lower,context)!==0))item.reason='Nonzero multidimensional bounds require compatibility storage';
        candidates.set(key(decl.name),item);
      }
      // Infer one stable rank before checking any uses.
      for(const op of proc.code)if(op.op==='redim')for(const decl of op.decls){
        const item=candidates.get(key(decl.name));if(!item)continue;
        if(item.rank&&item.rank!==decl.bounds?.length)item.reason='ReDim changes native rank';
        item.rank ||= decl.bounds?.length;
      }
      for(const item of candidates.values())item.rank ||= 1;
      const producers=[];
      for(const [pc,op] of proc.code.entries()){
        if(op.op==='redim')for(const decl of op.decls){
          const item=candidates.get(key(decl.name));if(!item)continue;
          if(item.decl.bounds.length||decl.bounds?.length!==item.rank||decl.bounds.some(([lower])=>constant(lower,context)!==0)||key(item.decl.type)==='string'||decl.explicitType&&key(decl.type)!==key(item.decl.type))item.reason='ReDim changes storage rank, lower bound or element type';
          // Bounds may reference the old array; preserve their evaluation dependencies.
          for(const bound of decl.bounds||[])visit(bound,(node)=>{if(node.kind==='id'&&candidates.has(key(node.name)))candidates.get(key(node.name)).uses.add(pc);});
        }
        visit(op,(node,parent,slot)=>{
          if(node.kind==='call'){
            const callee=context.resolve(node.callee);
            for(const argument of node.args||[]){
              const actual=normalized(argument.kind==='named'?argument.expr:argument);
              const item=actual?.kind==='call'&&actual.callee.kind==='id'?candidates.get(key(actual.callee.name)):null;
              if(item&&(!callee?.procedure||callee.external||callee.owner?.kind!=='module'||[...state.compiled.modules.values()].some(m=>[...m.procedures.values()].some(p=>p.code.some(i=>i.op==='redim')))))item.reason='Unproven element-reference lifetime or redimensioning boundary';
            }
          }
          if(node.kind!=='id')return;
          const item=candidates.get(key(node.name));if(!item)return;
          if(parent?.kind==='call'&&slot==='callee'){
            if(parent.args.length!==item.rank||parent.args.some(arg=>['named','missing'].includes(arg.kind)))item.reason='Index rank or named/omitted arguments';
            item.uses.add(pc);
            // Native CLR element references preserve writes and alias identity. A
            // redimensioning callee would additionally need VB SAFEARRAY locks.
            if(op.op==='expr'&&op.expr!==parent&&[...state.compiled.modules.values()].some(m=>[...m.procedures.values()].some(p=>p.code.some(i=>i.op==='redim'))))item.reason='Element reference may escape to redimensioning code';
            return;
          }
          if(parent?.op==='erase')return;
          if(parent?.op==='eachInit'&&item.rank===1&&item.decl.bounds.length){item.uses.add(pc);return;}
          if(parent?.kind==='call'&&slot==='args'&&parent.callee.kind==='id'&&!context.find(parent.callee.name)&&['lbound','ubound','isarray','join','filter'].includes(key(parent.callee.name))){
            if(['join','filter'].includes(key(parent.callee.name))&&(item.rank!==1||key(item.decl.type)!=='string'))item.reason='String intrinsic requires a native string vector';
            item.uses.add(pc);return;
          }
          if(parent?.op==='assign'&&['target','expr'].includes(slot)){
            const other=normalized(slot==='target'?parent.expr:parent.target);
            const linked=other?.kind==='id'&&candidates.get(key(other.name));
            if(slot==='target'&&key(item.decl.type)==='string'&&other?.kind==='call'&&other.callee.kind==='id'&&!context.find(other.callee.name)&&['split','filter'].includes(key(other.callee.name))){producers.push([item,other]);return;}
            if(linked&&key(linked.decl.type)===key(item.decl.type)&&item.rank===linked.rank&&!item.decl.bounds.length&&!linked.decl.bounds.length){item.edges.add(linked);return;}
          }
          item.reason='Array escapes indexed/bounds/local-copy uses';
        });
      }
      for(const [item,producer] of producers)if(key(producer.callee.name)==='filter'){
        const input=normalized(producer.args[0]),other=input?.kind==='id'?candidates.get(key(input.name)):null;
        if(other&&key(other.decl.type)==='string'&&other.rank===1)item.edges.add(other);
        else if(!(input?.kind==='call'&&input.callee.kind==='id'&&key(input.callee.name)==='split'&&!context.find(input.callee.name)))item.reason='Filter source needs a compatibility-to-native adapter';
      }
      const initially=new Set([...candidates.values()].filter(item=>item.decl.bounds.length).map(item=>key(item.decl.name)));
      const names=[...candidates.keys()],incoming=proc.code.map(()=>new Set(names)),outgoing=proc.code.map(()=>new Set(names)),pred=proc.code.map(()=>[]),reachable=new Set(),queue=[0];
      while(queue.length){const pc=queue.pop();if(pc<0||pc>=proc.code.length||reachable.has(pc))continue;reachable.add(pc);for(const next of successors(proc.code,pc))if(next>=0&&next<proc.code.length){pred[next].push(pc);queue.push(next);}}
      let flowChanged=true;
      while(flowChanged){flowChanged=false;for(const pc of reachable){
        const input=pc===0?new Set(initially):new Set(names.filter(name=>pred[pc].every(from=>outgoing[from].has(name))));
        const output=new Set(input),op=proc.code[pc];
        if(op.op==='redim')for(const decl of op.decls)output.add(key(decl.name));
        if(op.op==='erase')for(const node of op.exprs)if(node.kind==='id'&&!initially.has(key(node.name)))output.delete(key(node.name));
        if(op.op==='assign'&&op.target.kind==='id'&&candidates.has(key(op.target.name))){
          const rhs=normalized(op.expr),name=key(op.target.name);
          if(rhs?.kind==='id'&&input.has(key(rhs.name))||rhs?.kind==='call'&&rhs.callee.kind==='id'&&!context.find(rhs.callee.name)&&['split','filter'].includes(key(rhs.callee.name)))output.add(name);else output.delete(name);
        }
        const same=(a,b)=>a.size===b.size&&[...a].every(name=>b.has(name));
        if(!same(input,incoming[pc])||!same(output,outgoing[pc])){incoming[pc]=input;outgoing[pc]=output;flowChanged=true;}
      }}
      for(const item of candidates.values())if([...item.uses].some(pc=>reachable.has(pc)&&!incoming[pc].has(key(item.decl.name))))item.reason='Allocation is not proven on every access path';
      // Representation equality propagates across local whole-array copy edges.
      let changed=true;while(changed){changed=false;for(const item of candidates.values())if(!item.reason&&[...item.edges].some(other=>other.reason)){item.reason='Connected array requires compatibility representation';changed=true;}}
      for(const item of candidates.values()){
        if(!item.reason)arrays.set(item.id,{rank:item.rank,fixed:!!item.decl.bounds.length,lower:item.decl.bounds.length===1?constant(item.decl.bounds[0][0],context):0,upper:item.decl.bounds.length===1?constant(item.decl.bounds[0][1],context):null});
        decisions.push({source:module.name,procedure:proc.name,symbol:item.decl.name,kind:'array',representation:item.reason?'compatibility':item.rank===1?'native-vector':'native-array',reason:item.reason||'Native scalar array; shape, local uses and allocation verified'});
      }
      if(enabled&&!opaque&&!proc.code.some(op=>risky.has(op.op))){
        for(const decl of context.locals.values())if(key(decl.type)==='variant'&&decl.bounds==null&&!decl.parameter&&!decl.static){
          let type=null,blocked=false,writes=0;const reads=new Set();
          for(const [pc,op] of proc.code.entries()){
            const write=op.op==='assign'&&op.target.kind==='id'&&key(op.target.name)===key(decl.name);
            if(write){const t=key(context.type(op.expr));if(!['string','boolean',...scalars].includes(t)||type&&type!==t||op.objectSet)blocked=true;type ||= t;writes++;}
            visit(op,(node,parent,slot)=>{
              if(node.kind!=='id'||key(node.name)!==key(decl.name)||write&&slot==='target'&&parent===op)return;
              reads.add(pc);
              const safe=parent?.op==='print'||parent?.op==='assert'||parent?.op==='branch'||parent?.op==='assign'&&slot==='expr'||parent?.kind==='binary'&&['=','<>','<','>','<=','>=','&'].includes(parent.op);
              if(!safe)blocked=true;
              if(parent?.kind==='binary'&&parent.op!=='&'){const other=parent.left===node?parent.right:parent.left;if(!['string','boolean'].includes(type)||key(context.type(other))!==type)blocked=true;}
            });
          }
          const assigned=definitely(proc.code,false,(op,input)=>input||op.op==='assign'&&op.target.kind==='id'&&key(op.target.name)===key(decl.name));
          if(writes&&!blocked&&[...reads].every(pc=>!assigned.reachable.has(pc)||assigned.incoming[pc])){
            specialized.set(identity(module,proc,decl.name),type);
            decisions.push({source:module.name,procedure:proc.name,symbol:decl.name,kind:'variant',representation:type,reason:'Homogeneous writes dominate nonescaping, non-introspective uses'});
          }
        }
      }
    }
  }
  const startupForm=enabled&&state.entry?.kind==='form'&&[...state.compiled.modules.values()].filter(m=>m.form).length===1&&!opaque;
  let directForm=!!startupForm;
  if(directForm)for(const module of state.compiled.modules.values())for(const proc of module.procedures.values())visit(proc.code,node=>{
    if(node.kind==='id'&&key(node.name)===key(state.entry.module))directForm=false;
  });
  if(directForm){const module=state.compiled.modules.get(key(state.entry.module));if(module.form?.type==='MDIForm'||module.form?.properties?.MDIChild)directForm=false;}
  return {
    decisions,directForm,
    array(symbol,context){if(!symbol||symbol.owner&&symbol.owner!==context.module)return null;return arrays.get(identity(context.module,symbol.local||symbol.parameter?context.proc:null,symbol.name))||null;},
    localArray(module,proc,name){return arrays.get(identity(module,proc,name))||null;},
    scalarType(module,proc,name){return specialized.get(identity(module,proc,name));},
    record(module,type){return recordTraits(state.compiled,module,type,records);}
  };
}

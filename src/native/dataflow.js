/** Typed must-constant propagation for unaliased scalar locals. No instruction,
 * label, checkpoint, call, overflow or eager operand is deleted. Forward joins
 * intersect facts; backedges and unknown effects are barriers. Complex flow
 * retains the basic-block fallback, without speculative loop assumptions. */
import {foldNativeInteger} from './optimizer.js';
import {nativeIntegerFits} from './integers.js';
const key=v=>String(v).toLowerCase();
const integral=new Set(['byte','integer','long','boolean']);
const flow=new Set(['branch','jump','computedJump','gosub','gosubReturn','return','end','forInit','forNext','eachInit','eachNext','case']);
function walk(node,visit){
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(const n of node)walk(n,visit);return;}
  if(node.kind)visit(node);
  for(const [name,value]of Object.entries(node))if(name!=='kind')walk(value,visit);
}
// Only simple, explicit successor sets participate in forward-join analysis.
// A future/backward predecessor contributes no facts; no fixpoint or unbounded
// iteration is needed, and loop-carried values can never become constants.
function predecessors(code) {
  const result=Array.from({length:code.length},()=>[]);
  for(let i=0;i<code.length;i++){
    const ins=code[i];
    if(flow.has(ins.op)&&!['branch','jump','return','end'].includes(ins.op))return null;
    if(ins.op==='branch'||ins.op==='jump'){
      if(!Number.isInteger(ins.target)||ins.target<0||ins.target>code.length)return null;
      if(ins.target<code.length)result[ins.target].push(i);
    }
    if(!['jump','return','end'].includes(ins.op)&&i+1<code.length)result[i+1].push(i);
  }
  return result;
}
function intersectFacts(pred,index,after) {
  if(index===0||!pred.length||pred.some(p=>p>=index))return new Map();
  const facts=new Map(after[pred[0]]);
  for(const p of pred.slice(1))for(const [name,value]of facts){
    const other=after[p].get(name);
    if(!other||value.value!==other.value||value.valueType!==other.valueType)facts.delete(name);
  }
  return facts;
}
export function propagateNativeConstants(code,locals,resolve=()=>null) {
  const stats={constantsPropagated:0};
  if(code.some(i=>['onError','resume','raiseError','gosub','gosubReturn','computedJump','withPush'].includes(i.op)))return {code,stats};
  const candidates=new Set([...locals].filter(([,v])=>integral.has(key(v.type))&&!v.parameter&&!v.label&&!v.nativeArray&&!v.nativeRecord).map(([name])=>key(name)));
  // Even an earlier ByRef call can retain a local address. Exclude every local
  // mentioned in an argument tree rather than guessing a callee's alias effects.
  for(const ins of code)walk(ins,node=>{
    if(node.kind==='call'||node.kind==='addressOf')walk(node.kind==='call'?node.args:node,n=>{if(n.kind==='id')candidates.delete(key(n.name));});
  });
  if(!candidates.size)return {code,stats};
  const leaders=new Set([0]);
  code.forEach((ins,i)=>{if(flow.has(ins.op)){leaders.add(i+1);if(Number.isInteger(ins.target))leaders.add(ins.target);for(const target of ins.targets||[])leaders.add(target);}});
  // Bound retained snapshots for very large procedures; the fallback keeps
  // only one basic block's map rather than quadratic instruction/local state.
  const incoming=code.length*candidates.size<=2000000?predecessors(code):null,after=[];
  let facts=new Map();
  const pure=node=>{
    if(!node)return false;
    if(node.kind==='literal')return foldNativeInteger(node)!==null;
    if(node.kind==='group')return pure(node.expr);
    if(node.kind==='unary')return ['+','-','not'].includes(key(node.op))&&pure(node.expr);
    if(node.kind==='binary')return ['+','-','*','\\','mod','and','or','xor','eqv','imp','=','<>','<','<=','>','>='].includes(key(node.op))&&pure(node.left)&&pure(node.right);
    if(node.kind==='id'){
      const local=locals.get(key(node.name));
      if(local)return integral.has(key(local.type))&&!local.nativeArray&&!local.nativeRecord;
    }
    const binding=resolve(node);return !!binding&&integral.has(binding.type);
  };
  const substitute=node=>{
    if(node.kind==='id'&&facts.has(key(node.name))){stats.constantsPropagated++;return {kind:'literal',...facts.get(key(node.name))};}
    if(node.kind==='group'||node.kind==='unary'){const expr=substitute(node.expr);return expr===node.expr?node:{...node,expr};}
    if(node.kind==='binary'){const left=substitute(node.left),right=substitute(node.right);return left===node.left&&right===node.right?node:{...node,left,right};}
    return node;
  };
  const result=code.map((ins,index)=>{
    if(incoming)facts=intersectFacts(incoming[index],index,after);
    else if(leaders.has(index))facts.clear();
    // Subsequent instructions always copy facts, never mutate this snapshot.
    if(incoming)after[index]=facts;
    if(ins.op==='lineNumber')return ins;
    if(ins.op==='assign'&&!ins.objectSet&&ins.target.kind==='id'&&pure(ins.expr)){
      const expr=substitute(ins.expr),name=key(ins.target.name),value=foldNativeInteger(expr,resolve);
      const type=key(locals.get(name)?.type),stored=type==='boolean'&&value?(value.value?-1:0):value?.value;
      if(candidates.has(name)&&nativeIntegerFits(stored,type))facts.set(name,{value:stored,valueType:type});else facts.delete(name);
      // Noncandidate stores may touch aliased/managed/form/global storage.
      if(!candidates.has(name))facts.clear();
      return expr===ins.expr?ins:{...ins,expr};
    }
    if(ins.op==='branch'&&pure(ins.test)){
      const test=substitute(ins.test);if(!incoming)facts.clear();return test===ins.test?ins:{...ins,test};
    }
    if(incoming&&['jump','return','end'].includes(ins.op))return ins;
    facts.clear();return ins;
  });
  return {code:stats.constantsPropagated?result:code,stats};
}

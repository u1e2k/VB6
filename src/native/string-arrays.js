/** Counted UTF-16 String SAFEARRAY intrinsics. Every result has one explicit
 * owner; assignment commits only after the result is complete. No JS runtime. */
import {planNativeArguments} from './call-plan.js';
import {mem32} from './x86-operands.js';
const P='native:string-array:',key=v=>String(v).toLowerCase();
const specs=Object.freeze({
 split:[['expression','text'],['delimiter','text',' '],['limit','number',-1],['compare','compare','option']],
 join:[['sourcearray','array'],['delimiter','text',' ']],
 filter:[['sourcearray','array'],['match','text'],['include','boolean',-1],['compare','compare','option']]
});
export function nativeStringArrayName(c,node){
 while(node?.kind==='group')node=node.expr;
 if(node?.kind!=='call'||node.callee.kind!=='id')return null;
 const name=key(node.callee.name);
 return Object.hasOwn(specs,name)&&!c.resolveProcedure(node.callee)?name:null;
}
function mark(c,name){(c.nativeStringArraysUsed ||= new Set()).add(name);}
function expression(c,node){
 while(node.kind==='group')node=node.expr;
 const name=nativeStringArrayName(c,node);
 if(name==='split'||name==='filter')return call(c,node,name);
 const source=c.variable(node);
 if(!source?.nativeArray||source.elementOf||key(source.type)!=='string')c.fail('Native string-array intrinsic requires a String array');
 mark(c,'snapshot');c.arrayRef(source);c.x.push().call(P+'snapshot');
 return c.ownNativePointer(P+'release');
}
function call(c,node,name){
 const fields=specs[name],plan=planNativeArguments({name,params:fields.map(f=>({name:f[0],optional:f.length===3}))},node.args,m=>c.fail(m));
 const slots=new Array(fields.length),x=c.x;mark(c,name);
 for(const entry of plan.order){
  const field=fields[entry.index],value=entry.omitted?{kind:'literal',value:field[2]==='option'?c.nativeCompareMode():field[2]}:entry.node;
  if(field[1]==='array')expression(c,value);
  else if(field[1]==='text')c.textExpression(value);
  else if(field[1]==='boolean')c.truth(value);
  else{c.numeric(value);if(field[1]==='compare'){const ready=x.unique();x.compare(-1).branch('ne',ready).value(c.nativeCompareMode()).label(ready).compare(0).branch('l','error:5').compare(1).branch('g','error:5');}}
  const slot=c.arrayWorkspace(4,'string-array-argument');x.push();c.rawStorageAddress(slot);x.popOperand('ecx').mov(mem32({base:'eax'}),'ecx');slots[entry.index]=slot;
 }
 for(const slot of slots.reverse()){c.rawStorageAddress(slot);x.pushOperand(mem32({base:'eax'}));}
 x.call(P+name);
 if(name==='join'){c.ownString();return null;}
 return c.ownNativePointer(P+'release');
}
export function assignNativeStringArray(c,variable,node){
 const name=nativeStringArrayName(c,node);
 if(name!=='split'&&name!=='filter')return false;
 if(!variable.nativeDynamic||key(variable.type)!=='string'||variable.fixedLength)c.fail('Split/Filter assignment requires a dynamic variable-length String array');
 const owner=expression(c,node);mark(c,'publish');
 c.rawStorageAddress(owner);c.x.push();c.rawStorageAddress(variable);c.x.push().call(P+'publish');return true;
}
export function nativeStringArrayType(c,node){
 if(nativeStringArrayName(c,node)==='join')return 'string';
 if(node.kind==='call'&&['split','filter'].includes(nativeStringArrayName(c,node.callee)))return 'string';
 return null;
}
export function nativeStringArrayBuiltin(c,node,name){
 if(nativeStringArrayName(c,node)==='join'){call(c,node,'join');return true;}
 const element=node.kind==='call'&&['split','filter'].includes(nativeStringArrayName(c,node.callee));
 const bound=['lbound','ubound'].includes(name)&&!c.resolveProcedure(node.callee)&&['split','filter'].includes(nativeStringArrayName(c,node.args[0]));
 if(!element&&!bound)return false;
 if(element&&node.args.length!==1||bound&&(node.args.length<1||node.args.length>2))c.fail('Native String array access expects one index or optional dimension');
 expression(c,element?node.callee:node.args[0]);c.x.push();
 c.numeric(element?node.args[0]:node.args[1]||{kind:'literal',value:1});
 c.x.popOperand('ebx').push().pushOperand('ebx').call(P+(element?'element':name));mark(c,element?'element':name);
 if(element)c.ownString();return true;
}

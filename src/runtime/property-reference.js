import {Ref,MISSING,unbox} from './values.js';
import {VBError} from '../language/errors.js';

/** Resolve an authored property write using assignment kind, before evaluating
 * a getter. The receiver and index expressions are captured once. Interface
 * argument names bind to the public signature, never the implementation names.
 * Unknown host/COM objects are deliberately left to their own dispatch adapter. */
export async function propertyReference(vm,object,name,nodes,frame,objectSet=false) {
  const key=String(name).toLowerCase(),instance=object?.__vbInterface?object.target:object;
  if(!instance?.__vbInstance||instance.fields.has(key))return null;
  const members=object.__vbInterface?instance.module.interfaceBindings[object.interfaceName]?.members:null;
  const find=accessor=>{
    if(members){const item=members[key+':'+accessor];return item?{proc:instance.module.procedures.get(item.procedure),signature:item.signature}:null;}
    const proc=instance.module.procedures.get(key+':'+accessor);return proc?{proc,signature:proc}:null;
  };
  const getter=find('get'),setter=find(objectSet?'set':'let');
  if(!getter&&!setter&&!find(objectSet?'let':'set'))return null;
  // Subscripts of an array-valued parameterless Get operate on its result,
  // not on a fictitious index parameter of the property itself.
  if(nodes.length&&getter?.signature.returnArray&&!getter.signature.params.length)return null;
  if(!setter)throw new VBError('Property is read-only for '+(objectSet?'Set':'Let')+' assignment: '+name,383);
  if(!members&&setter.proc.scope==='private'&&instance.module!==frame?.module)throw new VBError('Property assignment is not accessible',438);
  const parameters=setter.signature.params.slice(0,-1),actual=Array(parameters.length).fill(MISSING);
  for(const {index,node} of vm.argumentSlots(nodes,parameters)){
    if(node.kind==='missing')continue;
    if(node.kind==='byval')throw new VBError('ByVal override is valid only for Declare calls',49);
    actual[index]=parameters[index].byRef?await vm.sourceArgument(node,frame):await vm.evaluateScalar(node,frame);
  }
  for(let i=0;i<parameters.length;i++)if(actual[i]===MISSING&&!parameters[i].optional)throw new VBError('Argument not optional: '+parameters[i].name,449);
  const read=()=>{
    if(!getter)throw new VBError('Property is write-only: '+name,394);
    if(!members&&getter.proc.scope==='private'&&instance.module!==frame?.module)throw new VBError('Property get is not accessible',438);
    return vm.callProcedure(instance,getter.proc,actual,frame,true);
  };
  const value=setter.proc.params.at(-1),ref=new Ref(async()=>unbox(await read()),v=>vm.callProcedure(instance,setter.proc,[...actual,v],frame),value.storageType||value.type,null,read);
  ref.isProperty=true;ref.isArray=value.bounds!==null;ref.elementType=value.storageType||value.type;
  return ref;
}

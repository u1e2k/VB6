import {VBArray,NOTHING,Cell,cloneValue,defaultValue,makeRecord} from './values.js';
import {VBError} from '../language/errors.js';
const lower=value=>String(value).toLowerCase();

export async function createRuntimeArray(vm,bounds,type,frame,fixedLength=null,depth=0) {
  const definition=vm.recordDefinition(type,frame.module);
  const record=definition?await createRuntimeRecord(vm,type,frame,depth+1):null;
  const object=vm.program.modules.get(lower(type))?.kind==='class'||vm.program.modules.get(lower(type))?.form||vm.data?.isObjectType(type)||['collection','dictionary','scripting.dictionary'].includes(lower(type));
  const array=new VBArray(bounds,type,record?()=>cloneValue(record):object?()=>NOTHING:null,fixedLength);
  if(definition)array.elementIdentity=definition.identity;
  return array;
}
export async function createRuntimeRecord(vm,name,frame,depth=0) {
  if(depth>32)throw new VBError('Recursive user-defined type',1002);
  const definition=vm.recordDefinition(name,frame.module);
  if(!definition)throw new VBError('User-defined type not defined: '+name,1002);
  // Array bounds/constants and nested unqualified record names are defined in
  // the record's module, not the procedure which happens to create a value.
  const context={...frame,module:definition.owner},fields=new Map();
  for(const member of definition.fields){
    const type=member.storageType||member.type;let value;
    if(member.bounds!==null){value=await createRuntimeArray(vm,await vm.evalBounds(member.bounds,context),type,context,member.fixedLength,depth+1);value.dynamic=!member.bounds.length;}
    else if(vm.recordDefinition(type,context.module))value=await createRuntimeRecord(vm,type,context,depth+1);
    else value=member.initial?await vm.evaluateScalar(member.initial,context):defaultValue(type);
    const cell=new Cell(member.bounds!==null?'Variant':type,value,false,member.fixedLength);
    cell.isArray=member.bounds!==null;cell.elementType=type;cell.elementIdentity=value?.elementIdentity;
    fields.set(member.name,cell);
  }
  return makeRecord(definition.name,fields,definition.identity);
}

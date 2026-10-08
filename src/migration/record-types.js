import {key} from './names.js';

/** Resolve records by explicit/local ownership, rejecting ambiguous project-wide
 * matches. The shared frontend retains field layouts, not type access modifiers. */
export function findRecord(compiled,module,type) {
  const parts=String(type||'').split('.'),name=key(parts.at(-1));
  const owner=parts.length>1?compiled.modules.get(key(parts.slice(0,-1).join('.'))):null;
  const lookup=target=>{
    if(!target)return null;
    const spelling=Object.keys(target.types).find(candidate=>key(candidate)===name);
    return spelling?{name:spelling,owner:target,fields:target.types[spelling],id:key(target.name)+'.'+name}:null;
  };
  if(owner)return lookup(owner);
  const local=lookup(module);if(local)return local;
  const matches=[...compiled.modules.values()].filter(candidate=>candidate!==module).map(lookup).filter(Boolean);
  return matches.length===1?matches[0]:null;
}

export function recordTraits(compiled,module,type,cache=new Map(),visiting=new Set()) {
  const record=findRecord(compiled,module,type);if(!record)return null;
  if(cache.has(record.id))return cache.get(record.id);
  if(visiting.has(record.id))return {...record,initialize:true,copy:true,recursive:true};
  visiting.add(record.id);
  let initialize=false,copy=false,recursive=false;
  for(const field of record.fields){
    const nested=recordTraits(compiled,record.owner,field.type,cache,visiting);
    initialize ||= field.bounds!=null||['string','date'].includes(key(field.type))||!!field.fixedLength||!!field.autoNew||!!nested?.initialize;
    copy ||= field.bounds!=null||key(field.type)==='variant'||!!nested?.copy;
    recursive ||= !!nested?.recursive;
  }
  visiting.delete(record.id);
  const result={...record,initialize,copy,recursive};cache.set(record.id,result);return result;
}

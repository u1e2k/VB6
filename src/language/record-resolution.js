const lower=value=>String(value).toLowerCase();
/** Resolve a nominal record declaration, never the first unrelated same-name
 * type. Private records belong only to their module. No runtime state is read. */
export function resolveRecordDefinition(modules,name,from) {
  const key=lower(name),dot=key.indexOf('.');
  const lookup=(owner,local)=>{
    if(!owner)return null;
    const name=Object.keys(owner.types||{}).find(n=>lower(n)===local);
    if(!name||owner!==from&&owner.typeScopes?.[local]==='private')return null;
    return {owner,name,fields:owner.types[name],identity:lower(owner.name)+'.'+local};
  };
  if(dot>=0)return lookup(modules.get(key.slice(0,dot)),key.slice(dot+1));
  const own=lookup(from,key);if(own)return own;
  let result=null;
  for(const candidate of modules.values()){
    if(candidate===from)continue;
    const match=lookup(candidate,key);if(!match)continue;
    if(result)return null;
    result=match;
  }
  return result;
}

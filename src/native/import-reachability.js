/** Remove only imports not referenced by retained symbolic relocations. Run
 * after procedure pruning and before constructing the import tables. Raw
 * machine code that computes IAT offsets must not opt into import pruning.
 */
export function pruneNativeImports(imports,sections) {
  const byLabel=new Map([...imports].map(([key,item])=>[item.label,key])),used=new Set();
  let tableAddressed=false;
  for(const section of sections)for(const fixup of section.fixups){
    const key=byLabel.get(fixup.label);
    if(key!==undefined){used.add(key);if(fixup.addend!==0)tableAddressed=true;}
    // Table/descriptor/hint addresses make layout observable, not just calls.
    else if(/^(?:imports$|iat-start$|iat:|ilt:|dll:|hint:iat:)/.test(fixup.label))tableAddressed=true;
  }
  const removedImports=[];
  if(!tableAddressed)for(const [key]of imports)if(!used.has(key)){imports.delete(key);removedImports.push(key);}
  return {unusedImportsRemoved:removedImports.length,removedImports,retainedImports:imports.size,importTableAddressed:tableAddressed};
}

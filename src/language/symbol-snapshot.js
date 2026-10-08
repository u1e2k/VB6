import {referenceSnapshot,normalizeTypeLibrary} from './reference-metadata.js';

/** Compiler inputs contain declaration identities, never control assets, data
 * connection strings, credentials, live adapters, or reflected host objects. */
export function moduleSymbolSnapshot(module) {
  if(module.symbolBindings)return module.symbolBindings;
  if(!module.form&&module.kind!=='form')return null;
  const items=(module.form?.controls||[]).map(c=>({name:c.name,type:c.type,array:c.properties?.Index!==undefined}));
  const menus=nodes=>{for(const n of nodes||[]){items.push({name:n.name,type:'Menu',array:n.properties?.Index!==undefined});menus(n.children||n.items);}};
  menus(module.form?.menus);
  const type=module.form?.type||'Form',globals=[];
  if(type==='UserControl')for(const name of ['UserControl','Ambient','Extender','Parent','Controls'])globals.push({name,type:'Object'});
  if(type==='PropertyPage')globals.push({name:'PropertyPage',type:'Object'},{name:'Changed',type:'Boolean'},{name:'SelectedControls',type:'Object'},{name:'Controls',type:'Object'});
  return {name:module.name,type,items,globals};
}
const references=new Map();
export function projectSymbolSnapshot(project={}) {
  if(project.symbolMetadata)return project.symbolMetadata;
  const snapshot=referenceSnapshot(project);let types=references.get(snapshot.key);
  if(!types){
    types=[];
    for(const library of snapshot.descriptors)try{
      for(const t of normalizeTypeLibrary(library.name,library.types))types.push({name:t.name,kind:t.kind,target:t.target,aliases:t.aliases,defaultMember:t.defaultMember,creatable:t.creatable,members:t.members.map(m=>({name:m.name,kind:m.kind,type:m.type,params:m.params,accessor:m.accessor,array:m.array,rank:m.rank,readOnly:m.readOnly,readonly:m.readonly,value:m.value}))});
    }catch{/* Invalid descriptors never become executable type information. */}
    if(references.size>=8)references.delete(references.keys().next().value);
    references.set(snapshot.key,types);
  }
  const data=project.dataSources||{},dataMembers=[];
  for(const c of data.connections||[])if(c.name)dataMembers.push({name:String(c.name),kind:'property',type:'ADODB.Connection'});
  for(const c of data.commands||[])if(c.name){dataMembers.push({name:'rs'+c.name,kind:'property',type:'ADODB.Recordset'});dataMembers.push({name:String(c.name),kind:'method',type:'ADODB.Recordset',params:(c.parameters||[]).map(p=>'Optional '+p.name+' As Variant')});}
  return {types,dataMembers,globals:externalSymbolSnapshot(project.externalSymbols)};
}

/** Explicit host/compiler extension declarations, not executable host values.
 * Reading data descriptors avoids invoking getters supplied in an API object. */
export function externalSymbolSnapshot(input) {
  if(!Array.isArray(input))return [];
  const result=[];
  for(let i=0;i<input.length&&i<10000;i++){
    const entry=Object.getOwnPropertyDescriptor(input,String(i))?.value;
    if(!entry||typeof entry!=='object')continue;
    const fields=Object.getOwnPropertyDescriptors(entry),name=fields.name?.value;
    if(typeof name!=='string'||name.length>255)continue;
    const symbol={name};
    for(const key of ['type','kind'])if(typeof fields[key]?.value==='string')symbol[key]=fields[key].value;
    for(const key of ['array','readOnly'])if(typeof fields[key]?.value==='boolean')symbol[key]=fields[key].value;
    if(Array.isArray(fields.params?.value)){
      symbol.params=[];const params=fields.params.value;
      for(let n=0;n<params.length&&n<256;n++){const text=Object.getOwnPropertyDescriptor(params,String(n))?.value;if(typeof text==='string')symbol.params.push(text);}
    }
    result.push(symbol);
  }
  return result;
}

/** Shared authoring/build contract. No parser, schema or IDE dependency. */
export const xamlEnabled = project => project?.settings?.xaml === true;
/** Canonical JSON, not a hash: stale-write acceptance must not depend on collisions. */
export function formStamp(form) {
  const sort=(value,depth=0)=>{
    if(depth>128)throw new RangeError('Form metadata is too deeply nested.');
    if(Array.isArray(value))return value.map(v=>sort(v,depth+1));
    if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k],depth+1)]));
    return value;
  };
  return JSON.stringify(sort(form));
}
export function xamlBuildDiagnostics(project) {
  if(!xamlEnabled(project))return [];
  const errors=[];
  for(const module of project.modules??[]) {
    if(!module.form||module.xaml===undefined)continue;
    const state=module.xaml;let message;
    if(state?.version!==1||typeof state.text!=='string'||typeof state.appliedText!=='string')message='Invalid XAML authoring state.';
    else if(state.conflict)message='Resolve the XAML/designer conflict before building.';
    else if(state.text!==state.appliedText)message='Fix or discard the pending XAML draft before building.';
    else {try{if(state.base!==formStamp(module.form))message='The form changed outside XAML synchronization. Open XAML and choose Use Designer or Apply Draft.';}catch(error){message=error.message;}}
    if(message)errors.push({severity:'error',code:'VBXAML2201',number:1002,source:module.name,line:1,column:1,message});
  }
  return errors;
}

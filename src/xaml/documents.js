import {formStamp} from './contract.js';
import {formToXaml,compileFormXaml,synchronizeFormXaml,xamlEnabled} from './forms.js';
import {normalizeProject} from '../project/model.js';
import {renameSymbol} from '../editor/language-service.js';

const clone = value => structuredClone(value);
const moduleFor = (project,id) => { const module=project.modules.find(m=>m.id===id);if(!module?.form)throw new Error('The XAML form module no longer exists.');return module; };
export {formStamp};
export function readXamlDocument(module,options={}) {
  if(!module?.form)throw new TypeError('XAML authoring requires a form module.');
  const state=module.xaml;
  if(!state)return {version:1,revision:0,text:formToXaml(module.form,options),appliedText:null,base:formStamp(module.form),conflict:false};
  if(state.version!==1||typeof state.text!=='string'||state.text.length>2_000_000||!Number.isSafeInteger(state.revision)||state.revision<0||typeof state.base!=='string'||state.appliedText!==null&&typeof state.appliedText!=='string')throw new TypeError('Invalid or unsupported XAML authoring document.');
  return clone(state);
}
function renameChanges(before,after) {
  const oldNodes=[before,...before.controls??[],...before.menus??[]], next=new Map([after,...after.controls??[],...after.menus??[]].map(n=>[n.id,n]));
  const groups=new Map();
  for(const old of oldNodes) {
    const changed=next.get(old.id);if(!changed)continue;
    const key=old.name.toLowerCase(),g=groups.get(key)??{old:old.name,names:new Set()};g.names.add(changed.name);groups.set(key,g);
  }
  const result=[];
  for(const g of groups.values()) {
    if(g.names.size!==1)throw new Error('Rename every member of a control array together; its VB6 event method is shared.');
    const name=[...g.names][0];if(name!==g.old)result.push([g.old,name]);
  }
  return result;
}
function renameCode(project,changes) {
  // Same lexer-aware rename path as the Properties grid. Temporary identifiers
  // preserve simultaneous A<->B swaps; strings/comments remain byte-identical.
  const used=project.modules.map(m=>m.code).join('\n');
  const temporaries=changes.map((pair,index)=>{let name='__XamlRename_'+index;while(new RegExp('\\b'+name+'\\b','i').test(used))name+='_';return name;});
  for(const module of project.modules) {
    for(let i=0;i<changes.length;i++)module.code=renameSymbol(module.code,changes[i][0],temporaries[i]);
    for(let i=0;i<changes.length;i++)module.code=renameSymbol(module.code,temporaries[i],changes[i][1]);
  }
}

/** Build a proposal without changing live state. The caller owns the history
 * transaction and must recheck project identity/revision before committing it. */
export function prepareXamlEdit(project,moduleId,text,{expectedRevision,resolveConflict=false,schema}={}) {
  if(!xamlEnabled(project))throw new Error('XAML authoring is disabled for this project.');
  if(typeof text!=='string'||text.length>2_000_000)throw new RangeError('XAML source exceeds the document limit.');
  const original=moduleFor(project,moduleId),state=readXamlDocument(original,{schema});
  if(expectedRevision!==undefined&&expectedRevision!==state.revision)throw new Error('The XAML source changed before this edit could be applied.');
  const next=clone(project),module=moduleFor(next,moduleId),changedBase=state.base!==formStamp(original.form);
  const nextState={...state,revision:state.revision+1,text,appliedText:state.appliedText??state.text,conflict:state.conflict||changedBase};
  module.xaml=nextState;
  const result=compileFormXaml(text,{form:original.form,settings:project.settings,schema,uri:module.name+'.xaml'});
  if(nextState.conflict&&!resolveConflict) return {project:next,module,result,applied:false,conflict:true};
  if(!result.success)return {project:next,module,result,applied:false,conflict:nextState.conflict};
  try {
    const changes=renameChanges(original.form,result.form);
    module.form=result.form;module.name=result.form.name;
    if(next.startup?.toLowerCase()===original.name.toLowerCase())next.startup=module.name;
    renameCode(next,changes);
    // Validate the whole renamed project before publishing any part of it.
    normalizeProject(next);
    Object.assign(nextState,{appliedText:text,base:formStamp(module.form),conflict:false});
    return {project:next,module,result,applied:true,conflict:false};
  } catch(error) {
    module.form=clone(original.form);module.name=original.name;next.startup=project.startup;
    for(let i=0;i<next.modules.length;i++)next.modules[i].code=project.modules[i].code;
    result.success=false;result.form=null;
    result.diagnostics.push({code:'VBXAML2101',message:error.message,severity:'error',start:0,end:0,range:{start:{line:0,character:0},end:{line:0,character:0}},line:1,column:1});
    return {project:next,module,result,applied:false,conflict:nextState.conflict};
  }
}

/** Called inside the existing designer/property-grid transaction, before history
 * captures its after snapshot. Never overwrites an invalid/conflicting draft. */
export function synchronizeXamlProject(before,after,{schema}={}) {
  if(!xamlEnabled(after))return;
  for(const module of after.modules) {
    if(!module.form||!module.xaml)continue;
    const old=before.modules.find(m=>m.id===module.id),stamp=formStamp(module.form),state=readXamlDocument(module,{schema});
    if(state.base===stamp)continue;
    const baseline=old?.form??module.form,hadDraft=state.conflict||state.text!==(state.appliedText??state.text);
    const source=state.appliedText??state.text;
    const sync=synchronizeFormXaml(source,baseline,module.form,{schema});
    const next={...state,revision:state.revision+1,base:stamp,appliedText:sync.text,conflict:hadDraft};
    if(hadDraft)next.text=state.text;
    else {next.text=sync.text;if(sync.regenerated&&sync.previousText!==sync.text)next.previousText=sync.previousText;}
    module.xaml=next;
  }
}

/** Explicit recovery command: keep the prior draft as a recoverable backup. */
export function useDesignerXaml(project,moduleId,{schema}={}) {
  if(!xamlEnabled(project))throw new Error('XAML authoring is disabled.');
  const next=clone(project),module=moduleFor(next,moduleId),state=readXamlDocument(module,{schema}),text=formToXaml(module.form,{schema});
  module.xaml={version:1,revision:state.revision+1,text,appliedText:text,base:formStamp(module.form),conflict:false,previousText:state.text};
  return next;
}

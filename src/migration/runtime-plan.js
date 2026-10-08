import {compactIdentifiers} from './vb-tokens.js';
import {RUNTIME_CATALOG,runtimeFeature,runtimeClosure} from './runtime-catalog.js';
import {RUNTIME_FILES,RUNTIME_FEATURES} from './runtime-sources.js';
import {diagnostic} from './contracts.js';

/** Emission decisions, not identifier-looking application text, are linker roots. */
export function createRuntimePlan(options,diagnostics) {
  const roots=new Map();
  function requireFeature(symbol,location={},reason='Required by emitted compatibility operation') {
    const feature=runtimeFeature(symbol),key=[feature,location.generatedFile||'',location.source||'',location.line||1,reason].join('|');
    if(!roots.has(key))roots.set(key,{feature,symbol,reason,source:location.source||'',line:location.line||1,generatedFile:location.generatedFile||''});
    return symbol;
  }
  function opaque(location,plugin){
    for(const feature of Object.keys(RUNTIME_CATALOG))if(!RUNTIME_CATALOG[feature].windows||location.target==='winforms')requireFeature(feature,location,'Opaque code hook: '+plugin);
  }
  function imports(file){
    const features=runtimeClosure([...roots.values()].filter(root=>root.generatedFile===file).map(root=>root.feature));
    return [...new Set(features.map(feature=>RUNTIME_FEATURES[feature].namespace))].sort();
  }
  function materialize(target,put){
    const features=runtimeClosure([...roots.values()].map(root=>root.feature));
    const windows=features.some(feature=>RUNTIME_FEATURES[feature].windows),core=features.some(feature=>!RUNTIME_FEATURES[feature].windows)||options.runtime==='project'&&windows;
    if(windows&&target!=='winforms')diagnostics.push(diagnostic('MIG_RUNTIME_PLATFORM','Selected compatibility support requires a Windows Forms target.'));
    const paths=[];
    const add=(path,source)=>{put(path,source);paths.push(path);};
    if(options.runtime==='none'&&features.length){
      for(const feature of [...new Set([...roots.values()].map(root=>root.feature))].sort()){
        const root=[...roots.values()].find(root=>root.feature===feature);
        diagnostics.push(diagnostic('MIG_RUNTIME_REQUIRED','Runtime-free output requires replacing '+feature+'. '+root.reason,root,'error',{feature}));
      }
    }else if(options.runtime==='minimal'){
      for(const feature of features)add('Application/Compatibility/'+feature+'.vb',RUNTIME_FEATURES[feature].source);
      if(features.length)add('Application/Compatibility/LICENSE',RUNTIME_FILES['VB6.Compatibility/LICENSE']);
    }else if(options.runtime==='project'){
      // Compatibility mode deliberately retains the previous full source-project contract.
      for(const [path,source] of Object.entries(RUNTIME_FILES))if(!path.startsWith('VB6.Compatibility.Windows/')?core||options.codeStyle==='compatibility':windows||options.codeStyle==='compatibility'&&target==='winforms')add(path,source);
    }else if(options.runtime==='package'&&features.length){
      if(core&&!options.runtimePackage)throw new TypeError('runtimePackage is required for shared package output');
      if(windows&&!options.windowsRuntimePackage)throw new TypeError('windowsRuntimePackage is required for Windows shared package output');
      diagnostics.push(diagnostic('MIG_RUNTIME_PACKAGE','Restore uses the explicitly configured external compatibility package(s); this converter does not publish or verify package availability.',{},'warning'));
    }
    return {policy:options.runtime,packages:options.runtime==='package'?[core?options.runtimePackage:null,windows?options.windowsRuntimePackage:null].filter(Boolean):[],features,requirements:[...roots.values()],sourceFiles:paths.filter(p=>p.endsWith('.vb')).length,
      sourceBytes:paths.filter(p=>p.endsWith('.vb')).reduce((size,path)=>size+new TextEncoder().encode(path.startsWith('Application/')?RUNTIME_FEATURES[path.slice('Application/Compatibility/'.length,-3)].source:RUNTIME_FILES[path]).length,0),
      core:core||options.runtime==='project'&&options.codeStyle==='compatibility',
      windows:windows||options.runtime==='project'&&options.codeStyle==='compatibility'&&target==='winforms'};
  }
  return {require:requireFeature,opaque,imports,materialize};
}

export function finishRuntimeImports(writer,context) {
  const wanted=context.options.codeStyle==='compatibility'&&context.options.runtime==='project'?['VB6.Compatibility',...(context.target==='winforms'?['VB6.Compatibility.Windows']:[])]:context.runtimePlan.imports(context.generatedFile);
  // Reserved import slots keep all source-map line numbers stable.
  for(let i=0;i<2;i++)writer.lines[writer.runtimeImportStart+i]=wanted[i]?'Imports '+wanted[i]:'';
  if(context.options.codeStyle==='native'){
    const lines=[],mapping=new Map();
    for(const [index,line] of writer.lines.entries()){
      if(!line&&!lines.at(-1))continue;
      lines.push(line);mapping.set(index+1,lines.length);
    }
    return {code:lines.map(compactIdentifiers).join('\n')+'\n',mappings:writer.mappings.filter(item=>mapping.has(item.generatedLine)).map(item=>({...item,generatedLine:mapping.get(item.generatedLine)}))};
  }
  return {code:writer.toString(),mappings:writer.mappings};
}

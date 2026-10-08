import {RUNTIME_CATALOG} from '../src/migration/runtime-catalog.js';

/** Compose independently linkable support from the same authored, compiler-tested
 * sources as the shared projects. Exact declaration/indent contracts fail closed. */
export function buildRuntimeFeatures(files) {
  const features={};
  for(const [name,spec] of Object.entries(RUNTIME_CATALOG)){
    const [owner,member]=name.split('.');
    const project=spec.windows?'VB6.Compatibility.Windows':'VB6.Compatibility';
    const file=spec.file||(owner+'.vb'),source=files[project+'/src/'+file];
    if(!source)throw new Error('Missing runtime source '+file);
    const lines=source.split('\n'),header=lines.slice(0,lines.findIndex(line=>/^Namespace /.test(line))).join('\n');
    let body;
    if(member){
      const pattern=new RegExp('^        (?:Public|Private|Friend) (?:Function|Sub) \\['+member+'\\]|^        (?:Public|Private|Friend) (?:Function|Sub) '+member+'(?:\\(|\\s|$)');
      const start=lines.findIndex(line=>pattern.test(line));
      const end=lines.findIndex((line,index)=>index>start&&/^        End (Function|Sub)$/.test(line));
      if(start<0||end<0)throw new Error('Runtime member extraction failed: '+name);
      body='    Partial Public Module '+owner+'\n'+(spec.fields||[]).map(field=>'        '+field+'\n').join('')+lines.slice(start,end+1).join('\n')+'\n    End Module';
    }else if(spec.type){
      const pattern=new RegExp('^    Public (?:NotInheritable )?'+spec.type+' '+owner+'(?:\\(|\\s|$)');
      const start=lines.findIndex(line=>pattern.test(line));
      const end=lines.findIndex((line,index)=>index>start&&line==='    End '+spec.type);
      if(start<0||end<0)throw new Error('Runtime type extraction failed: '+name);
      body=lines.slice(start,end+1).join('\n');
    }else{
      body=lines.slice(lines.findIndex(line=>/^Namespace /.test(line))+1,lines.lastIndexOf('End Namespace')).join('\n');
    }
    features[name]={namespace:project,windows:!!spec.windows,dependencies:spec.dependencies,
      source:header+'Namespace Global.'+project+'\n'+body+'\nEnd Namespace\n'};
  }
  return features;
}

import {download, safeName, el} from '../core/core.js';
import {modal} from './ui.js';
import {createVbNetMigrator, convertVbNetProject, exportVbNetProject, migrationZip} from '../migration/index.js';

/** Explicit local export, not a remote agent command. The converter is also
 * exposed independently through StudioAPI for tests and trusted integrations. */
export function installVbNetExport(ide,api) {
  if(ide.vbNetExportInstalled)return;
  ide.vbNetExportInstalled=true;
  Object.assign(api,{createVbNetMigrator,convertVbNetProject,exportVbNetProject});
  const menu=ide.menu.bind(ide),command=ide.command.bind(ide);
  ide.menu=name=>{
    const items=menu(name);
    if(name==='File'){
      const index=items.findIndex(item=>item?.id==='exportSources');
      items.splice(index<0?items.length:index+1,0,{id:'exportVbNet',label:'Migrate to VB.NET (.NET 10 ZIP)…',icon:'export',enabled:ide.runState==='design'});
    }
    return items;
  };
  ide.command=async(id,...args)=>{
    if(id!=='exportVbNet')return command(id,...args);
    if(ide.runState!=='design'){ide.status('Stop execution before migrating the project.');return;}
    try{
      const target=el('select',{'aria-label':'Migration target'},...['auto','winforms','console','library'].map(value=>el('option',{value},value)));
      const platform=el('select',{'aria-label':'Migration platform'},...['x86','AnyCPU','x64','arm64'].map(value=>el('option',{value},value)));
      const select=(name,choices)=>el('select',{'aria-label':name},...choices.map(value=>el('option',{value},value)));
      const style=select('Migration code style',['native','compatibility']);
      const runtime=select('Migration runtime',['minimal','none','project','package']);
      let runtimeChanged=false;
      runtime.addEventListener('change',()=>{runtimeChanged=true;});
      style.addEventListener('change',()=>{if(!runtimeChanged)runtime.value=style.value==='native'?'minimal':'project';});
      const modernize=el('input',{type:'checkbox','aria-label':'Approve Currency to Decimal'});
      const coreId=el('input',{'aria-label':'Core runtime package ID',placeholder:'Package ID'}),coreVersion=el('input',{'aria-label':'Core runtime package version',placeholder:'0.2.0'});
      const windowsId=el('input',{'aria-label':'Windows runtime package ID',placeholder:'Package ID'}),windowsVersion=el('input',{'aria-label':'Windows runtime package version',placeholder:'0.2.0'});
      const packages=el('details',{},el('summary',{},'Shared package references (package policy only)'),
        el('p',{},'Use explicitly verified packages. This export does not publish packages or verify registry availability.'),
        el('label',{},'Core ',coreId,coreVersion),el('label',{},'Windows ',windowsId,windowsVersion));
      const strict=el('input',{type:'checkbox'}),originals=el('input',{type:'checkbox',checked:true});
      const result=await modal('Migrate to VB.NET — .NET 10',{width:620,content:el('div',{},
        el('p',{},'Creates native-first editable VB.NET and includes compatibility support only where needed. WinForms output runs on Windows.'),
        el('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}},
          el('label',{},'Target ',target),el('label',{},'Platform ',platform),el('label',{},'Code style ',style),el('label',{},'Support ',runtime)),
        el('p',{},el('label',{},modernize,' Approve Currency → Decimal (changes rounding, range, subtype and binary representation)')),packages,el('p',{},el('label',{},strict,' Option Strict On')),el('p',{},el('label',{},originals,' Include original project, source, and resources'))),
        buttons:[{label:'Analyze migration',value:true,primary:true},{label:'Cancel',value:false}]});
      if(!result)return;
      const packageSpec=(id,version)=>id.value||version.value?{id:id.value.trim(),version:version.value.trim()}:undefined;
      const project=ide.project,revision=JSON.stringify(project),conversion=convertVbNetProject(project,{codeStyle:style.value,runtime:runtime.value,
        semanticPolicy:modernize.checked?'modernize':'preserve',acceptedRules:modernize.checked?['currency-decimal']:[],
        runtimePackage:packageSpec(coreId,coreVersion),windowsRuntimePackage:packageSpec(windowsId,windowsVersion),target:target.value,platform:platform.value,strict:strict.checked,includeOriginals:originals.checked});
      ide.lastVbNetMigration=conversion.report;
      const diagnostics=el('pre',{style:{maxHeight:'280px',overflow:'auto',whiteSpace:'pre-wrap'}},conversion.diagnostics.map(d=>`${d.severity.toUpperCase()} ${d.code} ${d.source||''}:${d.line||1} — ${d.message}`).join('\n')||'No blocking converter diagnostics. Compilation and application behavior still require validation.');
      const reports=conversion.report.projects||[conversion.report],support=reports.map(r=>r.runtime).filter(Boolean);
      const supportBytes=support.reduce((total,item)=>total+item.sourceBytes,0),supportFiles=support.reduce((total,item)=>total+item.sourceFiles,0);
      const details=el('details',{},el('summary',{},'Representation decisions and required support'),el('pre',{style:{maxHeight:'180px',overflow:'auto',whiteSpace:'pre-wrap'}},
        reports.flatMap(report=>[...(report.representations||[]).map(d=>`${d.source}.${d.symbol}: ${d.representation} — ${d.reason}`),...(report.runtime?.requirements||[]).map(d=>`${d.feature}: ${d.source}:${d.line} — ${d.reason}`)]).join('\n')||'No custom compatibility support is needed.'));
      const confirmed=await modal('VB.NET migration report',{width:780,content:el('div',{},
        el('p',{},`${conversion.report.errors} errors, ${conversion.report.warnings} warnings. ${Object.keys(conversion.files).length} files.`),
        el('p',{},`${style.value} output; ${runtime.value} support: ${supportFiles} VB files, ${supportBytes} source bytes.`),details,
        modernize.checked?el('p',{},'Currency → Decimal was explicitly approved. Review modernization entries in migration-report.json.'):null,
        conversion.success?el('p',{},'Download the converted source and review the included report before deployment.'):el('p',{},'This is an unresolved review bundle. The included MSBuild guard prevents compilation until the diagnostics are resolved.'),diagnostics),
        buttons:[{label:conversion.success?'Download .NET 10 ZIP':'Download unresolved review ZIP',value:true,primary:true},{label:'Cancel',value:false}]});
      if(!confirmed)return;
      if(ide.runState!=='design'||ide.project!==project||JSON.stringify(project)!==revision){ide.status('Project changed during migration review. Run migration again to export the current revision.');return;}
      const bytes=migrationZip(conversion.files);
      download(safeName(project.name)+'-net10'+(conversion.success?'':'-review')+'.zip',bytes,'application/zip');
      ide.status('Exported VB.NET .NET 10 '+(conversion.success?'project':'review bundle')+' — '+Math.round(bytes.length/1024)+' KB.');
      ide.emit('export',{kind:'vbnet-net10',report:conversion.report});
    }catch(error){ide.lastVbNetMigration={success:false,diagnostics:error.diagnostics||[{severity:'error',message:error.message}]};ide.status('VB.NET migration failed: '+error.message);}
  };
}

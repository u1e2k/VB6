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
      const strict=el('input',{type:'checkbox'}),originals=el('input',{type:'checkbox',checked:true});
      const result=await modal('Migrate to VB.NET — .NET 10',{width:620,content:el('div',{},
        el('p',{},'Creates editable VB.NET source, SDK projects, compatibility-runtime source, diagnostics, and a ZIP archive. WinForms output runs on Windows.'),
        el('label',{},'Target ',target),el('label',{},' Platform ',platform),el('p',{},el('label',{},strict,' Option Strict On')),el('p',{},el('label',{},originals,' Include original project, source, and resources'))),
        buttons:[{label:'Analyze migration',value:true,primary:true},{label:'Cancel',value:false}]});
      if(!result)return;
      const project=ide.project,revision=JSON.stringify(project),conversion=convertVbNetProject(project,{target:target.value,platform:platform.value,strict:strict.checked,includeOriginals:originals.checked});
      ide.lastVbNetMigration=conversion.report;
      const diagnostics=el('pre',{style:{maxHeight:'280px',overflow:'auto',whiteSpace:'pre-wrap'}},conversion.diagnostics.map(d=>`${d.severity.toUpperCase()} ${d.code} ${d.source||''}:${d.line||1} — ${d.message}`).join('\n')||'No blocking converter diagnostics. Compilation and application behavior still require validation.');
      const confirmed=await modal('VB.NET migration report',{width:780,content:el('div',{},
        el('p',{},`${conversion.report.errors} errors, ${conversion.report.warnings} warnings. ${Object.keys(conversion.files).length} files.`),
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

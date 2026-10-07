import {MIGRATION_VERSION, MIGRATION_SCHEMA, TARGET_FRAMEWORKS, MigrationError, MigrationRegistry, DiagnosticBag, migrationOptions, outputName, checkedPath, keyOf, xml, msbuild} from './contracts.js';
import {sharedFrontend} from './frontend.js';
import {readModule} from './reader.js';
import {symbolTables} from './types.js';
import {emitModule} from './modules.js';
import {emitDesigner} from './forms.js';
import {runtimeFiles} from './runtime.js';
import {migrationZip, fileBytes} from './zip.js';
import {normalizeProject} from '../../../src/project/model.js';
import {sourceFiles, importFiles, workspaceProjects} from '../../../src/project/formats.js';
import {validateWorkspace} from '../../../src/project/native-project.js';
import {hydrateResources} from '../../../src/project/frx.js';
import {readZip, crc32} from '../../../src/project/zip.js';

function stableModel(input){
  const clone=structuredClone(input);let id=0;const ids=new Set();
  function assign(object){if(!object)return;if(!object.id||ids.has(object.id))object.id='migration_'+(++id);ids.add(object.id);}
  for(const project of [clone,...(clone.nativeWorkspace?.peers||[])]){assign(project);for(const m of project.modules||[]){assign(m);if(m.form){assign(m.form);for(const c of [...(m.form.controls||[]),...(m.form.menus||[])])assign(c);}}}
  return normalizeProject(clone);
}
function report(diagnostics){
  return '# Migration report\n\n'+(diagnostics.length?diagnostics.map(d=>`## ${d.severity.toUpperCase()} ${d.code}\n\n${d.project||''}${d.source?' / '+d.source:''}${d.line?':'+d.line:''}\n\n${d.message}\n`).join('\n'):'No migration blockers were detected. Build and test the generated project before deployment.\n')+'\nA source conversion without diagnostics is not proof of behavioral equivalence. The converter does not execute the input project or the .NET compiler.\n';
}
function projectFile(context,files,references,resources,startup,blockers){
  const {options,target}=context;
  return `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>${TARGET_FRAMEWORKS[target]}</TargetFramework>
    <OutputType>${context.outputType==='library'?'Library':target==='windows'&&context.modules.some(m=>m.kind==='form')?'WinExe':'Exe'}</OutputType>
    <RootNamespace>${msbuild(context.namespace)}</RootNamespace>
    <AssemblyName>${msbuild(context.outputName)}</AssemblyName>
    <PlatformTarget>${options.platform}</PlatformTarget>
    <OptionExplicit>On</OptionExplicit>
    <OptionStrict>${options.optionStrict?'On':'Off'}</OptionStrict>
    <OptionInfer>On</OptionInfer>
    <RemoveIntegerChecks>false</RemoveIntegerChecks>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <EnableDefaultEmbeddedResourceItems>false</EnableDefaultEmbeddedResourceItems>
    <GenerateAssemblyInfo>true</GenerateAssemblyInfo>
    <Deterministic>true</Deterministic>
    <MyType>Empty</MyType>${target==='windows'?'\n    <UseWindowsForms>true</UseWindowsForms>\n    <EnableWindowsTargeting>true</EnableWindowsTargeting>':''}${startup?'\n    <StartupObject>'+msbuild(startup)+'</StartupObject>':''}
  </PropertyGroup>
  <ItemGroup>
${Object.keys(files).filter(p=>p.endsWith('.vb')).sort().map(p=>'    <Compile Include="'+msbuild(p)+'" />').join('\n')}
${resources.map(r=>'    <EmbeddedResource Include="'+msbuild(r.path)+'"><LogicalName>'+msbuild(r.name)+'</LogicalName></EmbeddedResource>').join('\n')}
${references.map(r=>r.kind==='project'?'    <ProjectReference Include="'+msbuild(r.path)+'" />':'    <Reference Include="'+msbuild(r.name)+'"><HintPath>'+msbuild(r.path)+'</HintPath></Reference>').join('\n')}
  </ItemGroup>${blockers?'\n  <Import Project="Migration.Blockers.targets" />':''}
</Project>
`;
}
function startupCode(context){
  if(context.outputType==='library')return {startup:null};
  const selected=keyOf(context.project.startup||''),form=context.modules.find(m=>m.kind==='form'&&keyOf(m.name)===selected);
  if(form)return {startup:context.namespace+'.__Vb6EntryPoint',code:`Option Explicit On
Option Strict On
Friend Module __Vb6EntryPoint
    <Global.System.STAThread>
    Public Sub Main()
        Global.System.Windows.Forms.Application.SetHighDpiMode(Global.System.Windows.Forms.HighDpiMode.SystemAware)
        Global.System.Windows.Forms.Application.EnableVisualStyles()
        Global.System.Windows.Forms.Application.SetCompatibleTextRenderingDefault(False)
        Global.System.Windows.Forms.Application.Run([${form.name}].DefaultInstance)
    End Sub
End Module
`};
  const candidates=context.modules.filter(m=>m.kind==='module'&&m.procedures.some(p=>keyOf(p.name)==='main'&&p.kind==='sub'&&p.params.length===0));
  if(candidates.length===1)return {startup:context.namespace+'.'+candidates[0].name};
  context.diagnostics.error('VBM5001',candidates.length?'Ambiguous Sub Main entry point':'No valid startup form or parameterless Sub Main',{project:context.project.name});
  return {startup:null};
}
function normalizeReferences(context){
  const references=[];
  for(const ref of context.project.references||[]){
    const custom=context.registry.dispatch('reference',ref,context);
    if(custom!==undefined){
      for(const item of [].concat(custom||[])){
        if(!['project','assembly'].includes(item.kind)||typeof item.path!=='string'||item.kind==='assembly'&&typeof item.name!=='string')throw new MigrationError('Reference plugins must return project/assembly descriptors');
        // Generated dependencies must be explicitly supplied by the caller/plugin.
        if(/^[\\/]|^[A-Za-z]:|[\0\r\n]/.test(item.path))throw new MigrationError('Absolute/unsafe plugin reference path');
        references.push(item);
      }
      continue;
    }
    context.diagnostics.error('VBM5002','Native reference requires a managed or reviewed COM/OCX reference adapter: '+ref.value,{project:context.project.name,reference:ref});
  }
  for(const file of context.project.nativeProject?.files||[])if(file.kind!=='related'&&(!file.resolved||!file.moduleId))context.diagnostics.error('VBM5003','Missing or opaque source membership: '+file.path,{project:context.project.name,source:file.path});
  return references;
}
function projectConversion(project,common){
  const target=common.options.target==='auto'?(project.modules.some(m=>m.kind==='form'||/\bDeclare\b/i.test(m.code))||project.references?.length?'windows':'portable'):common.options.target;
  const options={...common.options,platform:common.options.platform==='auto'?(target==='windows'?'x86':'AnyCPU'):common.options.platform};
  const context={...common,project,target,options,outputName:outputName(project.name),namespace:outputName(project.name),runtimeFeatures:new Set(),nativeLibraries:new Set(),formEventAdapters:new Map()};
  if(target==='portable'&&project.modules.some(m=>m.kind==='form'))context.diagnostics.error('VBM5004','WinForms projects require the Windows target',{project:project.name});
  const nativeType=project.nativeProject?.entries?.find(e=>e.key.toLowerCase()==='type')?.value;
  context.outputType=options.outputType==='auto'?nativeType&&nativeType!=='Exe'?'library':!project.startup&&!project.modules.some(m=>m.kind==='form'||/\bSub\s+Main\b/i.test(m.code))?'library':'exe':options.outputType;
  context.modules=project.modules.map(m=>readModule(m,context));Object.assign(context,symbolTables(context.modules));
  for(const module of context.modules){
    if(/^__vb6/i.test(module.name)||module.name==='Vb6Migration')context.diagnostics.error('VBM5005','Source name collides with the reserved migration namespace: '+module.name,{project:project.name});
    if(module.input.nativeOpaque)context.diagnostics.error('VBM5006','Opaque native designer requires an explicit backend',{project:project.name,source:module.sourcePath});
  }
  const files=Object.create(null),maps=Object.create(null),resources=[],references=normalizeReferences(context),seen=new Set();
  const add=(name,value)=>{name=checkedPath(name);const key=name.normalize('NFC').toLowerCase();if(seen.has(key))throw new MigrationError('Colliding generated file: '+name);seen.add(key);files[name]=value;};
  for(const module of context.modules)if(module.kind==='form'){
    const designer=emitDesigner(module,context);add('Forms/'+outputName(module.name)+'.Designer.vb',designer.code);
    for(const resource of designer.resources){add(resource.path,resource.bytes);resources.push(resource);}
  }
  for(const module of context.modules){
    const emitted=emitModule(module,context),path=(module.kind==='form'?'Forms/':module.kind==='class'?'Classes/':'Modules/')+outputName(module.name)+'.vb';
    add(path,emitted.code);maps[path]=emitted.sourceMap;
  }
  const startup=startupCode(context);if(startup.code)add('Startup.vb',startup.code);
  for(const [name,value]of Object.entries(runtimeFiles(context)))add(name,value);
  const custom=context.registry.dispatch('project',{files,references,resources},context);
  if(custom!==undefined)for(const [name,value]of Object.entries(custom.files||{}))add(name,value);
  const diagnostics=context.diagnostics.snapshot().filter(d=>d.project===project.name),blockers=diagnostics.filter(d=>d.severity==='error');
  if(blockers.length)add('Migration.Blockers.targets',`<Project>\n  <Target Name="RejectUnresolvedVB6Migration" BeforeTargets="CoreCompile">\n    <Error Text="This is a migration REVIEW package with ${blockers.length} unresolved blockers. Resolve migration.json diagnostics and regenerate; do not remove this guard to claim compatibility." />\n  </Target>\n</Project>\n`);
  add(context.outputName+'.vbproj',projectFile(context,files,references,resources,startup.startup,blockers.length));
  add('source-map.json',JSON.stringify(maps,null,2)+'\n');
  return {files,context,projectFile:context.outputName+'.vbproj',manifest:{name:project.name,directory:context.outputName,targetFramework:TARGET_FRAMEWORKS[target],platform:options.platform,rootNamespace:context.namespace,outputType:context.outputType,startupObject:startup.startup,modules:context.modules.map(m=>({name:m.name,kind:m.kind,source:m.sourcePath,optionBase:m.optionBase,optionCompare:m.optionCompare})),runtimeFeatures:[...context.runtimeFeatures].sort(),nativeLibraries:[...context.nativeLibraries].sort(),references,diagnosticCount:diagnostics.length}};
}

export class VbNetConverter {
  constructor({plugins=[],frontend=sharedFrontend}={}){this.registry=new MigrationRegistry(plugins);this.frontend=frontend;}
  convert(input,configuration={}){
    const options=migrationOptions(configuration),source=JSON.stringify(input),sourceSize=fileBytes(source).length;
    if(sourceSize>options.maxSourceBytes)throw new MigrationError('Project exceeds migration source byte budget');
    const normalized=stableModel(input);validateWorkspace(normalized);
    const diagnostics=new DiagnosticBag(),hydration=[];
    for (const item of configuration.importDiagnostics || []) diagnostics.add('VBM5010', item.severity === 'error' ? 'error' : item.severity === 'warning' ? 'warning' : 'info', item.message || String(item), {project:normalized.name,source:item.source,line:item.line});
    for(const project of workspaceProjects(normalized))hydrateResources(project,hydration);
    for(const diagnostic of hydration)diagnostics.add('VBM5007',diagnostic.severity,diagnostic.message,{project:normalized.name,source:diagnostic.source});
    const common={options,diagnostics,registry:this.registry,frontend:this.frontend};
    const converted=workspaceProjects(normalized).map(project=>projectConversion(project,common));
    const files=Object.create(null),seen=new Set();let total=0;
    const add=(name,value)=>{
      name=checkedPath(name);const key=name.normalize('NFC').toLowerCase();if(seen.has(key))throw new MigrationError('Duplicate output path: '+name);seen.add(key);
      total+=fileBytes(value).length;if(total>options.maxOutputBytes)throw new MigrationError('Migration exceeds output byte budget');files[name]=value;
    };
    for(const item of converted)for(const [path,value]of Object.entries(item.files))add(item.context.outputName+'/'+path,value);
    add(outputName(normalized.name)+'.slnx','<Solution>\n'+converted.map(p=>'  <Project Path="'+xml(p.context.outputName+'/'+p.projectFile)+'" />').join('\n')+'\n</Solution>\n');
    add('global.json',JSON.stringify({sdk:{version:'10.0.100',rollForward:'latestFeature',allowPrerelease:false}},null,2)+'\n');
    add('Directory.Build.props','<Project>\n  <PropertyGroup><Deterministic>true</Deterministic></PropertyGroup>\n</Project>\n');
    if(options.includeOriginals){
      add('Originals/project.vb6web',JSON.stringify(input,null,2)+'\n');
      try{for(const [path,value]of Object.entries(sourceFiles(normalized)))add('Originals/Native/'+checkedPath(path),value);}
      catch(error){diagnostics.warning('VBM5008','The native source reconstruction was incomplete; the complete input model remains in Originals/project.vb6web: '+error.message,{project:normalized.name});}
    }
    const items=diagnostics.snapshot(),hasErrors=items.some(d=>d.severity==='error');
    const manifest={schema:MIGRATION_SCHEMA,converter:{name:'@vb6/vbnet-migration',version:MIGRATION_VERSION},status:hasErrors?'needs-review':'ready-for-build',compilerValidated:false,behavioralEquivalenceCertified:false,conditionalConstants:options.conditionalConstants,plugins:[...this.registry.names].sort(),projects:converted.map(c=>c.manifest),diagnostics:items,sourceSnapshotIncluded:options.includeOriginals,files:Object.entries(files).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,value])=>{const bytes=fileBytes(value);return {path,bytes:bytes.length,crc32:crc32(bytes).toString(16).padStart(8,'0')};})};
    add('migration.json',JSON.stringify(manifest,null,2)+'\n');add('MIGRATION-REPORT.md',report(items));
    add('README.md',`# ${normalized.name.replace(/[\r\n]/g,' ')} — VB.NET migration\n\nTarget: .NET 10. Install a stable .NET 10 SDK. Windows Forms applications run on Windows; portable projects use net10.0.\n\nStatus: **${manifest.status}**. ${hasErrors?'This review archive intentionally contains an MSBuild guard against unresolved conversions.':'The converter has not executed dotnet build or certified behavior; validate the generated application against the VB6 application.'}\n\nBuild with \`dotnet build\`. Read MIGRATION-REPORT.md and migration.json first. Original VB6 sources are excluded from Compile items. Each project includes its compatibility runtime as editable VB.NET source; no VB6 runtime DLL is required by that generated helper code. Native dependencies remain external until migrated.\n\nThe default x86 Windows target preserves classic Declare pointer widths. Choose x64 only after reviewing native ABIs. global.json stays on the newest installed .NET 10 feature band, not .NET 11.\n\nDo not run untrusted projects merely to convert them. This converter never executes source code, restores packages or invokes a native compiler.\n`);
    return {files,manifest,diagnostics:items,success:!hasErrors,outputName:outputName(normalized.name)+'-vbnet10'};
  }
  exportZip(project,options={}){
    const result=this.convert(project,options);
    if(!result.success&&!options.allowIncomplete)throw new MigrationError('Migration has blocking diagnostics; inspect convert() output or explicitly request a review archive.',result.diagnostics);
    return {...result,bytes:migrationZip(result.files,migrationOptions(options).maxOutputBytes),fileName:result.outputName+(result.success?'':'-REVIEW')+'.zip'};
  }
  async convertFiles(entries,options={},importOptions={}){
    const values=entries instanceof Map?[...entries]:Array.isArray(entries)?entries:Object.entries(entries);
    const imported=await importFiles(values,importOptions),result=this.convert(imported.project,{...options,importDiagnostics:imported.diagnostics});
    // Import errors are never discarded. The import model's missing/opaque member
    // records also generate project-local MSBuild guards during conversion.
    result.importDiagnostics=imported.diagnostics;return result;
  }
  async convertArchive(bytes,options={},importOptions={}){
    const files=await readZip(bytes,{maxExpandedBytes:migrationOptions(options).maxSourceBytes});
    return this.convertFiles(files,options,importOptions);
  }
}
export function createVbNetConverter(configuration){return new VbNetConverter(configuration);}
export function convertProjectToVbNet(project,options){return new VbNetConverter().convert(project,options);}
export function exportVbNetProjectZip(project,options){return new VbNetConverter().exportZip(project,options);}

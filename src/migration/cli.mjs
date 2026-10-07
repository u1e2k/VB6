import fs from 'node:fs/promises';
import path from 'node:path';
import {importFiles} from '../project/formats.js';
import {readZip} from '../project/zip.js';
import {createVbNetMigrator} from './index.js';

export const MIGRATION_USAGE=`Usage: vb6-migrate INPUT --out RESULT.zip [options]
INPUT: .vb6web, .vbp, .vbg, or a ZIP containing a VB6 project.
  --target auto|console|library|winforms  Output application kind (default auto)
  --platform x86|x64|AnyCPU|arm64         Target CPU (default x86, matching VB6)
  --root PATH                           Explicit native input root (default input directory)
  --entry PATH                          VBP/VBG entry within input archive/root
  --namespace NAME                      VB.NET root namespace (default empty)
  --review                              Export unresolved review bundle with build guard
  --strict                              Emit Option Strict On
  --code-style native|compatibility     Native-first by default
  --runtime minimal|none|project|package Support packaging (default minimal)
  --semantic-policy preserve|modernize   Preserve behavior by default
  --accept-rule currency-decimal        Explicitly approve changed Currency semantics
  --runtime-package ID@VERSION           Explicit shared core package
  --windows-runtime-package ID@VERSION   Explicit shared Windows package
  --no-originals                        Omit original snapshot and source
  --inspect                             Print report without writing output
  --help                                Show usage
Existing output is never overwritten. Project source is never executed.
`;
export function parseMigrationArguments(args) {
  const flags=new Set(['--review','--strict','--no-originals','--inspect','--help']);
  const values=new Set(['--out','--target','--platform','--root','--entry','--namespace','--code-style','--runtime','--semantic-policy','--accept-rule','--runtime-package','--windows-runtime-package']);
  const settings={},seen=new Set();let input;
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(!arg.startsWith('--')){if(input)throw new Error('Only one input project is allowed');input=arg;continue;}
    if(!flags.has(arg)&&!values.has(arg))throw new Error('Unknown argument: '+arg);
    if(seen.has(arg))throw new Error('Repeated argument: '+arg);seen.add(arg);
    if(flags.has(arg))settings[arg.slice(2)]=true;
    else{const value=args[++i];if(!value||value.startsWith('--'))throw new Error('Missing value for '+arg);settings[arg.slice(2)]=value;}
  }
  if(!settings.help&&(!input||!settings.inspect&&!settings.out))throw new Error(MIGRATION_USAGE);
  return {input,settings};
}
async function nativeEntries(root,maxBytes) {
  const entries=new Map();let size=0,count=0;
  async function visit(directory){
    for(const entry of (await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
      if(['.git','node_modules','bin','obj'].includes(entry.name)||entry.isSymbolicLink())continue;
      const full=path.join(directory,entry.name);
      if(entry.isDirectory()){await visit(full);continue;}
      if(!entry.isFile())continue;
      if(++count>10000)throw new Error('Native input root exceeds the 10,000-file limit; select a narrower --root');
      const stat=await fs.stat(full);size+=stat.size;if(size>maxBytes)throw new Error('Native input root exceeds the byte limit; select a narrower --root');
      entries.set(path.relative(root,full).split(path.sep).join('/'),new Uint8Array(await fs.readFile(full)));
    }
  }
  await visit(root);return entries;
}
export async function loadMigrationInput(file,settings={}) {
  const maxBytes=32*1024*1024,input=path.resolve(file),stat=await fs.lstat(input);
  if(stat.isSymbolicLink()||!stat.isFile())throw new Error('Input must be a regular file, not a symlink');
  if(stat.size>maxBytes)throw new Error('Input exceeds the 32 MiB limit');
  if(/\.(vb6web|json)$/i.test(input))return {project:JSON.parse(await fs.readFile(input,'utf8')),diagnostics:[]};
  let entries,entryPath=settings.entry;
  if(/\.zip$/i.test(input))entries=new Map(await readZip(await fs.readFile(input),{maxExpandedBytes:maxBytes,maxFiles:10000}));
  else{
    if(!/\.(vbp|vbg)$/i.test(input))throw new Error('Supported inputs are .vb6web, .vbp, .vbg and .zip');
    const root=await fs.realpath(settings.root||path.dirname(input)),actual=await fs.realpath(input),relative=path.relative(root,actual);
    if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Input project must be inside --root');
    entries=await nativeEntries(root,maxBytes);entryPath ||=relative.split(path.sep).join('/');
  }
  const browser=[...entries.keys()].filter(p=>/\.vb6web$/i.test(p));
  if(!entryPath&&browser.length===1&&!([...entries.keys()].some(p=>/\.(vbp|vbg)$/i.test(p))))return {project:JSON.parse(new TextDecoder().decode(entries.get(browser[0]))),diagnostics:[]};
  return importFiles(entries,entryPath?{entryPath}:{});
}
export async function runMigrationCli(args,{stdout=console.log,stderr=console.error}={}) {
  const {input,settings}=parseMigrationArguments(args);
  if(settings.help){stdout(MIGRATION_USAGE);return 0;}
  const loaded=await loadMigrationInput(input,settings),migrator=createVbNetMigrator();
  const inputDiagnostics=loaded.diagnostics||[];
  const packageSpec=value=>{
    if(value===undefined)return undefined;
    const split=value.lastIndexOf('@');
    if(split<1||split===value.length-1)throw new Error('Package specification must be ID@VERSION');
    return {id:value.slice(0,split),version:value.slice(split+1)};
  };
  const options={codeStyle:settings['code-style'],runtime:settings.runtime,semanticPolicy:settings['semantic-policy'],
    acceptedRules:settings['accept-rule']?[settings['accept-rule']]:[],runtimePackage:packageSpec(settings['runtime-package']),windowsRuntimePackage:packageSpec(settings['windows-runtime-package']),target:settings.target,platform:settings.platform,rootNamespace:settings.namespace,strict:!!settings.strict,includeOriginals:!settings['no-originals'],includeUnresolved:!!settings.review,
    plugins:inputDiagnostics.length?[{id:'host-import-diagnostics',analyze(project,context){context.diagnostics.push(...inputDiagnostics.map(d=>({...d,code:'MIG_IMPORT_'+(d.code||d.number||'INPUT')})));}}]:[]};
  if(settings.inspect){const result=migrator.convertProject(loaded.project,options);stdout(JSON.stringify(result.report,null,2));return result.success?0:2;}
  const result=migrator.exportProject(loaded.project,options),output=path.resolve(settings.out);
  if(!/\.zip$/i.test(output))throw new Error('Output must use the .zip extension');
  // The output is built and validated before exclusive creation. It cannot
  // replace any input, existing output, directory or symlink.
  await fs.writeFile(output,result.bytes,{flag:'wx'});
  for(const diagnostic of result.diagnostics)stderr(diagnostic.code+': '+diagnostic.message);
  stdout(JSON.stringify({output,bytes:result.bytes.length,files:Object.keys(result.files).length,success:result.success,errors:result.report.errors,warnings:result.report.warnings,runtime:result.report.runtime}));
  return 0;
}

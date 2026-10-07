/** Explicit local build authority. Never executes the generated application. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createMacOSBuildKit,importFiles} from '../dist/index.js';
import {writeBuildKit,buildNativeKit} from './build-driver.mjs';
export async function buildMacOSProject(project,{compiler={},...build}={}) {
  const kit=createMacOSBuildKit(project,compiler),temporary=await fs.mkdtemp(path.join(os.tmpdir(),'vb6-macos-'));
  try {const dir=path.join(temporary,'kit');await writeBuildKit(dir,kit.files);return await buildNativeKit(dir,build);}
  finally {await fs.rm(temporary,{recursive:true,force:true});}
}
export async function readMacOSProject(input) {
  const absolute=path.resolve(input),stat=await fs.lstat(absolute);
  if(stat.isSymbolicLink())throw new Error('Source must not be a symbolic link');
  if(stat.isFile()&&/\.(vb6web|vb6proj|json)$/i.test(absolute)) {
    if(stat.size>50*1024*1024)throw new Error('Project exceeds 50 MiB');
    return JSON.parse(await fs.readFile(absolute,'utf8'));
  }
  if(!stat.isDirectory()&&!/\.vbp$/i.test(absolute))throw new Error('Expected a .vb6web, .vbp, or native project directory');
  const root=stat.isDirectory()?absolute:path.dirname(absolute),entries=new Map();let total=0;
  async function walk(dir,relative='',depth=0) {
    if(depth>16)throw new Error('Source nesting exceeds 16 directories');
    for(const e of await fs.readdir(dir,{withFileTypes:true})) {
      if(['.git','node_modules','.vb6-save-journal'].includes(e.name))continue;
      if(e.isSymbolicLink())throw new Error('Source links are not accepted');
      const full=path.join(dir,e.name),name=relative+e.name;
      if(e.isDirectory()){await walk(full,name+'/',depth+1);continue;}
      if(!e.isFile())throw new Error('Only regular source files are accepted');
      const info=await fs.lstat(full);if(info.size>20*1024*1024)throw new Error('Source file exceeds 20 MiB');
      total+=info.size;if(total>50*1024*1024||entries.size>=2000)throw new Error('Native source exceeds import limits');
      entries.set(name,new Uint8Array(await fs.readFile(full)));
    }
  }
  await walk(root);
  const imported=await importFiles(entries,stat.isDirectory()?{}:{entryPath:path.basename(absolute)});
  const errors=imported.diagnostics.filter(d=>d.severity==='error');if(errors.length)throw Object.assign(new Error('Native import contains errors'),{diagnostics:errors});
  return imported.project;
}
export async function exportMacOSSource(project,directory,options={}) {
  const kit=createMacOSBuildKit(project,options);await writeBuildKit(path.resolve(directory),kit.files);return kit.report;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readZip} from '../src/project/zip.js';
import {migrationZip} from '../src/migration/index.js';
import {parseMigrationArguments,runMigrationCli,loadMigrationInput} from '../src/migration/cli.mjs';
import {procedure} from './migration-fixtures.mjs';
const output={stdout(){},stderr(){}};
async function temporary(action){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vb6-migrate-'));try{return await action(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}
for(const args of [[],['p'],['p','--what'],['p','--out'],['p','--out','a','--out','b'],['a','b','--inspect']])test('CLI rejects malformed arguments '+JSON.stringify(args),()=>assert.throws(()=>parseMigrationArguments(args)));
test('CLI exports a readable ZIP without overwriting existing files',()=>temporary(async dir=>{
  const file=path.join(dir,'project.vb6web'),zip=path.join(dir,'converted.zip');await fs.writeFile(file,JSON.stringify(procedure('Debug.Print "hello"')));
  assert.equal(await runMigrationCli([file,'--out',zip,'--platform','AnyCPU'],output),0);
  const before=await fs.readFile(zip),entries=await readZip(before);assert.ok(entries.has('Application/Module1.vb'));
  await assert.rejects(runMigrationCli([file,'--out',zip],output),e=>e.code==='EEXIST');assert.deepEqual(await fs.readFile(zip),before);
}));
test('CLI imports classic VBP source and all referenced modules before conversion',()=>temporary(async dir=>{
  const file=path.join(dir,'Native.vbp');await fs.writeFile(file,'Type=Exe\r\nName="Native"\r\nModule=MainModule; Main.bas\r\nStartup="Sub Main"\r\n');
  await fs.writeFile(path.join(dir,'Main.bas'),'Attribute VB_Name = "MainModule"\r\nPublic Sub Main()\r\nDebug.Print "native"\r\nEnd Sub\r\n');
  const loaded=await loadMigrationInput(file);assert.equal(loaded.project.modules[0].name,'MainModule');
  assert.equal(await runMigrationCli([file,'--out',path.join(dir,'out.zip')],output),0);
}));
test('CLI imports ZIP inputs without extracting project-supplied paths to disk',()=>temporary(async dir=>{
  const zip=path.join(dir,'input.zip');await fs.writeFile(zip,migrationZip({'P.vbp':'Type=Exe\nName="P"\nModule=M; M.bas\nStartup="Sub Main"','M.bas':'Attribute VB_Name = "M"\nPublic Sub Main()\nEnd Sub'}));
  const loaded=await loadMigrationInput(zip);assert.equal(loaded.project.modules[0].name,'M');assert.equal((await fs.readdir(dir)).length,1);
}));
test('CLI carries importer diagnostics into migration reports and blocks normal export',()=>temporary(async dir=>{
  const file=path.join(dir,'Missing.vbp');await fs.writeFile(file,'Type=Exe\nName="Missing"\nModule=M; Missing.bas\nStartup="Sub Main"');
  assert.equal(await runMigrationCli([file,'--inspect'],output),2);
  await assert.rejects(runMigrationCli([file,'--out',path.join(dir,'blocked.zip')],output));
  assert.equal(await runMigrationCli([file,'--out',path.join(dir,'review.zip'),'--review'],output),0);
}));
test('CLI rejects symlink inputs and native roots outside the selected directory',()=>temporary(async dir=>{
  const file=path.join(dir,'P.vbp');await fs.writeFile(file,'Name="P"');await fs.mkdir(path.join(dir,'child'));
  await assert.rejects(loadMigrationInput(file,{root:path.join(dir,'child')}),/inside/);
  if(process.platform!=='win32'){const link=path.join(dir,'link.vbp');await fs.symlink(file,link);await assert.rejects(loadMigrationInput(link),/symlink/);}
}));

/** Verify the npm tarball outside the repository: dependency closure and CLI. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readZip} from '../src/project/zip.js';
const root=path.resolve(import.meta.dirname,'..'),artifacts=path.join(root,'artifacts/vbnet-migration');
const manifest=JSON.parse(fs.readFileSync(path.join(artifacts,'package-manifest.json'),'utf8'));
const archive=path.join(artifacts,manifest.filename),directory=fs.mkdtempSync(path.join(os.tmpdir(),'vbnet-package-'));
try{
  // Extract only the npm-generated archive, not an untrusted project archive.
  const extraction=spawnSync('tar',['-xzf',archive,'-C',directory],{encoding:'utf8'});
  assert.equal(extraction.status,0,extraction.stderr||extraction.error?.message);
  const installed=path.join(directory,'package');
  const api=await import(pathToFileURL(path.join(installed,'lib/src/migration/index.js')).href);
  const project={schema:1,name:'Standalone',startup:'Sub Main',settings:{},modules:[{name:'Program',kind:'module',code:'Public Sub Main()\nDebug.Print "standalone"\nEnd Sub'}]};
  const converted=api.exportVbNetProject(project,{platform:'AnyCPU'});
  assert.ok(converted.success);
  const zip=await readZip(converted.bytes);assert.ok(zip.has('Application/Program.vb'));
  const input=path.join(directory,'input.vb6web'),output=path.join(directory,'output.zip');
  fs.writeFileSync(input,JSON.stringify(project));
  const command=spawnSync(process.execPath,[path.join(installed,'bin/vb6-migrate.mjs'),input,'--platform','AnyCPU','--out',output],{cwd:directory,encoding:'utf8'});
  assert.equal(command.status,0,command.stderr);assert.ok(fs.statSync(output).size>0);
  const context=vm.createContext({TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,AbortController,console});
  vm.runInContext(fs.readFileSync(path.join(installed,'dist/vbnet-migration.js'),'utf8'),context);
  assert.equal(context.VB6Migration.convertVbNetProject(project).success,true);
  const report={package:manifest.name,version:manifest.version,filename:manifest.filename,files:manifest.files.length,packedBytes:manifest.size,unpackedBytes:manifest.unpackedSize,passed:['standalone-esm','standalone-cli','standalone-browser','runtime-source-in-zip'],dotnetBuild:'not-run'};
  fs.mkdirSync(path.join(root,'reports/vbnet-migration'),{recursive:true});
  fs.writeFileSync(path.join(root,'reports/vbnet-migration/package-results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{fs.rmSync(directory,{recursive:true,force:true});}

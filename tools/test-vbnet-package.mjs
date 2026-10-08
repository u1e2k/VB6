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
  assert.deepEqual(converted.report.runtime.features,[]);
  assert.equal([...zip.keys()].some(path=>path.startsWith('VB6.Compatibility')||path.startsWith('Application/Compatibility/')),false);
  const legacy=api.convertVbNetProject(project,{codeStyle:'compatibility',runtime:'project'});
  assert.ok(legacy.files['VB6.Compatibility/src/VbArray.vb']);
  const currency=api.exportVbNetProject({...project,modules:[{name:'Program',kind:'module',code:'Public Sub Main()\nDim c As Currency\nc=1.23456@\nEnd Sub'}]});
  assert.deepEqual(currency.report.runtime.features,['VbCurrency']);assert.equal(currency.report.runtime.sourceFiles,1);
  const semanticProject={...project,modules:[{name:'Program',kind:'module',code:'Public Sub Main()\nDim a As Variant, c As Currency\nReDim a(-1 To 2) As Long\na(-1) = 7\nFor c = 1 To 2 Step .25\nSelect Case a(-1)\nCase 1 To 9\nDebug.Print c\nEnd Select\nNext c\nEnd Sub'}]};
  const semanticExport=api.exportVbNetProject(semanticProject,{platform:'AnyCPU'});
  assert.ok(semanticExport.success,JSON.stringify(semanticExport.diagnostics));
  const semanticZip=await readZip(semanticExport.bytes);
  for(const file of ['VbArrayBounds.vb','VbArrays.vb','VbArray.vb']){
    assert.ok(semanticZip.has('Application/Compatibility/'+file),file);
  }
  assert.match(api.convertVbNetProject(semanticProject,{platform:'AnyCPU'}).files['Application/Program.vb'],/VbArrays\.ResizeVariant/);
  const input=path.join(directory,'input.vb6web'),output=path.join(directory,'output.zip');
  fs.writeFileSync(input,JSON.stringify(project));
  const command=spawnSync(process.execPath,[path.join(installed,'bin/vb6-migrate.mjs'),input,'--platform','AnyCPU','--out',output],{cwd:directory,encoding:'utf8'});
  assert.equal(command.status,0,command.stderr);assert.ok(fs.statSync(output).size>0);
  const context=vm.createContext({TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,AbortController,console});
  vm.runInContext(fs.readFileSync(path.join(installed,'dist/vbnet-migration.js'),'utf8'),context);
  assert.equal(context.VB6Migration.convertVbNetProject(project).success,true);
  assert.equal(context.VB6Migration.convertVbNetProject(semanticProject,{platform:'AnyCPU'}).success,true);
  const report={package:manifest.name,version:manifest.version,filename:manifest.filename,files:manifest.files.length,packedBytes:manifest.size,unpackedBytes:manifest.unpackedSize,passed:['standalone-esm','standalone-cli','standalone-browser','runtime-source-in-zip','standalone-array-control-flow','typed-array-runtime-in-zip','native-zero-runtime','minimal-currency','legacy-project-policy'],dotnetBuild:'not-run'};
  fs.mkdirSync(path.join(root,'reports/vbnet-migration'),{recursive:true});
  fs.writeFileSync(path.join(root,'reports/vbnet-migration/package-results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{fs.rmSync(directory,{recursive:true,force:true});}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {runtimeClosure,RUNTIME_CATALOG} from '../src/migration/runtime-catalog.js';
import {RUNTIME_FEATURES} from '../src/migration/runtime-sources.js';
const probe=spawnSync('dotnet',['--list-sdks'],{encoding:'utf8',timeout:15000});
const available=probe.status===0&&/^10\.\d+\.\d+/m.test(probe.stdout);
const skip=available?false:'.NET 10 SDK absent; isolated feature compilation not executed';

test('each runtime root compiles in isolation with only its declared dependency closure',{skip,timeout:360000},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vbnet-linker-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const projects=[];
 for(const [feature,spec] of Object.entries(RUNTIME_CATALOG)){
  if(spec.windows&&process.platform!=='win32')continue;
  const dir=path.join(root,feature);fs.mkdirSync(dir);
  for(const name of runtimeClosure([feature]))fs.writeFileSync(path.join(dir,name+'.vb'),RUNTIME_FEATURES[name].source);
  fs.writeFileSync(path.join(dir,'Feature.vbproj'),'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>'+(spec.windows?'net10.0-windows':'net10.0')+'</TargetFramework><RootNamespace>Isolation</RootNamespace><OptionStrict>On</OptionStrict><OptionExplicit>On</OptionExplicit><OptionInfer>On</OptionInfer>'+(spec.windows?'<UseWindowsForms>true</UseWindowsForms>':'')+'</PropertyGroup></Project>');
  projects.push(feature);
 }
 fs.writeFileSync(path.join(root,'Features.slnx'),'<Solution>'+projects.map(name=>'<Project Path="'+name+'/Feature.vbproj" />').join('')+'</Solution>');
 const args=['build','Features.slnx','--nologo','-v','minimal','--maxcpucount:2'];
 const result=spawnSync('dotnet',args,{cwd:root,encoding:'utf8',timeout:330000,maxBuffer:32*1024*1024,env:{...process.env,DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_NOLOGO:'1'}});
 const report=path.resolve(import.meta.dirname,'../reports/vbnet-migration/dotnet');fs.mkdirSync(report,{recursive:true});
 fs.writeFileSync(path.join(report,'isolated-features.json'),JSON.stringify({sdk:probe.stdout,platform:process.platform,projects,commands:[{arguments:args,status:result.status,stdout:result.stdout,stderr:result.stderr,error:result.error?.message}]},null,2));
 assert.equal(result.status,0,(result.error?.message||'')+'\n'+result.stdout+'\n'+result.stderr);
});

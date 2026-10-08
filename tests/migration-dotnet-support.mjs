import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {convertVbNetProject} from '../src/migration/index.js';

export const root=path.resolve(import.meta.dirname,'..'),reportRoot=path.join(root,'reports/vbnet-migration/dotnet');
export const probe=spawnSync('dotnet',['--list-sdks'],{encoding:'utf8',timeout:15000});
export const sdkAvailable=probe.status===0&&/^10\.\d+\.\d+/m.test(probe.stdout);
export const required=process.env.VB6_REQUIRE_DOTNET==='1';
export const skip=sdkAvailable?false:'.NET 10 SDK is not installed; no generated VB compilation or execution was performed';
const env={...process.env,DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_NOLOGO:'1',NUGET_XMLDOC_MODE:'skip'};


export function harness(t,name,input,{target,patch,codeStyle='compatibility',runtime,semanticPolicy,acceptedRules,strict,rootNamespace}={}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'vb6-dotnet-'));
  const result=convertVbNetProject(input,{platform:'AnyCPU',codeStyle,runtime,semanticPolicy,acceptedRules,strict,rootNamespace,...(target?{target}:{})});
  assert.ok(result.success,JSON.stringify(result.diagnostics));
  fs.mkdirSync(reportRoot,{recursive:true});
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  for(const [file,data] of Object.entries(result.files)){
    const output=path.join(directory,file);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,data);
  }
  if(patch)patch(directory,result);
  const commands=[];
  function dotnet(args){
    const r=spawnSync('dotnet',args,{cwd:directory,encoding:'utf8',env,timeout:120000,maxBuffer:16*1024*1024});
    commands.push({arguments:args,status:r.status,stdout:r.stdout,stderr:r.stderr,error:r.error?.message});
    fs.writeFileSync(path.join(reportRoot,name+'.json'),JSON.stringify({sdk:probe.stdout,platform:process.platform,commands},null,2)+'\n');
    assert.equal(r.status,0,(r.error?.message||'')+'\n'+r.stdout+'\n'+r.stderr);
    return r.stdout;
  }
  dotnet(['build',result.projectFile,'--nologo','-v','minimal']);
  const dll=path.join('Application','bin','Debug',result.report.targetFramework,result.report.project+'.dll');
  return {directory,result,dotnet,run:()=>dotnet([dll]).trim().split(/\r?\n/)};
}


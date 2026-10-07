/** End-to-end compilation/execution of checked-in, trusted migration fixtures. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createVbNetConverter} from '../packages/vbnet-migration/index.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixtures=path.join(root,'tests/fixtures/vbnet-migration');
const windows=process.argv.includes('--windows');
const directory=path.join(root,'artifacts/vbnet-migration',windows?'windows':'language');
await fs.mkdir(directory,{recursive:true});
const code=async file=>fs.readFile(path.join(fixtures,file),'utf8');
const project=windows?{schema:1,name:'WindowsFixture',startup:'MainForm',modules:[{name:'MainForm',kind:'form',code:'Option Explicit\nPublic ClickCount As Long\nPrivate Sub Command1_Click()\nClickCount = ClickCount + 1\nText1.Text = "converted"\nEnd Sub',form:{name:'MainForm',type:'Form',properties:{Caption:'Migration form',ClientWidth:6000,ClientHeight:4000},controls:[{name:'Command1',type:'CommandButton',properties:{Caption:'Go',Left:120,Top:120,Width:1200,Height:450}},{name:'Text1',type:'TextBox',properties:{Text:'before',Left:120,Top:700,Width:2400,Height:400}},{name:'Timer1',type:'Timer',properties:{Interval:500,Enabled:0}},{name:'List1',type:'ListBox',properties:{Left:120,Top:1200,Width:2400,Height:1000}}],menus:[]}}]}:{schema:1,name:'LanguageFixture',modules:[{name:'LanguageChecks',kind:'module',code:await code('language.bas')},{name:'Counter',kind:'class',code:await code('counter.cls')},{name:'Listener',kind:'class',code:await code('listener.cls')}]};
const converted=createVbNetConverter().exportZip(project,{outputType:'library',platform:'AnyCPU'});
assert.equal(converted.success,true,JSON.stringify(converted.diagnostics,null,2));
for(const [name,value]of Object.entries(converted.files)){const destination=path.join(directory,name);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,value);}
await fs.writeFile(path.join(directory,converted.fileName),converted.bytes);
const name=project.name;
await fs.writeFile(path.join(directory,'Host.vbproj'),`<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>${windows?'net10.0-windows':'net10.0'}</TargetFramework><OutputType>Exe</OutputType><RootNamespace></RootNamespace><MyType>Empty</MyType><EnableDefaultCompileItems>false</EnableDefaultCompileItems><OptionStrict>On</OptionStrict>${windows?'<UseWindowsForms>true</UseWindowsForms><EnableWindowsTargeting>true</EnableWindowsTargeting>':''}</PropertyGroup><ItemGroup><Compile Include="Host.vb"/><ProjectReference Include="${name}/${name}.vbproj"/></ItemGroup></Project>\n`);
await fs.writeFile(path.join(directory,'Host.vb'),await code(windows?'windows-host.vb':'language-host.vb'));
if(process.argv.includes('--generate-only')){console.log('Generated trusted '+name+' fixture without invoking dotnet');}
else{
  const result=spawnSync('dotnet',['run','--project','Host.vbproj','--configuration','Release'],{cwd:directory,encoding:'utf8',timeout:180_000,maxBuffer:8*1024*1024,env:{...process.env,DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_NOLOGO:'1'}});
  const output=(result.stdout||'')+(result.stderr||'');process.stdout.write(output);
  await fs.writeFile(path.join(directory,'execution.log'),output+(result.error?'\n'+result.error.message:''));
  if(result.error)throw result.error;
  assert.equal(result.status,0,'Generated project compilation/execution failed; see artifacts/vbnet-migration/'+(windows?'windows':'language')+'/execution.log');
  assert.match(output,windows?/VB6_MIGRATION_WINDOWS_OK/:/VB6_MIGRATION_LANGUAGE_OK \d+/);
}

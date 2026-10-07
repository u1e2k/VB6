import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {newProject} from '../src/project/model.js';
import {prepareClassicProject} from '../src/exporter/classic-project.js';
import {ClassicCompilerClient} from '../src/exporter/classic-client.js';
import {exportClassicArchive} from '../src/exporter/classic-archive.js';
import {createClassicBridge} from '../tools/classic-bridge.mjs';
import {compileClassicProject, prepareClassicBuildRequest} from '../tools/classic-compile.mjs';
import {runCompiler} from '../tools/classic-process.mjs';
import {classicPEFixture} from './classic-runtime-fixture.mjs';
const origin = 'http://127.0.0.1:8080';
const token = 'a'.repeat(64);
const caps = {version:1,target:'classic-vb6',arch:'x86',runtime:'MSVBVM60.DLL',available:true,timeout:1000};
const response = value => new Response(JSON.stringify(value), {headers:{'content-type':'application/json'}});
async function mockBridge(t, options = {}, dependencies = {}) {
  const bridge = await createClassicBridge({port:0,origins:[origin],compiler:process.execPath,token,authorize:async()=>true,...options},
    {platform:'win32',compile:async()=>({bytes:classicPEFixture()}),...dependencies});
  t.after(()=>bridge.close()); return bridge;
}
function post(bridge, body, headers={}) {
  return fetch(bridge.url, {method:'POST', headers:{Origin:origin,Authorization:'Bearer '+bridge.token,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
}

test('mock compiler bridge/client roundtrip verifies the exact binary and runtime import', async t => {
  let approvals=0, builds=0;
  const bridge=await mockBridge(t,{authorize:async manifest=>{approvals++;assert.equal(manifest.runtime,'MSVBVM60.DLL');return true;}},
    {compile:async(prepared,options)=>{builds++;assert.equal(options.compiler,process.execPath);assert.equal(prepared.manifest.codegen,'pcode');return {bytes:classicPEFixture()};}});
  const client=new ClassicCompilerClient((url,options)=>fetch(url,{...options,headers:{...options.headers,Origin:origin}}));
  t.after(()=>client.disconnect());
  await client.connect(bridge.url,bridge.token);
  const result=await client.build(newProject('Runtime'),{codegen:'pcode'});
  assert.equal(approvals,1);assert.equal(builds,1);assert.deepEqual(Buffer.from(result.bytes),classicPEFixture());
  assert.equal(result.report.compiled,true);assert.equal(result.report.pe.classicRuntimeImport,true);
  assert.equal(result.report.sha256,createHash('sha256').update(classicPEFixture()).digest('hex'));
  assert.ok(!JSON.stringify(client).includes(token));
  client.disconnect();assert.equal(client.connected,false);await assert.rejects(client.build(newProject()),/Connect/);
});
test('bridge denies foreign origins, wrong token/Host, arbitrary methods, host authority and lost layout', async t => {
  let builds=0;const bridge=await mockBridge(t,{}, {compile:async()=>{builds++;return {bytes:classicPEFixture()};}});
  for(const [headers,status] of [[{Origin:'https://evil.test'},403],[{Authorization:'Bearer wrong'},401],[{'Content-Type':'text/plain'},415]]) {
    assert.equal((await post(bridge,{method:'capabilities'},headers)).status,status);
  }
  const wrongHost = await new Promise((resolve, reject) => {const request = http.request(bridge.url, {method:'POST', headers:{Host:'evil.test',Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'}}, response => {response.resume();resolve(response.statusCode);}); request.on('error', reject);request.end(JSON.stringify({method:'capabilities'}));});
  assert.equal(wrongHost,403);
  assert.equal((await fetch(bridge.url,{headers:{Origin:origin}})).status,405);
  for(const body of [{method:'run'},{method:'build',project:newProject(),compiler:'evil.exe'},{method:'build',project:newProject(),options:{compiler:'evil.exe'}}]) assert.equal((await post(bridge,body)).status,400);
  const project=newProject();project.settings.anchoring=true;
  const failed=await post(bridge,{method:'build',project});assert.equal(failed.status,400);assert.match((await failed.json()).error.message,/anchoring/);
  assert.equal(builds,0);
  const preflight=await fetch(bridge.url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal((await fetch(bridge.url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'DELETE'}})).status,403);
});
test('bridge consent denial never invokes compiler', async t => {
  let builds=0;const bridge=await mockBridge(t,{authorize:async()=>false},{compile:async()=>{builds++;return {bytes:classicPEFixture()};}});
  const result=await post(bridge,{method:'build',project:newProject()});
  assert.equal(result.status,403);assert.equal((await result.json()).error.code,'CONSENT_DENIED');assert.equal(builds,0);
});
test('bridge cancellation aborts compiler and rejects concurrent work', async t => {
  let entered, aborted;const started=new Promise(r=>entered=r),stopped=new Promise(r=>aborted=r);
  const bridge=await mockBridge(t,{}, {compile:async(_prepared,{signal})=>{
    entered();await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{aborted();reject(new Error('cancelled'));},{once:true});});
  }});
  const controller=new AbortController();
  const pending=fetch(bridge.url,{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({method:'build',project:newProject()}),signal:controller.signal});
  await started;
  assert.equal((await post(bridge,{method:'build',project:newProject()})).status,409);
  controller.abort();await assert.rejects(pending);await stopped;
});
test('missing compiler and invalid output are never executable responses', async t => {
  const unavailable=await mockBridge(t,{compiler:path.join(os.tmpdir(),'no-VB6.EXE')});
  const cap=await (await post(unavailable,{method:'capabilities'})).json();assert.equal(cap.result.available,false);
  assert.equal((await post(unavailable,{method:'build',project:newProject()})).status,503);
  const bridge=await mockBridge(t,{}, {compile:async()=>({bytes:classicPEFixture('KERNEL32.dll')})});
  const result=await post(bridge,{method:'build',project:newProject()});assert.equal(result.status,400);
  assert.match((await result.json()).error.message,/MSVBVM60/);
});
test('host compile stages original bytes, uses fresh output and always removes temporary files', async () => {
  const prepared=prepareClassicProject(newProject('Runtime'));let stage;
  const result=await compileClassicProject(prepared,{compiler:process.execPath,runner:async(_compiler,args,options)=>{
    stage=path.dirname(args[3]);assert.equal(options.cwd,path.dirname(args[1]));
    assert.match(await fs.readFile(args[1],'utf8'),/ExeName32="Runtime.exe"/);
    await fs.writeFile(path.join(args[5],'Runtime.exe'),classicPEFixture());return {code:0};
  }});
  assert.equal(result.report.compiled,true);await assert.rejects(fs.stat(stage),{code:'ENOENT'});
  await assert.rejects(compileClassicProject(prepared,{compiler:process.execPath,runner:async(_compiler,args)=>{
    stage=path.dirname(args[3]);await fs.writeFile(args[3],'Missing registered dependency');return {code:1};
  }}),error=>error.compilerLog==='Missing registered dependency');
  await assert.rejects(fs.stat(stage),{code:'ENOENT'});
  await assert.rejects(compileClassicProject(prepared,{compiler:process.execPath,runner:async(_compiler,args)=>{stage=path.dirname(args[3]);return {code:0};}}),/fresh executable/);
  await assert.rejects(fs.stat(stage),{code:'ENOENT'});
});
test('compiler process abort works before spawn and during execution', async () => {
  const before=new AbortController();before.abort();
  await assert.rejects(runCompiler(process.execPath,['-e','process.exit(9)'],{signal:before.signal}));
  const during=new AbortController();
  const pending=runCompiler(process.execPath,['-e','setInterval(()=>{},500)'],{timeout:10000,signal:during.signal});
  setTimeout(()=>during.abort(),75);
  await assert.rejects(pending,/cancelled/);
});
test('client fails closed on non-EXE, corrupt digest, protocol mismatch and oversize responses', async () => {
  for (const mode of ['json','runtime','digest','size']) {
    const client=new ClassicCompilerClient(async(_url,options)=>{
      const body=JSON.parse(options.body);if(body.method==='capabilities')return response({result:caps});
      if(mode==='json')return response({result:{compiled:true}});
      const bytes=classicPEFixture(mode==='runtime'?'KERNEL32.dll':'MSVBVM60.DLL');
      return new Response(bytes,{headers:{'content-type':'application/vnd.microsoft.portable-executable','x-vb6-target':'classic-vb6','x-vb6-sha256':'0'.repeat(64),...(mode==='size'?{'content-length':'999999999'}:{})}});
    });
    await client.connect('http://127.0.0.1:8768/classic',token);await assert.rejects(client.build(newProject()));client.disconnect();
  }
  const wrong=new ClassicCompilerClient(async()=>response({result:{...caps,version:42}}));
  await assert.rejects(wrong.connect('http://127.0.0.1:8768/classic',token),/Incompatible/);assert.equal(wrong.connected,false);
});
test('extracted build archive runs independently and preserves source encoding', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'classic-archive-'));
  try {
    const project=newProject('Runtime');project.modules[0].form.properties.Caption='Café €';
    const before=JSON.stringify(project), archive=exportClassicArchive(project,{codegen:'pcode'});
    for(const [name,bytes] of Object.entries(archive.files)){const target=path.join(dir,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}
    assert.equal(JSON.stringify(project),before);assert.equal(archive.manifest.compiled,false);
    assert.ok(Buffer.from(archive.files['source/Form1.frm']).includes(Buffer.from('Caf\xe9 \x80','latin1')));
    const syntax=spawnSync(process.execPath,['--check',path.join(dir,'build.mjs')],{encoding:'utf8'});assert.equal(syntax.status,0,syntax.stderr);
    const help=spawnSync(process.execPath,[path.join(dir,'build.mjs'),'--help'],{cwd:os.tmpdir(),encoding:'utf8'});assert.equal(help.status,0,help.stderr);assert.match(help.stdout,/licensed VB6/);
    if(process.platform!=='win32'){const run=spawnSync(process.execPath,[path.join(dir,'build.mjs')],{encoding:'utf8'});assert.equal(run.status,1);assert.match(run.stderr,/requires Windows/);}
    assert.ok(!Object.keys(archive.files).some(name=>/\.(dll|exe|ocx)$/i.test(name)));
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('strict bridge settings reject unbounded compiler authority', async () => {
  for(const options of [{token:'short'},{port:65536},{timeout:0},{origins:['https://site.test/path']}]) await assert.rejects(createClassicBridge(options));
  assert.throws(()=>prepareClassicBuildRequest({method:'build',project:newProject(),out:'C:\\Windows'}));
});

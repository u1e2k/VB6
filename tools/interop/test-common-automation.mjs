/** Same recipes against the portable adapter and installed Windows COM classes.
 * Real HTTP comparison is mandatory. A policy-blocked ADO class is reported as
 * unavailable, never as native stream agreement; its killbit is not bypassed. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {NativeAutomationClient} from './native-automation.mjs';
import {createCommonAutomationRegistry} from '../../src/automation/common-objects.js';
import {HttpTransport} from '../../src/automation/http-transport.js';
import {commonRecipes,nativeStreamPolicyBlock} from '../../tests/fixtures/common-automation-recipes.mjs';
if(process.platform!=='win32')throw Error('This native differential test requires Windows; no native pass was obtained.');
const architecture=process.env.VB6_COM_ARCH||'x86',checks=[],snapshots={},differences=[],report={architecture,status:'failed',checks,snapshots,differences};
const names=['ADODB.Stream','MSXML2.ServerXMLHTTP.6.0','WinHttp.WinHttpRequest.5.1'];
const client=new NativeAutomationClient({allowed:names,allowNativeCode:true,architecture}),transport=new HttpTransport();
const native=client.registry().createSession(),portable=createCommonAutomationRegistry({transport}).createSession();
const server=http.createServer(async(req,res)=>{const parts=[];for await(const p of req)parts.push(p);res.setHeader('X-Common-Contract','value');res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(req.url==='/echo'?Buffer.concat(parts):'HTTP Żółć');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;

try{
  await client.start();
  report.streamOracle={status:'available',nativeComparisons:0,blockedRecipes:[]};
  for(const [name,recipe]of Object.entries(commonRecipes)){
    const row=snapshots[name]={};let nativeError;
    for(const [kind,session]of [['native',native],['portable',portable]])try{row[kind]=await recipe(session,url);}catch(error){row[kind]={error:error.number||null,hresult:error.hresult??null,message:error.message};if(kind==='native')nativeError=error;}
    if(name!=='http'&&nativeStreamPolicyBlock(nativeError)){
      // A disabled Windows class is not a conformance result. Preserve the OS guard,
      // record the missing oracle explicitly, and still require the HTTP comparison.
      report.streamOracle.status='blocked-by-native-policy';report.streamOracle.blockedRecipes.push(name);
      assert(!Object.hasOwn(row.portable,'error'),'Portable recipe failed: '+name);
      continue;
    }
    try{assert.deepEqual(row.portable,row.native);assert(!nativeError,'Native recipe did not execute: '+name);checks.push(name);if(name!=='http')report.streamOracle.nativeComparisons++;}catch{differences.push(name);}
  }
  assert(checks.includes('http'),'Real MSXML and WinHTTP requests must execute and match');
  if(report.streamOracle.blockedRecipes.length)checks.push('native ADO Stream killbit enforced; stream oracle unavailable, not a parity pass');
  report.nativeStreamConformance=report.streamOracle.nativeComparisons===Object.keys(commonRecipes).length-1;
  assert.deepEqual(differences,[],'Portable/native common Automation differences: '+differences.join(', '));report.status='passed';
}catch(error){report.error=error.stack||error.message;process.exitCode=1;}
finally{await native.close();await portable.close();transport.close();await client.close();await new Promise(r=>server.close(r));await fs.mkdir('reports/native-interop',{recursive:true});await fs.writeFile(`reports/native-interop/common-${architecture}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}

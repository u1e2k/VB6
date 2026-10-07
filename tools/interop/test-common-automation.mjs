/** Same recipes against the portable adapter and installed Windows COM classes.
 * The native run is mandatory on Windows CI; Linux does not count as a pass. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {NativeAutomationClient} from './native-automation.mjs';
import {createCommonAutomationRegistry} from '../../src/automation/common-objects.js';
import {HttpTransport} from '../../src/automation/http-transport.js';
import {automationInvoke} from '../../src/runtime/automation.js';
import {VBArray,unbox} from '../../src/runtime/values.js';
if(process.platform!=='win32')throw Error('This native differential test requires Windows; no native pass was obtained.');
const architecture=process.env.VB6_COM_ARCH||'x86',checks=[],snapshots={},differences=[],report={architecture,status:'failed',checks,snapshots,differences};
const names=['ADODB.Stream','MSXML2.ServerXMLHTTP.6.0','WinHttp.WinHttpRequest.5.1'];
const client=new NativeAutomationClient({allowed:names,allowNativeCode:true,architecture}),transport=new HttpTransport();
const native=client.registry().createSession(),portable=createCommonAutomationRegistry({transport}).createSession();
const normalize=v=>v instanceof VBArray?{type:v.type,bounds:v.bounds,data:v.data.map(unbox)}:unbox(v);
const invoke=async(o,n,mode=1,args=[])=>normalize(await automationInvoke(o,n,mode,args));
const get=(o,n)=>invoke(o,n,2),set=(o,n,v)=>invoke(o,n,4,[v]);
const server=http.createServer(async(req,res)=>{const parts=[];for await(const p of req)parts.push(p);res.setHeader('X-Common-Contract','value');res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(req.url==='/echo'?Buffer.concat(parts):'HTTP Żółć');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
const recipes={
  defaults:async s=>{const o=await s.create('ADODB.Stream');return {type:await get(o,'Type'),mode:await get(o,'Mode'),charset:await get(o,'Charset'),line:await get(o,'LineSeparator'),state:await get(o,'State')};},
  utf8:async s=>{const o=await s.create('ADODB.Stream');await set(o,'Charset','utf-8');await invoke(o,'Open');await invoke(o,'WriteText',1,['first',1]);await invoke(o,'WriteText',1,['Żółć']);const size=await get(o,'Size');await set(o,'Position',0);const first=await invoke(o,'ReadText',1,[-2]),position=await get(o,'Position'),rest=await invoke(o,'ReadText');return {size,first,position,rest,eos:await get(o,'EOS')};},
  unicode:async s=>{const o=await s.create('ADODB.Stream');await invoke(o,'Open');await invoke(o,'WriteText',1,['A日本']);await set(o,'Position',0);const a=await invoke(o,'ReadText',1,[1]),position=await get(o,'Position'),rest=await invoke(o,'ReadText');return {a,position,rest,size:await get(o,'Size')};},
  zeroRead:async s=>{const o=await s.create('ADODB.Stream');await set(o,'Charset','utf-8');await invoke(o,'Open');await invoke(o,'WriteText',1,['abc']);await set(o,'Position',0);const value=await invoke(o,'ReadText',1,[0]);return {value,position:await get(o,'Position'),rest:await invoke(o,'ReadText'),eof:await invoke(o,'ReadText')};},
  embeddedBom:async s=>{const o=await s.create('ADODB.Stream');await set(o,'Charset','utf-8');await invoke(o,'Open');await invoke(o,'WriteText',1,['\ufeffdata']);await set(o,'Position',0);return {value:await invoke(o,'ReadText'),position:await get(o,'Position')};},
  astral:async s=>{const o=await s.create('ADODB.Stream');await set(o,'Charset','utf-8');await invoke(o,'Open');await invoke(o,'WriteText',1,['😀Z']);await set(o,'Position',0);const value=await invoke(o,'ReadText',1,[1]),position=await get(o,'Position');let rest;try{rest=await invoke(o,'ReadText');}catch(error){rest={error:error.number};}return {value,position,rest};},
  binaryEmpty:async s=>{const o=await s.create('ADODB.Stream');await set(o,'Type',1);await invoke(o,'Open');return {value:await invoke(o,'Read'),zero:await invoke(o,'Read',1,[0]),size:await get(o,'Size')};},
  copy:async s=>{const a=await s.create('ADODB.Stream'),b=await s.create('ADODB.Stream');for(const o of [a,b]){await set(o,'Charset','utf-8');await invoke(o,'Open');}await invoke(a,'WriteText',1,['abcd']);await invoke(b,'WriteText',1,['long tail']);await set(a,'Position',0);await set(b,'Position',0);await invoke(a,'CopyTo',1,[b,2]);const position=await get(a,'Position');await set(b,'Position',0);return {position,text:await invoke(b,'ReadText'),size:await get(b,'Size')};},
  http:async s=>{const results=[];for(const name of names.slice(1)){const o=await s.create(name);await invoke(o,'open',1,['GET',url+'/text',false]);await invoke(o,'send');results.push({status:await get(o,'status'),text:await get(o,'responseText'),body:await get(o,'responseBody'),header:await invoke(o,'getResponseHeader',1,['X-Common-Contract'])});await invoke(o,'open',1,['POST',url+'/echo',false]);await invoke(o,'send',1,['body']);results.push(await get(o,'responseText'));}return results;}
};
try{
  await client.start();
  for(const [name,recipe]of Object.entries(recipes)){
    const row=snapshots[name]={};for(const [kind,session]of [['native',native],['portable',portable]])try{row[kind]=await recipe(session);}catch(error){row[kind]={error:error.number||null,message:error.message};}
    try{assert.deepEqual(row.portable,row.native);checks.push(name);}catch{differences.push(name);}
  }
  assert.deepEqual(differences,[],'Portable/native common Automation differences: '+differences.join(', '));report.status='passed';
}catch(error){report.error=error.stack||error.message;process.exitCode=1;}
finally{await native.close();await portable.close();transport.close();await client.close();await new Promise(r=>server.close(r));await fs.mkdir('reports/native-interop',{recursive:true});await fs.writeFile(`reports/native-interop/common-${architecture}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}

import test from 'node:test';
import assert from 'node:assert/strict';
import {HttpTransport,responseBytes} from '../src/automation/http-transport.js';
import {HttpRequest} from '../src/automation/http-request.js';
import {createCommonAutomationRegistry,COMMON_HTTP_CLASSES} from '../src/automation/common-objects.js';
import {AdoStream} from '../src/automation/ado-stream.js';
import {automationInvoke,automationSubscribe,AutomationRegistry} from '../src/runtime/automation.js';
import {VirtualMachine} from '../src/runtime/vm.js';
import {compileProject} from '../src/language/compiler.js';
import {VirtualFileSystem} from '../src/runtime/filesystem.js';
import {VBArray,unbox,scalarType} from '../src/runtime/values.js';
const fail=n=>e=>e.number===n;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function run(code,host={}){
 const output=[],program=compileProject({name:'Common',startup:'Sub Main',modules:[{name:'M',kind:'module',code:'Option Explicit\nSub Main()\n'+code+'\nEnd Sub'}]});assert.deepEqual(program.diagnostics,[]);
 const vm=new VirtualMachine(program,{...host,print:s=>output.push(s)});try{await vm.start();return output;}finally{vm.stop();await Promise.all([vm.dataClose,vm.automationClose]);}
}
test('compiled synchronous ServerXMLHTTP pattern from the transcript works through shared dataFetch',async()=>{
 const calls=[];const out=await run(`Dim h As Object
Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
h.setTimeouts 3000, 3000, 5000, 5000
h.Open "GET", "https://news.test/v0/topstories.json", False
h.send
Debug.Print h.Status, h.responseText, h.readyState, VarType(h.status)
h.Open "GET", "https://news.test/v0/item/101.json", False
h.send
Debug.Print h.responseText`,{dataFetch:async(url,options)=>{calls.push({url,options});return new Response(url.includes('topstories')?'[101]':'{"title":"Live shape"}');}});
 assert.deepEqual(out,['200 [101] 4 3','{"title":"Live shape"}']);assert.equal(calls.length,2);assert(calls.every(c=>c.options.redirect==='error'&&c.options.credentials==='omit'));
});
test('compiled responseBody passes as Byte SAFEARRAY into ADODB.Stream and virtual file storage',async()=>{
 const fs=new VirtualFileSystem(),out=await run(`Dim h As Object, s As Object, b() As Byte
Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
h.Open "GET", "https://news.test/text", False
h.send
b = h.responseBody
Debug.Print VarType(b), LBound(b), UBound(b)
Set s = CreateObject("ADODB.Stream")
s.Type = adTypeBinary
s.Open
s.Write b
s.Position = 0
s.Type = adTypeText
s.Charset = "utf-8"
Debug.Print s.ReadText
s.SaveToFile "/download.txt", adSaveCreateOverWrite
s.Close`,{fs,dataFetch:async()=>new Response('Żółć')});
 assert.deepEqual(out,['8209 0 7','Żółć']);assert.equal(new TextDecoder().decode(fs.readBytes('/download.txt')),'Żółć');
});
test('every registered HTTP ProgID creates a usable independent Automation object',async()=>{
 const transport=new HttpTransport({fetch:async()=>new Response('ok')}),s=createCommonAutomationRegistry({transport}).createSession();
 try{for(const name of Object.keys(COMMON_HTTP_CLASSES)){const o=await s.create(name.toUpperCase());await automationInvoke(o,'open',1,['GET','https://example.test/',false]);await automationInvoke(o,'send',1,[]);assert.equal(unbox(await automationInvoke(o,'status',2)),200);}}finally{await s.close();transport.close();}
});
test('explicit host Automation registry wins over portable factories',async()=>{
 let released=0;const registry=new AutomationRegistry().register('ADODB.Stream',()=>({metadata:{members:[{name:'State',modes:[2],params:[]}]},invoke:()=>({value:77}),release:()=>released++}));
 assert.deepEqual(await run('Dim s As Object\nSet s = CreateObject("ADODB.Stream")\nDebug.Print s.State',{automation:registry}),['77']);assert.equal(released,1);
});
test('async send returns before response, wait timeout does not abort, later wait succeeds',async()=>{
 let complete;const transport=new HttpTransport({fetch:()=>new Promise(r=>complete=r)}),h=new HttpRequest({transport});
 try{await h.open('GET','https://example.test/',true);assert.equal(h.send(),undefined);assert.equal(await h.waitForResponse(0.001),false);assert.equal(h.readyState,1);complete(new Response('done'));assert.equal(await h.waitForResponse(),true);assert.equal(h.responseText,'done');}finally{h.dispose();transport.close();}
});
test('WinHTTP async notifications arrive in order and expose copied response data',async()=>{
 const transport=new HttpTransport({fetch:async()=>new Response('abc',{headers:{'Content-Type':'text/plain'}})}),session=createCommonAutomationRegistry({transport}).createSession(),events=[];
 try{const h=await session.create('WinHttp.WinHttpRequest.5.1');automationSubscribe(h,(name,args)=>events.push({name,args}));await automationInvoke(h,'open',1,['GET','https://example.test/',true]);await automationInvoke(h,'send',1);await automationInvoke(h,'waitForResponse',1);await pause(0);assert.deepEqual(events.map(e=>e.name),['OnResponseStart','OnResponseDataAvailable','OnResponseFinished']);assert(events[1].args[0] instanceof VBArray);assert.equal(events[0].args[0],200);}finally{await session.close();transport.close();}
});
test('HTTP status codes remain readable rather than being mistaken for transport failures',async()=>{
 const transport=new HttpTransport({fetch:async()=>new Response('missing',{status:404,statusText:'Not Found'})}),h=new HttpRequest({transport});
 try{assert.throws(()=>h.status,fail(-2147483638));await h.open('GET','https://example.test/',false);await h.send();assert.equal(h.status,404);assert.equal(h.statusText,'Not Found');assert.equal(h.responseText,'missing');}finally{h.dispose();transport.close();}
});
test('reopening aborts stale I/O and a late old response cannot replace the new response',async()=>{
 const responses=[],transport=new HttpTransport({fetch:()=>new Promise(r=>responses.push(r))}),h=new HttpRequest({transport});
 try{await h.open('GET','https://example.test/old',true);h.send();const old=h.pending;await h.open('GET','https://example.test/new',true);h.send();responses[1](new Response('new'));await h.waitForResponse();responses[0](new Response('old'));await assert.rejects(old,fail(-2147467260));await pause(0);assert.equal(h.responseText,'new');}finally{h.dispose();transport.close();}
});
test('receive-idle timeout rejects even when a response body never yields',async()=>{
 let cancelled=false;const transport=new HttpTransport({fetch:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}))}),h=new HttpRequest({transport});
 try{h.setTimeouts(0,0,0,10);await h.open('GET','https://example.test/',false);await assert.rejects(h.send(),fail(-2147012894));assert(cancelled);assert.equal(transport.pending.size,0);}finally{h.dispose();transport.close();}
});
test('header timeout rejects a fetch implementation that ignores AbortSignal',async()=>{
 const transport=new HttpTransport({fetch:()=>new Promise(()=>{})}),h=new HttpRequest({transport});
 try{h.setTimeouts(0,10,0,0);await h.open('GET','https://example.test/',false);await assert.rejects(h.send(),fail(-2147012894));}finally{h.dispose();transport.close();}
});
test('network failure is catchable from compiled VB On Error',async()=>{
 assert.deepEqual(await run(`Dim h As Object
Set h = CreateObject("WinHttp.WinHttpRequest.5.1")
h.Open "GET", "https://example.test/", False
On Error Resume Next
h.Send
Debug.Print Err.Number <> 0`,{dataFetch:async()=>{throw Error('network');}}),['True']);
});
test('host HTTP policy denial blocks both COM and DataContext network access',async()=>{
 let calls=0;const transport=new HttpTransport({fetch:async()=>{calls++;return new Response('ok');},authorize:()=>false}),h=new HttpRequest({transport});
 try{await h.open('GET','https://example.test/',false);await assert.rejects(h.send(),fail(70));assert.equal(calls,0);}finally{h.dispose();transport.close();}
});
test('HTTP rejects browser-controlled headers, credential URLs and unsupported native options',async()=>{
 const transport=new HttpTransport({fetch:async()=>new Response('ok')}),h=new HttpRequest({transport});
 try{await assert.rejects(h.open('GET','https://user:password@example.test/'),fail(70));await h.open('GET','https://example.test/',false);for(const name of ['Cookie','Host','Sec-Fetch-Site','Proxy-Authorization','Content-Length'])assert.throws(()=>h.setRequestHeader(name,'x'),fail(70));assert.throws(()=>h.setRequestHeader('X-Test','a\r\nsecret'),fail(5));assert.throws(()=>h.setProxy(2,'proxy'),fail(3251));assert.throws(()=>h.setOption(2,13056),fail(3251));assert.throws(()=>h.send({}),fail(13));assert.throws(()=>h.send('body'),fail(5));assert.equal(transport.pending.size,0);}finally{h.dispose();transport.close();}
});
test('response byte bounds reject advertised and streaming overflow, cancelling the reader',async()=>{
 await assert.rejects(responseBytes(new Response('abc',{headers:{'Content-Length':'3'}}),2),fail(7));let cancelled=false;
 const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(3));},cancel(){cancelled=true;}});await assert.rejects(responseBytes(new Response(stream),2),fail(7));assert(cancelled);
});
test('released HTTP objects reject subsequent calls and session close cancels outstanding sends',async()=>{
 let signal;const transport=new HttpTransport({fetch:(url,options)=>{signal=options.signal;return new Promise(()=>{});}}),s=createCommonAutomationRegistry({transport}).createSession();
 const h=await s.create('MSXML2.ServerXMLHTTP.6.0');await automationInvoke(h,'open',1,['GET','https://example.test/',true]);await automationInvoke(h,'send',1);await s.close();assert(signal.aborted);await assert.rejects(automationInvoke(h,'status',2),fail(91));transport.close();
});
test('responseStream is session-owned, stable per response and independent across subsequent requests',async()=>{
 const transport=new HttpTransport({fetch:async(url)=>new Response(url.endsWith('/a')?'first':'second')}),s=createCommonAutomationRegistry({transport}).createSession();
 try{const h=await s.create('MSXML2.ServerXMLHTTP.6.0');await automationInvoke(h,'open',1,['GET','https://example.test/a',false]);await automationInvoke(h,'send',1);const stream=await automationInvoke(h,'responseStream',2);assert.equal(await automationInvoke(h,'responseStream',2),stream);await automationInvoke(h,'open',1,['GET','https://example.test/b',false]);await automationInvoke(h,'send',1);const bytes=await automationInvoke(stream,'Read',1);assert.equal(new TextDecoder().decode(Uint8Array.from(bytes.data)),'first');}finally{await s.close();transport.close();}
});
test('ADO Stream UTF-8 BOM removal recipe, line reads and SaveToFile use the VM filesystem',async()=>{
 const fs=new VirtualFileSystem(),out=await run(`Dim s As Object, b As Object
Set s = CreateObject("ADODB.Stream")
s.Charset = "utf-8"
s.Open
s.WriteText "first", adWriteLine
s.WriteText "second"
s.Position = 0
Debug.Print s.ReadText(adReadLine), s.ReadText
s.Position = 0
s.Type = adTypeBinary
s.Position = 3
Set b = CreateObject("ADODB.Stream")
b.Type = adTypeBinary
b.Open
s.CopyTo b
b.SaveToFile "/plain.txt"
Debug.Print b.Position, b.Size
s.Close
b.Close`,{fs});
 assert.deepEqual(out,['first second','0 13']);assert.equal(new TextDecoder().decode(fs.readBytes('/plain.txt')),'first\r\nsecond');
});
test('ADO Stream binary writes, shrink/regrow and read copies do not alias',()=>{
 const s=new AdoStream();s.Type=1;return s.Open().then(()=>{s.Write(new Uint8Array([1,2]));s.Position=4;s.Write(new Uint8Array([7]));s.Position=1;s.SetEOS();s.Position=4;s.SetEOS();s.Position=0;const result=s.Read();assert.deepEqual(result.data,[1,0,0,0]);result.data[0]=99;s.Position=0;assert.equal(s.Read(1).data[0],1);s.Close();});
});
test('ADO Stream virtual file overwrite rules are atomic and independent of host disk',async()=>{
 const fs=new VirtualFileSystem(),s=new AdoStream({fs});s.Type=1;await s.Open();s.Write(new Uint8Array([7]));s.SaveToFile('/test');s.Position=0;s.Write(new Uint8Array([8]));assert.throws(()=>s.SaveToFile('/test'),fail(58));assert.equal(fs.readBytes('/test')[0],7);s.SaveToFile('/test',2);assert.equal(fs.readBytes('/test')[0],8);assert.equal(s.Position,0);s.Close();
});
test('Stream.Close cancels pending URL load even when fetch ignores abort',async()=>{
 const transport=new HttpTransport({fetch:()=>new Promise(()=>{})}),s=new AdoStream({transport});const loading=s.Open('https://example.test/');s.Close();await assert.rejects(loading);assert.equal(s.State,0);transport.close();
});

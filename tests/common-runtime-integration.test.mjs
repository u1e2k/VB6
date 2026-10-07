import test from 'node:test';
import assert from 'node:assert/strict';
import {CommonAutomation} from '../src/automation/index.js';
import {VirtualMachine} from '../src/runtime/vm.js';
import {compileProject} from '../src/language/compiler.js';
import {automationInvoke,unbox} from '../packages/automation/index.js';
const program=code=>compileProject({name:'Integration',startup:'Sub Main',modules:[{name:'M',kind:'module',code:'Option Explicit\nSub Main()\n'+code+'\nEnd Sub'}]});
test('VM host policy protects built-in COM requests without bypassing shared data transport',async()=>{
 let calls=0;const out=[],vm=new VirtualMachine(program('Dim h As Object\nSet h = CreateObject("MSXML2.ServerXMLHTTP.6.0")\nh.Open "GET", "https://test.example/", False\nOn Error Resume Next\nh.Send\nDebug.Print Err.Number'),{dataFetch:async()=>{calls++;return new Response('no');},dataHttpAuthorize:()=>false,print:v=>out.push(v)});
 try{await vm.start();assert.deepEqual(out,['70']);assert.equal(calls,0);}finally{vm.stop();await vm.dataClose;}
});
test('host can disable portable factories without disabling DataEnvironment or native grants',async()=>{
 const vm=new VirtualMachine(program(''),{commonAutomation:false});try{assert(vm.data.environment());await assert.rejects(vm.createObject('ADODB.Stream'),e=>e.number===429);}finally{vm.stop();await vm.dataClose;}
});
test('text stream EOF stays Null across the package and VM adapter',async()=>{
 const {HttpTransport,createCommonAutomationRegistry}=CommonAutomation,transport=new HttpTransport(),session=createCommonAutomationRegistry({transport}).createSession();
 try{const s=await session.create('ADODB.Stream');await automationInvoke(s,'Open',1);assert.equal(await automationInvoke(s,'ReadText',1),null);assert.equal(unbox(await automationInvoke(s,'ReadText',1,[0])),'');}finally{await session.close();transport.close();}
});
test('WinHTTP accepts minus-one infinite timeout components',()=>{const h=new CommonAutomation.HttpRequest({transport:new CommonAutomation.HttpTransport(),kind:'winhttp'});try{h.setTimeouts(-1,-1,-1,-1);assert.deepEqual(h.timeouts,[0,0,0,0]);assert.throws(()=>h.setTimeouts(-2,1,1,1));}finally{h.dispose();}});
test('a response stream with stuck cancel cannot defeat the receive timeout',async()=>{
 const transport=new CommonAutomation.HttpTransport({fetch:async()=>new Response(new ReadableStream({cancel:()=>new Promise(()=>{})}))});
 try{await assert.rejects(transport.request('https://test.example/',{timeout:25}),e=>e.number===-2147467260);assert.equal(transport.pending.size,0);}finally{transport.close();}
});

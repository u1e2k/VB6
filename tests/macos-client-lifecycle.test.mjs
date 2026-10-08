import test from 'node:test';
import assert from 'node:assert/strict';
import {MacOSCompilerClient} from '../packages/macos-native/src/client.js';

const endpoint='http://127.0.0.1:8769/macos',token='d'.repeat(64);
const capabilities={version:1,target:'macos-arm64',arch:'arm64',runtime:'AppKit',available:true,timeout:1000};
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function bounded(task){
  let timer;
  try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('client failed to settle after cancellation')),2000);})]);}
  finally{clearTimeout(timer);}
}

test('native client aborts a pending fetch even when an injected transport ignores its signal',async()=>{
  const fetch=deferred(),started=deferred(),abort=new AbortController();
  const client=new MacOSCompilerClient(()=>{started.resolve();return fetch.promise;});
  const pending=client.connect(endpoint,token,{signal:abort.signal});
  const rejected=assert.rejects(pending,error=>error.name==='AbortError');
  await started.promise;abort.abort();
  try{await bounded(rejected);assert.equal(client.connected,false);}
  finally{client.disconnect();fetch.reject(new Error('late transport failure'));}
});

test('disconnect cancels a stalled response without waiting for a non-cooperative stream cancel hook',async()=>{
  const reading=deferred();let cancelled=false;
  const body=new ReadableStream({
    pull(){reading.resolve();return new Promise(()=>{});},
    cancel(){cancelled=true;return new Promise(()=>{});}
  },{highWaterMark:0});
  const response=new Response(body,{headers:{'content-type':'application/json'}});
  const client=new MacOSCompilerClient(async()=>response);
  const pending=client.connect(endpoint,token),rejected=assert.rejects(pending,error=>error.name==='AbortError');
  await reading.promise;client.disconnect();
  await bounded(rejected);assert.equal(cancelled,true);assert.equal(body.locked,false);
});

test('native client rejects an oversized response immediately even if cancellation never settles',async()=>{
  let cancelled=false;
  const body=new ReadableStream({cancel(){cancelled=true;return new Promise(()=>{});}});
  const client=new MacOSCompilerClient(async()=>new Response(body,{headers:{'content-type':'application/json','content-length':'999999999'}}));
  try{await bounded(assert.rejects(client.connect(endpoint,token),/size limit/));assert.equal(cancelled,true);}
  finally{client.disconnect();}
});

test('a replacement connection discards an old late response and retains only its own capabilities',async()=>{
  const first=deferred();let calls=0,discarded=false;
  const client=new MacOSCompilerClient(()=>++calls===1?first.promise:Promise.resolve(json({result:capabilities})));
  const old=client.connect(endpoint,token),rejected=assert.rejects(old,error=>error.name==='AbortError');
  try{
    await client.connect(endpoint,token);
    await bounded(rejected);
    first.resolve(new Response(new ReadableStream({cancel(){discarded=true;}}),{headers:{'content-type':'application/json'}}));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(discarded,true);assert.equal(client.connected,true);
  }finally{client.disconnect();first.reject(new Error('transport closed'));}
});

test('native client rejects an advertised response length that does not match its completed body',async()=>{
  const data=JSON.stringify({result:capabilities});
  const client=new MacOSCompilerClient(async()=>new Response(data,{headers:{'content-type':'application/json','content-length':String(data.length+1)}}));
  try{await assert.rejects(client.connect(endpoint,token),/length|size/);}
  finally{client.disconnect();}
});

test('an already cancelled native connection never invokes the transport',async()=>{
  const abort=new AbortController();abort.abort();let calls=0;
  const client=new MacOSCompilerClient(async()=>{calls++;return json({result:capabilities});});
  await assert.rejects(client.connect(endpoint,token,{signal:abort.signal}),error=>error.name==='AbortError');
  assert.equal(calls,0);assert.equal(client.connected,false);
});

test('native client rejects streamed response overflow without retaining a reader lock',async()=>{
  let cancelled=false;
  const body=new ReadableStream({
    start(controller){controller.enqueue(new Uint8Array(128*1024));controller.enqueue(new Uint8Array(1));},
    cancel(){cancelled=true;}
  });
  const client=new MacOSCompilerClient(async()=>new Response(body,{headers:{'content-type':'application/json'}}));
  await assert.rejects(client.connect(endpoint,token),/size limit/);
  assert.equal(cancelled,true);assert.equal(body.locked,false);
});

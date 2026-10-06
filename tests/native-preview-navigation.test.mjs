import test from 'node:test';
import assert from 'node:assert/strict';
import {installNativePreview} from '../desktop/studio.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function setup(){
  const requests=[],events=[],frame={isConnected:true,set srcdoc(_){throw Error('Native preview must never create srcdoc');}};
  const studio={runtimeFrame:frame,stop(){events.push('stop');},status(message){events.push(message);}};
  installNativePreview(studio,{runtimeDocument(html){const pending=deferred();requests.push({...pending,html});return pending.promise;}});
  return {studio,frame,requests,events};
}
test('native preview selects its document-specific URL without a competing srcdoc load',async()=>{
  const {studio,frame,requests}=setup(),run=studio.loadRuntimeDocument(frame,'<p>preview</p>');
  assert.equal(frame.src,undefined);assert.equal(requests[0].html,'<p>preview</p>');
  requests[0].resolve('vb6://app/preview/approved');await run;assert.equal(frame.src,'vb6://app/preview/approved');
});
test('stale native preview resolution never navigates an ended run',async()=>{
  const {studio,frame,requests}=setup(),run=studio.loadRuntimeDocument(frame,'old');studio.runtimeFrame={isConnected:true};
  requests[0].resolve('vb6://app/preview/old');await run;assert.equal(frame.src,undefined);
});
test('stale native preview rejection never stops a replacement run',async()=>{
  const {studio,frame,requests,events}=setup(),run=studio.loadRuntimeDocument(frame,'old');studio.runtimeFrame={isConnected:true};
  requests[0].reject(Error('expired'));await run;assert.deepEqual(events,[]);
});
test('disconnected native preview ignores completion and failure',async()=>{
  for(const reject of [false,true]){const {studio,frame,requests,events}=setup(),run=studio.loadRuntimeDocument(frame,'old');frame.isConnected=false;
    reject?requests[0].reject(Error('expired')):requests[0].resolve('vb6://app/preview/old');await run;assert.equal(frame.src,undefined);assert.deepEqual(events,[]);}
});
test('current native preview failures stop safely and explain the failure',async()=>{
  const {studio,frame,requests,events}=setup(),run=studio.loadRuntimeDocument(frame,'html');requests[0].reject(Error('denied'));await run;
  assert.deepEqual(events,['stop','Native preview failed: denied']);assert.equal(frame.src,undefined);
});

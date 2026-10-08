import test from 'node:test';
import assert from 'node:assert/strict';
import {UIRenderer} from '../src/rendering/renderer.js';
import {normalizeRendering} from '../src/rendering/policy.js';

function renderer() {
  const r=Object.create(UIRenderer.prototype),events=[];
  Object.assign(r,{
    policy:normalizeRendering(),driver:{},atlas:{reset(){events.push('atlas')}},
    document:{dispatchEvent(e){events.push(e.type)}},view:{CustomEvent:class {constructor(type){this.type=type}}},
    renderNow(){events.push('paint')},publish(){events.push('publish')},
    getStats(){return {text:this.policy.text,pixelSnap:this.policy.pixelSnap}}
  });
  return {r,events};
}
test('unchanged rendering options retain the atlas and do not request another frame',async()=>{
  const {r,events}=renderer(),driver=r.driver;
  await r.setOptions({...r.policy,fallbacks:[...r.policy.fallbacks]});
  assert.deepEqual(events,['vb-rendering-policy']);assert.equal(r.driver,driver);
});
test('same-backend snapping updates paint before setOptions resolves without evicting text',async()=>{
  const {r,events}=renderer(),driver=r.driver;
  const stats=await r.setOptions({...r.policy,pixelSnap:false});events.push('resolved');
  assert.deepEqual(events,['vb-rendering-policy','paint','publish','resolved']);
  assert.equal(stats.pixelSnap,false);assert.equal(r.driver,driver);
});
test('same-backend text changes evict only the atlas and submit before resolving',async()=>{
  const {r,events}=renderer(),driver=r.driver;
  // Use the supported option rather than silently testing normalization to native.
  const text=normalizeRendering({text:'gpu'}).text;
  assert.notEqual(text,r.policy.text);
  const stats=await r.setOptions({...r.policy,text});
  assert.deepEqual(events,['vb-rendering-policy','atlas','paint','publish']);
  assert.equal(stats.text,text);assert.equal(r.driver,driver);
});
test('same-backend paint failure awaits ordinary ordered fallback',async()=>{
  const {r,events}=renderer();r.renderNow=()=>{throw Error('device failed')};
  r.fallback=reason=>{events.push(reason);r.ready=Promise.resolve().then(()=>events.push('recovered'))};
  await r.setOptions({...r.policy,pixelSnap:false});events.push('resolved');
  assert.deepEqual(events,['vb-rendering-policy','device failed','recovered','resolved']);
});

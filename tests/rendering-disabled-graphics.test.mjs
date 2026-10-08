import test from 'node:test';
import assert from 'node:assert/strict';
import * as diagnostics from '../src/rendering/diagnostics.js';
import {acquireWebGLContext} from '../src/rendering/context.js';
import {UIRenderer} from '../src/rendering/renderer.js';

const disabled = 'Could not create a WebGL context, VENDOR = 0xffff, DEVICE = 0xffff, GL_VENDOR = Disabled, GL_RENDERER = Disabled, Sandboxed = yes, ErrorMessage = BindToCurrentSequence failed: .';
const environment = {secureContext:true, webgpuAPI:true, nativeHostDisabled:false};
const status = {requested:'webgpu',active:'html',environment,attempts:[{backend:'webgpu',reason:'No WebGPU adapter'}]};
const measurement = {schema:1,results:[{backend:'webgpu',available:false,reason:'No WebGPU adapter'},{backend:'webgl2',available:false,reason:disabled},{backend:'canvas2d',available:true}]};

test('the reported disabled GL implementation stops futile power-hint retries', () => {
  let calls=0; const listeners=new Map();
  const canvas={addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type),getContext(){calls++;listeners.get('webglcontextcreationerror')({statusMessage:disabled});return null;}};
  assert.throws(()=>acquireWebGLContext(canvas),error=>{
    assert.equal(error.code,'BROWSER_GRAPHICS_DISABLED');assert.match(error.message,/GL_RENDERER = Disabled/);return true;
  });
  assert.equal(calls,1);assert.equal(listeners.size,0);
});

test('measurement evidence diagnoses disabled graphics even when saved policy skips WebGL2', () => {
  const result=diagnostics.graphicsDiagnosis(status,measurement);
  assert.equal(result.code,'BROWSER_GRAPHICS_DISABLED');assert.equal(result.source,'measurement');
  const advice=diagnostics.renderingAdvice(status,environment,measurement).join(' ');
  assert.match(advice,/chrome:\/\/settings\/system/);assert.match(advice,/relaunch/i);
  assert.match(advice,/cannot enable/i);assert.doesNotMatch(advice,/--enable-unsafe|--ignore-gpu/);
});

test('a null adapter or generic context failure does not prove disabled graphics', () => {
  assert.equal(diagnostics.graphicsDiagnosis(status).code,'GPU_UNAVAILABLE');
  for(const reason of ['BindToCurrentSequence failed', 'GPU disabled', 'GL_VENDOR = DisabledVendor, GL_RENDERER = Renderer']){
    const report={results:[{backend:'webgl2',available:false,reason}]};
    assert.notEqual(diagnostics.graphicsDiagnosis(status,report).code,'BROWSER_GRAPHICS_DISABLED');
  }
});

test('a recovered live GPU is not diagnosed from an older failed measurement', () => {
  for(const active of ['webgpu','webgl2']) assert.equal(diagnostics.graphicsDiagnosis({...status,active},measurement).code,'GPU_ACTIVE');
});

test('diagnostic downloads preserve policy and separate measured from active backend', () => {
  const policy={backend:'webgpu',fallbacks:['html'],text:'gpu',pixelSnap:true};
  const renderer={getStats:()=>status,policy};
  const view={isSecureContext:true,navigator:{gpu:{requestAdapter(){throw Error('unexpected probe');}}},location:{href:'private'},project:{password:'private'}};
  const report=diagnostics.createRenderingReport(renderer,view,measurement);
  assert.deepEqual(report.policy,policy);assert.deepEqual(report.candidates,['webgpu','html']);
  assert.equal(report.renderer.active,'html');assert.equal(report.measurement.results[2].available,true);
  assert.equal(report.diagnosis.code,'BROWSER_GRAPHICS_DISABLED');assert.doesNotMatch(JSON.stringify(report),/private/);
  report.policy.fallbacks.push('canvas2d');report.measurement.results[0].reason='changed';
  assert.deepEqual(policy.fallbacks,['html']);assert.equal(measurement.results[0].reason,'No WebGPU adapter');
});

test('HTML fallback does not present previous canvas timings or geometry as current', () => {
  const r=Object.create(UIRenderer.prototype);
  Object.assign(r,{view:{},policy:{backend:'webgpu',fallbacks:['html'],text:'gpu'},backend:'html',attempts:[],metrics:{frames:81,builds:[12],submissions:[6],last:{commands:1512}},driver:null});
  const result=r.getStats();
  assert.equal(result.last,null);assert.equal(result.buildP50Ms,0);assert.equal(result.submitCpuP95Ms,0);
  assert.equal(result.frames,81,'lifetime counter remains available');assert.deepEqual(result.candidates,['webgpu','html']);
});

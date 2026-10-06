import test from 'node:test';
import assert from 'node:assert/strict';
import {canReuseTextStyles} from '../src/rendering/mutations.js';
import {hasPartialAlpha, canvasBackground} from '../src/rendering/paint-compat.js';
import {UIRenderer} from '../src/rendering/renderer.js';
const parent = {nodeType: 1, closest: () => null};
const text = data => ({nodeType: 3, data});
test('visible text replacements reuse styles without assuming retained child identity', () => {
  assert.equal(canReuseTextStyles({type:'characterData',target:text('next'),oldValue:'before'},parent),true);
  assert.equal(canReuseTextStyles({type:'childList',addedNodes:[text('longer')],removedNodes:[text('short')]},parent),true);
});
test('empty, whitespace-only, missing old values and structural changes need style invalidation', () => {
  for (const before of ['', '  ', null, undefined]) assert.equal(canReuseTextStyles({type:'characterData',target:text('a'),oldValue:before},parent),false);
  for (const after of ['', '\n ']) assert.equal(canReuseTextStyles({type:'characterData',target:text(after),oldValue:'a'},parent),false);
  for (const addedNodes of [[], [{nodeType:1}], [text('a'),text('b')]]) assert.equal(canReuseTextStyles({type:'childList',addedNodes,removedNodes:[text('a')]},parent),false);
  assert.equal(canReuseTextStyles({type:'attributes'},parent),false);
});
test('direction-sensitive, stylesheet and form-default ancestors are excluded', () => {
  const record={type:'characterData',target:text('next'),oldValue:'before'};
  let selector='';assert.equal(canReuseTextStyles(record,{nodeType:1,closest:s=>(selector=s,{})}),false);
  for (const name of ['style','script','textarea','option','bdi','dir="auto"']) assert.ok(selector.includes(name));
  assert.equal(canReuseTextStyles(record,null),false);
});
test('overlay paint identifies partial alpha without rejecting transparent no-ops', () => {
  const solid={background:[0,0,0,1],borders:[],shadows:[],layers:[]};
  assert.equal(hasPartialAlpha(solid),false);
  assert.equal(hasPartialAlpha({...solid,background:[0,0,0,0]}),false);
  for (const change of [{background:[0,0,0,.5]},{borders:[{width:1,color:[1,0,0,.2]}]}, {shadows:[{color:[0,0,0,.3]}]}, {gradient:{start:[0,0,1,.1],end:[1,0,0,1]}}, {layers:[{color:[1,0,0,.4]}]}, {gradient:{start:[0,0,1,0],end:[0,0,1,1]}}]) assert.equal(hasPartialAlpha({...solid,...change}),true);
  assert.equal(hasPartialAlpha({...solid,borders:[{width:0,color:[0,0,0,.5]}]}),false);
});
test('a valid zero animation-frame handle is coalesced and cancelled', () => {
  const calls=[];const r=Object.create(UIRenderer.prototype);
  Object.assign(r,{view:{requestAnimationFrame(){calls.push('request');return 0},cancelAnimationFrame(id){calls.push(id)}},driver:{},document:{hidden:false},metrics:{invalidations:0}});
  r.invalidate();r.invalidate();assert.deepEqual(calls,['request']);r.cancelFrame();assert.deepEqual(calls,['request',0]);
  r.cancelFrame();assert.deepEqual(calls,['request',0]);r.invalidate();assert.deepEqual(calls,['request',0,'request']);
});

test('the CSS canvas uses root paint unless the body background propagates', () => {
  const white={backgroundColor:'rgb(255, 255, 255)',backgroundImage:'none'},blue={backgroundColor:'rgb(0, 0, 255)',backgroundImage:'none'};
  const clear={...white,backgroundColor:'rgba(0, 0, 0, 0)'};
  assert.deepEqual(canvasBackground(white,blue),{color:[1,1,1,1],propagated:false,native:false});
  assert.deepEqual(canvasBackground(clear,blue),{color:[0,0,1,1],propagated:true,native:false});
  assert.equal(canvasBackground(clear,{...blue,backgroundColor:'rgba(0, 0, 255, 0.5)'}).native,true);
  assert.deepEqual(canvasBackground({...clear,backgroundImage:'linear-gradient(red, blue)'},blue),{color:[0,0,0,0],propagated:false,native:true});
});

test('authored native border islands isolate raster invalidation without extra clipping',async()=>{
  const {readFile}=await import('node:fs/promises');
  const css=await readFile(new URL('../src/ide/ide.css',import.meta.url),'utf8');
  assert.match(css,/\.mdi-client,\.layout-monitor\s*\{\s*isolation:isolate;\s*\}/);
  assert.match(css,/https:\/\/www\.w3\.org\/TR\/compositing-1\/#isolation/);
});

import {redundantPointerOver} from '../src/rendering/mutations.js';
const pointer = (type, target, pointerId = 1, extra = {}) => ({type, target, pointerId, ...extra});
test('stationary repeated pointerover reuses styles without swallowing the first boundary', () => {
  const targets=new Map(),a={},b={};
  assert.equal(redundantPointerOver(pointer('pointerover',a),targets),false);
  assert.equal(redundantPointerOver(pointer('pointerover',a),targets),true);
  assert.equal(redundantPointerOver(pointer('pointerover',b),targets),false);
  assert.equal(redundantPointerOver(pointer('pointerover',a,2),targets),false);
  assert.equal(redundantPointerOver(pointer('pointerover',a,2),targets),true);
});
test('out, leave, cancel and capture changes allow a fresh same-target hover', () => {
  for(const type of ['pointerout','pointerleave','pointercancel','gotpointercapture','lostpointercapture']) {
    const targets=new Map(),a={};redundantPointerOver(pointer('pointerover',a),targets);
    assert.equal(redundantPointerOver(pointer(type,a),targets),false);
    assert.equal(targets.size,0);
    assert.equal(redundantPointerOver(pointer('pointerover',a),targets),false);
  }
});
test('shadow retargeting distinguishes open-shadow hit targets', () => {
  const targets=new Map(),host={},a={},b={};
  const event=child=>pointer('pointerover',host,1,{composedPath:()=>[child,host]});
  assert.equal(redundantPointerOver(event(a),targets),false);
  assert.equal(redundantPointerOver(event(a),targets),true);
  assert.equal(redundantPointerOver(event(b),targets),false);
});
test('touch end releases nodes, synthetic pointer storms stay bounded, unrelated input is not suppressed', () => {
  const targets=new Map(),a={};
  for(let i=0;i<100;i++)redundantPointerOver(pointer('pointerover',{},i),targets);
  assert.ok(targets.size<=32);
  redundantPointerOver(pointer('pointerover',a),targets);
  for(const type of ['pointerdown','pointerup','input','change','keydown'])assert.equal(redundantPointerOver(pointer(type,a),targets),false);
  assert.equal(redundantPointerOver(pointer('pointerup',a,1,{pointerType:'touch'}),targets),false);
  assert.equal(targets.has(1),false);
  for(const event of [null,{},pointer('pointerover',null),pointer('pointerover',a,NaN)])assert.equal(redundantPointerOver(event,targets),false);
});

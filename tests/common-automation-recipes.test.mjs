import test from 'node:test';
import assert from 'node:assert/strict';
import {commonRecipes,nativeStreamPolicyBlock,normalizeCommonValue} from './fixtures/common-automation-recipes.mjs';
import {HttpTransport,createCommonAutomationRegistry} from '../src/automation/index.js';
import {VBArray} from '../src/runtime/values.js';
const expected={defaults:{type:2,mode:0,charset:'unicode',line:-1,state:0},utf8:{size:18,first:'first',position:10,rest:'Żółć',eos:-1},unicode:{a:'A',position:4,rest:'日本',size:8},zeroRead:{value:'',position:0,rest:'abc',eof:null},embeddedBom:{value:'\ufeffdata',position:10},astral:{value:'😀',position:7,rest:'Z'},binaryEmpty:{value:null,zero:null,size:0},copy:{position:5,text:'abng tail',size:12}};
for(const [name,value]of Object.entries(expected))test('portable ADO recipe '+name,async()=>{
  const transport=new HttpTransport(),session=createCommonAutomationRegistry({transport}).createSession();
  try{assert.deepEqual(await commonRecipes[name](session),value);}finally{await session.close();transport.close();}
});
test('native oracle policy classification is exact, not a blanket error skip',()=>{
 const block={number:440,hresult:-2147024891,message:'Component is blocked by the ActiveX killbit'};assert(nativeStreamPolicyBlock(block));for(const bad of [{...block,number:429},{...block,hresult:0x80004005},{...block,message:'Activation failed'},null])assert.equal(nativeStreamPolicyBlock(bad),false);
});
test('conformance normalization folds only the VB element type name, retaining shape and data',()=>{
 const a=new VBArray([[5,6]],'Byte');a.set([5],17);assert.deepEqual(normalizeCommonValue(a),{type:'byte',bounds:[[5,6]],data:[17,0]});
});

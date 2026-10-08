import test from 'node:test';
import assert from 'node:assert/strict';
import {planNativeArguments} from '../src/native/call-plan.js';
import {parseExpression} from '../src/language/expression.js';
const rest={name:'values',type:'Variant',bounds:[],paramArray:true,byRef:false};
const signature={name:'Pack',params:[{name:'prefix',type:'Long'},rest]};
const bind=(source,sig=signature)=>planNativeArguments(sig,parseExpression(source).args);

test('ParamArray plan distinguishes an empty call from one omitted element',()=>{
 const empty=bind('Pack(1)'),hole=bind('Pack(1,,3)');
 assert.equal(empty.slots[1].omitted,false);assert.deepEqual(empty.slots[1].node.args,[]);
 assert.deepEqual(hole.slots[1].node.args.map(n=>n.kind),['missing','literal']);
});
test('ParamArray plan retains lexical order without changing formal ABI arity',()=>{
 const p=bind('Pack(Mark(1),Mark(2),Mark(3),Mark(4))');
 assert.deepEqual(p.order.map(e=>e.index),[0,1]);assert.equal(p.slots.length,2);
 assert.deepEqual(p.slots[1].node.args.map(n=>n.args[0].value),[2,3,4]);
});
test('ParamArray-only signatures accept zero, one and many elements',()=>{
 for(const source of ['Pack()','Pack(1)','Pack(1,2,3)']){
  const ast=parseExpression(source),p=planNativeArguments({name:'Pack',params:[rest]},ast.args);
  assert.equal(p.slots.length,1);assert.deepEqual(p.slots[0].node.args,ast.args);
 }
});
for(const source of ['Pack()','Pack(,2)'])test('ParamArray does not make prefix optional: '+source,()=>assert.throws(()=>bind(source),/required|not optional/));
for(const source of ['Pack(prefix:=1)','Pack(1,values:=2)','Pack(prefix:=1,values:=2)'])test('ParamArray rejects classic named-argument call: '+source,()=>assert.throws(()=>bind(source),/positional/));
for(const params of [[rest,{name:'after'}],[{name:'before',optional:true},rest],[{...rest,type:'Long'}],[{...rest,bounds:null}]])test('invalid native ParamArray signature is rejected before emission: '+JSON.stringify(params),()=>{
 assert.throws(()=>bind('Pack()', {name:'Pack',params}),/final unsized Variant array/);
});
test('ParamArray plans own their rest list and leave both inputs unchanged',()=>{
 const args=parseExpression('Pack(1,2,,3)').args,before=JSON.stringify({signature,args});
 const p=planNativeArguments(signature,args);p.slots[1].node.args.pop();assert.equal(JSON.stringify({signature,args}),before);
});

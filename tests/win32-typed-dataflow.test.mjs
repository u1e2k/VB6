import test from 'node:test';
import assert from 'node:assert/strict';
import {propagateNativeConstants} from '../src/native/dataflow.js';
import {foldNativeInteger} from '../src/native/optimizer.js';
const id=name=>({kind:'id',name}),lit=(value,valueType='long')=>({kind:'literal',value,valueType});
const assign=(name,expr)=>({op:'assign',target:id(name),expr});
const binary=(left,op,right)=>({kind:'binary',op,left,right});
const locals=new Map([['i',{type:'Integer'}],['b',{type:'Byte'}],['t',{type:'Boolean'}],['x',{type:'Long'}],['y',{type:'Long'}]]);
for(const [name,value,type]of [['i',32767,'integer'],['i',-32768,'integer'],['b',255,'byte'],['b',0,'byte'],['t',7,'boolean'],['t',0,'boolean'],['t',-7,'boolean'],['x',-2147483648,'long']])test('propagated storage type '+name+'='+value,()=>{
 const result=propagateNativeConstants([assign(name,lit(value)),assign('y',id(name))],locals);
 assert.deepEqual(result.code[1].expr,lit(type==='boolean'?(value?-1:0):value,type));
});
for(const [name,value]of [['i',32768],['i',-32769],['b',256],['b',-1]])test('out-of-range store has no successful fact '+name+'='+value,()=>{
 const code=[assign(name,lit(value)),assign('y',id(name))];assert.equal(propagateNativeConstants(code,locals).code,code);
});
test('substitution retains intermediate Integer overflow instead of widening to Long',()=>{
 const code=[assign('i',lit(32767)),assign('x',binary(id('i'),'+',lit(1,'integer'))),assign('y',id('x'))];
 const out=propagateNativeConstants(code,locals).code;
 assert.equal(out[1].expr.left.valueType,'integer');assert.equal(foldNativeInteger(out[1].expr),null);assert.equal(out[2].expr.kind,'id');
});
test('Byte bitwise results and Boolean Not retain their narrow types',()=>{
 for(const [name,value,type]of [['b',255,'byte'],['t',7,'boolean']]){
  const expr={kind:'unary',op:'not',expr:id(name)};
  const out=propagateNativeConstants([assign(name,lit(value)),assign('x',expr),assign('y',id('x'))],locals).code;
  assert.equal(out[1].expr.expr.valueType,type);assert.deepEqual(out[2].expr,lit(0));
 }
});
const diamond=(left,right)=>[
 {op:'branch',test:id('t'),target:3},assign('i',lit(left)),{op:'jump',target:4},assign('i',lit(right)),assign('x',id('i'))
];
test('forward diamonds intersect facts without changing branches or source identities',()=>{
 const code=diamond(42,42),before=structuredClone(code),out=propagateNativeConstants(code,locals).code;
 assert.deepEqual(out[4].expr,lit(42,'integer'));assert.equal(out[0],code[0]);assert.equal(out[2],code[2]);assert.deepEqual(code,before);
 assert.equal(propagateNativeConstants(diamond(42,43),locals).code[4].expr.kind,'id');
});
test('one unknown predecessor kills a join fact; a sibling cannot mutate saved facts',()=>{
 const code=[assign('i',lit(42)),{op:'branch',test:id('t'),target:4},assign('i',lit(43)),{op:'jump',target:5},assign('x',id('i')),assign('y',id('i'))];
 const out=propagateNativeConstants(code,locals).code;assert.deepEqual(out[4].expr,lit(42,'integer'));assert.equal(out[5].expr.kind,'id');
 const unknown=diamond(42,42);unknown[3]={op:'expr',expr:{kind:'call',callee:id('Unknown'),args:[]}};
 assert.equal(propagateNativeConstants(unknown,locals).code[4].expr.kind,'id');
});
test('backedges never establish a loop-carried constant',()=>{
 const code=[assign('i',lit(1)),assign('x',id('i')),assign('i',binary(id('i'),'+',lit(1,'integer'))),{op:'branch',test:id('t'),target:1},assign('y',id('i'))];
 const out=propagateNativeConstants(code,locals).code;assert.equal(out[1].expr.kind,'id');assert.equal(out[4].expr.kind,'id');
});
test('same-typed ByRef arguments, static storage and complex flow remain conservative',()=>{
 for(const name of ['i','b','t']){
  const code=[assign(name,lit(1)),assign('x',id(name)),{op:'expr',expr:{kind:'call',callee:id('Remember'),args:[{kind:'group',expr:id(name)}]}}];
  assert.equal(propagateNativeConstants(code,locals).stats.constantsPropagated,0);
 }
 const code=[assign('i',lit(1)),{op:'forNext',target:0},assign('x',id('i'))];
 assert.equal(propagateNativeConstants(code,locals).code[2].expr.kind,'id');
});
test('large procedure switches to bounded basic-block state without dropping local optimizations',()=>{
 const many=new Map(Array.from({length:1500},(_,i)=>['v'+i,{type:'Integer'}]));
 const code=Array.from({length:1500},()=>({op:'lineNumber'}));
 code.push(assign('v0',lit(7)),assign('v1',id('v0')));
 assert.deepEqual(propagateNativeConstants(code,many).code.at(-1).expr,lit(7,'integer'));
});

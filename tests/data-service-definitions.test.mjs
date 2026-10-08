import test from 'node:test';
import assert from 'node:assert/strict';
import {DataContext} from '../src/data/context.js';
import {normalizeDataSources} from '../src/data/common.js';
import {compileProject} from '../src/language/compiler.js';
import {VirtualMachine} from '../src/runtime/vm.js';
const config=()=>({version:1,connections:[{name:'HackerNewsAPI',provider:'rest',baseUrl:'https://hacker-news.firebaseio.com/v0/'}],commands:[{name:'GetTopStoryIds',connection:'HackerNewsAPI',path:'topstories.json',response:'json',method:'GET'},{name:'GetStoryById',connection:'HackerNewsAPI',path:'item/{id}.json',response:'json',parameters:[{name:'id',type:'integer',required:true}]}]});
test('legacy service definitions normalize aliases and parameter types without mutating input',()=>{const value=config(),out=normalizeDataSources(value);assert.equal(out.connections[0].url,value.connections[0].baseUrl);assert(!('baseUrl' in out.connections[0]));assert.equal(out.commands[1].text,'item/{id}.json');assert.equal(out.commands[1].parameters[0].type,3);assert.equal(value.commands[1].parameters[0].type,'integer');});
for(const [name,change]of [
 ['conflicting URL aliases',d=>d.connections[0].url='https://other.test/'],
 ['missing absolute URL',d=>delete d.connections[0].baseUrl],
 ['invalid URL',d=>d.connections[0].baseUrl='not an endpoint'],
 ['conflicting command aliases',d=>d.commands[0].text='different.json'],
 ['cross origin',d=>d.commands[0].path='https://other.test/'],
 ['unsupported response',d=>d.commands[0].response='html'],
 ['unsupported method',d=>d.commands[0].method='TRACE'],
 ['unknown parameter type',d=>d.commands[1].parameters[0].type='unrecognized'],
 ['unsafe field',d=>d.commands[0].fields=[{name:'a',path:'__proto__.a'}]],
 ['stored credential',d=>d.connections[0].headers={Authorization:'secret'}]
])test('definition validation rejects '+name,()=>{const d=config();change(d);assert.throws(()=>normalizeDataSources(d));});
test('compiled VB DataEnvironment follows the exact transcript ID-list and detail sequence',async()=>{
 const calls=[],project={name:'News',startup:'Sub Main',dataSources:config(),modules:[{name:'M',kind:'module',code:`Option Explicit
Sub Main()
Dim ids As Object, item As Object
Set ids = DataEnvironment.GetTopStoryIds()
Do While Not ids.EOF
Set item = DataEnvironment.GetStoryById(CLng(ids.Fields(0).Value))
Debug.Print item.Fields("title").Value
item.Close
ids.MoveNext
Loop
ids.Close
End Sub`}]};
 const program=compileProject(project);assert.deepEqual(program.diagnostics,[]);const output=[],vm=new VirtualMachine(program,{print:v=>output.push(v),dataFetch:async(url,options)=>{calls.push({url,options});return new Response(url.endsWith('topstories.json')?'[101,102]':JSON.stringify({title:'Story '+url.split('/').at(-1),score:1,by:'author'}));}});
 try{await vm.start();assert.deepEqual(output,['Story 101.json','Story 102.json']);assert.deepEqual(calls.map(c=>c.url),['https://hacker-news.firebaseio.com/v0/topstories.json','https://hacker-news.firebaseio.com/v0/item/101.json','https://hacker-news.firebaseio.com/v0/item/102.json']);assert(calls.every(c=>c.options.redirect==='error'));}finally{vm.stop();await vm.dataClose;}
});
test('command-local response mapping, POST body and Requery are retained without changing connection defaults',async()=>{
 const d=config();d.commands[0]={name:'Search',connection:'HackerNewsAPI',path:'search',method:'POST',response:'json',rowsPath:'hits',fields:[{name:'Title',path:'title',type:'string'}],parameters:[{name:'q',type:'string',value:'news'}]};const calls=[];
 const ctx=new DataContext({dataSources:d},{fetch:async(url,options)=>{calls.push({url,options});return new Response('{"hits":[{"title":"news"}]}');}});
 try{const env=ctx.environment(),rs=await env.Search('abc');assert.equal(rs.Item('Title'),'news');await rs.Requery();const clone=rs.Clone();await clone.Requery();assert.equal(calls.length,3);for(const c of calls){assert(c.url.endsWith('/v0/search'));assert.equal(c.options.method,'POST');assert.deepEqual(JSON.parse(c.options.body),{q:'abc'});}assert.equal(env.HackerNewsAPI.adapter.config.rowsPath,undefined);}finally{await ctx.close();}
});
test('required command parameters fail before fetch and empty JSON arrays retain a usable schema',async()=>{
 let calls=0;const ctx=new DataContext({dataSources:config()},{fetch:async()=>{calls++;return new Response('[]');}});
 try{const env=ctx.environment();await assert.rejects(env.GetStoryById(),e=>e.number===449);assert.equal(calls,0);const rs=await env.GetTopStoryIds();assert.equal(rs.State,1);assert.equal(rs.EOF,-1);assert.equal(rs.Fields.Count,1);}finally{await ctx.close();}
});

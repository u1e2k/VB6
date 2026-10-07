import test from 'node:test';
import assert from 'node:assert/strict';
import {AutomationRegistry} from '../src/runtime/automation.js';
import {compileProject} from '../src/language/compiler.js';
import {VirtualMachine} from '../src/runtime/vm.js';

async function run(code,{defaults=false,empty=false}={}) {
  let writes=0;
  const registry=new AutomationRegistry().register('Test.Items',session=>{
    const item=n=>session.adopt({metadata:{defaultMember:defaults?'Value':null,members:[{name:'Value',params:[],modes:[2,4]}]},invoke(name,mode,args){if(mode===4)writes++;return {value:n,args};},release(){}});
    const first=item(1),second=item(2);
    return {metadata:{members:[{name:'First',params:[],modes:[2]}]},invoke:()=>({value:first}),enumerate:()=>empty?[]:[first,second],release(){}};
  });
  const program=compileProject({name:'Enum',startup:'Sub Main',modules:[{name:'M',kind:'module',code:'Option Explicit\nSub Main()\n'+code+'\nEnd Sub'}]});
  assert.deepEqual(program.diagnostics,[]);
  const output=[],vm=new VirtualMachine(program,{automation:registry,print:s=>output.push(s)});
  try{await vm.start();return {output,writes};}finally{vm.stop();await Promise.all([vm.automationClose,vm.dataClose]);}
}
for(const type of ['Object','Variant'])for(const defaults of [false,true])test(`For Each rebinds an initialized ${type} without invoking ${defaults?'its default setter':'an absent default property'}`,async()=>{
  const result=await run(`Dim source As Object, item As ${type}
Set source = CreateObject("Test.Items")
Set item = source.First
For Each item In source
Debug.Print item.Value
Next item
Debug.Print item.Value`,{defaults});
  assert.deepEqual(result,{output:['1','2','2'],writes:0});
});
test('empty Automation enumeration leaves the initialized loop variable unchanged',async()=>{
  assert.deepEqual(await run('Dim source As Object, item As Object\nSet source = CreateObject("Test.Items")\nSet item = source.First\nFor Each item In source\nDebug.Print "unexpected"\nNext item\nDebug.Print item.Value',{empty:true}),{output:['1'],writes:0});
});

/** Actual installed MSXML 6 Automation, not a browser DOM or fake COM fixture. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {NativeAutomationClient} from './native-automation.mjs';
import {VirtualMachine} from '../../src/runtime/vm.js';
import {compileProject} from '../../src/language/compiler.js';
import {XML_TREE_PROGRAM,XML_BINARY_PROGRAM} from '../../tests/fixtures/common-xml-programs.js';
if(process.platform!=='win32')throw Error('MSXML native validation requires Windows; no native pass obtained.');
const architecture=process.env.VB6_COM_ARCH||'x86',report={architecture,status:'failed',checks:[],snapshots:{},licensedVB6:false};
try{
  for(const [name,code,expected]of [
    ['tree',XML_TREE_PROGRAM,['True','items 2','Second 2 True','3 Third True','First','Second','Third','2','False','True True','False','True']],
    ['binary',XML_BINARY_PROGRAM,['Value','8209 0 255','000102ff']]
  ]){
    const client=new NativeAutomationClient({allowed:['MSXML2.DOMDocument.6.0'],allowNativeCode:true,architecture}),output=[];
    const program=compileProject({name:'NativeXML',startup:'Sub Main',modules:[{name:'M',kind:'module',code:'Option Explicit\nSub Main()\n'+code+'\nEnd Sub'}]});assert.deepEqual(program.diagnostics,[]);
    const vm=new VirtualMachine(program,{automation:client.registry(),print:s=>output.push(s)});
    try{await vm.start();report.snapshots[name]=output;assert.deepEqual(output,expected);report.checks.push('compiled native MSXML '+name);}
    finally{vm.stop();await Promise.all([vm.automationClose,vm.dataClose]);await client.close();}
  }
  report.status='passed';
}catch(error){report.error=error.stack||String(error);process.exitCode=1;}
finally{await fs.mkdir('reports/native-interop',{recursive:true});await fs.writeFile(`reports/native-interop/xml-${architecture}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}

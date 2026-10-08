import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeMetadataType,getNativeMetadataProperty,setNativeMetadataProperty,initializeNativeObjectTag,disposeNativeStandaloneTags} from '../src/native/control-metadata.js';
import {X86} from '../src/native/x86.js';
import {BinarySection,PE32Image} from '../src/native/pe32.js';
import {newProject,createControl} from '../src/project/model.js';
import {compileWin32} from '../src/native/compiler.js';
import {editControlFixture} from '../tools/win32-control-fixtures.mjs';
function harness(type='TextBox'){
 const section=new BinarySection('.text',0),data=new BinarySection('.data',0),trace=[];
 const form={form:{properties:{Tag:'form\0tag'}},name:'Form1',handle:'form-handle',controls:new Map()};
 const object=type==='Form'?form:{model:{type,name:'Control1',properties:{Tag:'control\0tag'}},key:'control1',module:form,state:'state',handle:'control-handle'};
 if(type!=='Form')form.controls.set(object.key,object);
 const c={x:new X86(section,new PE32Image()),data,object:()=>object,
  slot:label=>{data.label(label).u32(0);return label;},string:value=>{trace.push(['literal',value]);return 'literal:'+trace.length;},
  withGuard:value=>trace.push(['guard',value]),ensure:value=>trace.push(['ensure',value]),
  controlHandleRef:value=>({memory:value.handle}),nativeControlState:()=>c.x.value('state'),
  ownString:()=>trace.push(['owner']),textExpression:value=>{trace.push(['text',value]);c.x.value('source');},
  numeric:value=>{trace.push(['number',value]);c.x.value(1);},check:value=>trace.push(['check',value]),
  boolean:value=>trace.push(['boolean',value]),fail:message=>{throw Error(message);}};
 return {c,object,form,section,data,trace};
}
for(const type of ['Form','TextBox','Timer'])test(type+' Tag getter copies counted data into an owned result',()=>{
 const {c,object,section,trace}=harness(type);assert.equal(getNativeMetadataProperty(c,object,'tag'),true);
 assert.ok(section.fixups.some(f=>f.label==='native:string:copy'));
 assert.ok(!section.fixups.some(f=>f.label.endsWith('SysAllocString')));
 assert.equal(trace.filter(t=>t[0]==='owner').length,1);assert.equal(trace.filter(t=>t[0]==='ensure').length,1);
});
for(const type of ['Form','TextBox','Timer'])test(type+' Tag setter validates receiver, copies, swaps, then frees the old owner',()=>{
 const {c,object,section}=harness(type);assert.equal(setNativeMetadataProperty(c,object,'tag',{kind:'literal',value:'x\0y'}),true);
 const labels=section.fixups.map(f=>f.label),copy=labels.indexOf('native:string:copy'),free=labels.findIndex(s=>s.endsWith('SysFreeString'));
 assert.ok(copy>labels.findIndex(s=>s.endsWith('IsWindow')));assert.ok(free>copy);
 assert.ok(!labels.some(s=>s.endsWith('SysAllocString')));
 // A zero copy result must not be mistaken for allocation failure: it is empty.
 const copyFix=section.fixups[copy],freeFix=section.fixups[free];
 assert.ok(!section.fixups.some(f=>f.offset>copyFix.offset&&f.offset<freeFix.offset&&f.label.startsWith('error:')));
});
for(const type of ['Form','TextBox','Timer'])test(type+' design-time Tag initializer never uses NUL-terminated allocation',()=>{
 const {c,object,section,trace}=harness(type);initializeNativeObjectTag(c,object);
 assert.ok(trace.some(t=>t[0]==='literal'&&t[1].includes('\0')));
 assert.ok(section.fixups.some(f=>f.label==='native:string:copy'));assert.ok(!section.fixups.some(f=>f.label.endsWith('SysAllocString')));
});
test('empty design Tag needs no allocation and standalone owners are zeroed after cleanup',()=>{
 const {c,object,form,section,data}=harness('Timer');object.model.properties.Tag='';initializeNativeObjectTag(c,object);
 assert.equal(section.fixups.some(f=>f.label==='native:string:copy'),false);
 disposeNativeStandaloneTags(c,form);
 assert.equal(section.fixups.filter(f=>f.label.endsWith('SysFreeString')).length,2);
 for(const label of ['form-tag:Form1','timer-tag:Form1:control1'])assert.ok(data.labels.has(label));
 assert.equal(data.bytes.length,8);
});
test('indexed Timer Tag selects saved Index slots, including bound With receivers',()=>{
 for(const bound of [false,true]){
  const {c,object,form,section,data,trace}=harness('Timer'),other={...object,key:'control1:8'};
  object.key='control1:3';object.group={entries:new Map([[3,object],[8,other]])};object.indexSlot={offset:-12};object.indexed=!bound;object.boundIndex=bound;
  setNativeMetadataProperty(c,object,'tag',{kind:'literal',value:'x'});
  assert.ok(section.fixups.some(f=>f.label==='error:340'));assert.equal(trace.filter(t=>t[0]==='number').length,0);
  assert.ok(data.labels.has('timer-tag:Form1:control1:3'));assert.ok(data.labels.has('timer-tag:Form1:control1:8'));
  assert.ok(section.fixups.some(f=>f.label===form.handle));assert.equal(section.fixups.some(f=>f.label===object.handle),false);
 }
});
test('indexed Name evaluates its receiver and does not silently bypass missing Index validation',()=>{
 const {c,object,trace}=harness('Timer');object.indexed=true;
 getNativeMetadataProperty(c,object,'name');assert.equal(trace.filter(t=>t[0]==='ensure').length,1);
 assert.ok(trace.some(t=>t[0]==='literal'&&t[1]==='Control1'));
});
test('metadata types reflect real property kinds and do not fabricate TabStop on non-tabbable controls',()=>{
 for(const type of ['Form','Timer','TextBox','CommandButton','Label','PictureBox']){
  const {c}=harness(type),node={kind:'member',object:{kind:'id',name:'Control1'}};
  for(const name of ['Name','Tag'])assert.equal(nativeMetadataType(c,{...node,name}),'string');
  assert.equal(nativeMetadataType(c,{...node,name:'TabStop'}),['TextBox','CommandButton'].includes(type)?'boolean':null);
 }
});
test('TabStop uses actual style APIs, masks one bit, and normalizes Boolean values',()=>{
 const {c,object,section,trace}=harness();setNativeMetadataProperty(c,object,'tabstop',{kind:'literal',value:2});
 const names=section.fixups.map(f=>f.label);
 for(const suffix of ['IsWindow','SetLastError','GetWindowLongW','SetWindowLongW','GetLastError'])assert.ok(names.some(n=>n.endsWith(suffix)),suffix);
 assert.ok(trace.some(t=>t[0]==='check'&&t[1]==='Boolean'));
 getNativeMetadataProperty(c,object,'tabstop');assert.ok(trace.some(t=>t[0]==='boolean'&&t[1]==='<>'));
});
for(const property of ['Control1.Name','Me.Name'])test('assignment to '+property+' is explicitly rejected',()=>{
 const p=newProject('ReadOnlyMetadata');p.modules[0].form.controls=[createControl('TextBox','Control1')];
 p.modules[0].code='Private Sub Form_Load()\n'+property+'="rename"\nEnd Sub';
 assert.throws(()=>compileWin32(p),/Name is read-only/);
});
for(const optimization of [0,1,2])test('extended editing metadata fixture has deterministic PE32 output at O'+optimization,()=>{
 const {project,checks}=editControlFixture(),before=JSON.stringify(project),a=compileWin32(project,{optimization});
 assert.ok(checks.length>=35);assert.deepEqual(a.bytes,compileWin32(project,{optimization}).bytes);assert.equal(JSON.stringify(project),before);
 assert.ok(checks.some(s=>s.includes('unload/reload')));assert.ok(checks.some(s=>s.includes('dialog tab traversal')));
 assert.ok(Buffer.from(a.bytes).includes(Buffer.from('control\0seed','utf16le')));
});

test('nonvisual ImageList and CommonDialog Tag validates the owner form, not a state pointer',()=>{
 for(const type of ['ImageList','CommonDialog']){
  const {c,object,form,section}=harness(type);
  getNativeMetadataProperty(c,object,'tag');setNativeMetadataProperty(c,object,'tag',{kind:'literal',value:'counted\0tag'});
  assert.equal(section.fixups.filter(f=>f.label===form.handle).length,2);
  assert.equal(section.fixups.some(f=>f.label===object.handle),false);
  assert.equal(section.fixups.filter(f=>f.label==='native:string:copy').length,2);
 }
});

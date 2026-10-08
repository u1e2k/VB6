import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,createControl} from '../src/project/model.js';
import {compileWin32} from '../src/native/compiler.js';
import {NATIVE_SELECTION_FORMAT} from '../src/native/control-format.js';
import {PE32Image} from '../src/native/pe32.js';
import {NativeX86Machine} from './support/native-x86-machine.mjs';
const project=code=>{const p=newProject('RichFormatting');p.modules[0].form.controls=[createControl('RichTextBox','R')];p.modules[0].code='Private Sub Form_Load()\n'+code+'\nEnd Sub';return p;};
function machine(t,code,optimization){let linked;const finish=PE32Image.prototype.finish;t.mock.method(PE32Image.prototype,'finish',function(...args){linked=finish.apply(this,args);return linked;});compileWin32(project(code),{optimization});const vm=new NativeX86Machine(linked);for(const [symbol,value]of [['hwnd:Form1',100],['hwnd:Form1:r',101],['initialized:Form1',1],['loaded:Form1',1]])vm.memory.write(vm.symbol(symbol),value);return vm;}
for(const optimization of [0,1,2]){
 test('all native formatting members support scalar and IsNull reads O'+optimization,()=>{
  for(const [name,f]of Object.entries(NATIVE_SELECTION_FORMAT)){
   const value=f.kind==='string'?'"Arial"':f.kind==='points'?'12.5':f.kind==='flag'||f.kind==='bullet'?'True':f.kind==='alignment'?'2':'120';
   const p=project(`Dim value As ${f.kind==='string'?'String':f.kind==='points'?'Double':'Long'}\nR.${name}=${value}\nvalue=R.${name}\nIf IsNull((R.${name})) Then value=${value}`),before=JSON.stringify(p),r=compileWin32(p,{optimization});
   assert.ok(r.report.controls.runtime.selectionFormatting.includes(name));assert.equal(JSON.stringify(p),before);
  }
 });
 for(const [property,mask,paragraph]of [['SelBold',1,false],['SelProtected',16,false],['SelBullet',32,true],['SelFontSize',0x80000000,false]])for(const uniform of [false,true])test(`IsNull ${property} reads the native mask without a scalar conversion, uniform=${uniform}, O${optimization}`,t=>{
  const vm=machine(t,`If IsNull(R.${property}) ${uniform?'':'='} ${uniform?'Then Err.Raise 5':'False Then Err.Raise 5'}`,optimization);let calls=0;
  vm.hook('user32.dll','SendMessageW',4,([hwnd,msg,w,p])=>{assert.equal(hwnd,101);assert.equal(msg,paragraph?0x43d:0x43a);assert.equal(w,paragraph?0:1);assert.equal(vm.memory.read(p),paragraph?188:116);vm.memory.write(p+4,uniform?mask:0);calls++;return 0;});
  vm.invoke('proc:Form1:Form_Load');assert.equal(calls,1);
 });
 for(const [property,mask,paragraph]of [['SelProtected',16,false],['SelBullet',32,true]])for(const enabled of [false,true])test(`${property} preserves record size, mask and Boolean field O${optimization}, enabled=${enabled}`,t=>{
  const vm=machine(t,`R.${property}=${enabled?'True':'False'}`,optimization);let calls=0;
  vm.hook('user32.dll','SendMessageW',4,([hwnd,msg,w,p])=>{assert.equal(hwnd,101);assert.equal(msg,paragraph?0x447:0x444);assert.equal(w,paragraph?0:1);assert.equal(vm.memory.read(p),paragraph?188:116);assert.equal(vm.memory.read(p+4),mask);assert.equal(vm.memory.read(p+8,paragraph?16:32),enabled?(paragraph?1:16):0);assert.equal(vm.memory.read(p+10,16),0);calls++;return 1;});
  vm.invoke('proc:Form1:Form_Load');assert.equal(calls,1);
 });
 for(const flags of [0,2,4,6,8,14])test(`Find emits bounded Unicode FINDTEXTEXW and preserves no-highlight semantics flags=${flags}, O${optimization}`,t=>{
  const vm=machine(t,`Dim n As Long\nn=R.Find("zażółć",2,-1,${flags})\nIf n<>7 Then Err.Raise 5`,optimization);let found=0,selected=0;
  vm.hook('user32.dll','SendMessageW',4,([hwnd,msg,w,p])=>{assert.equal(hwnd,101);if(msg===0x47c){assert.equal(w,(flags&6)|1);assert.equal(vm.memory.read(p),2);assert.equal(vm.memory.read(p+4),0xffffffff);assert.equal(vm.memory.utf16(vm.memory.read(p+8)),'zażółć');assert.equal(vm.memory.read(p+12),0xffffffff);vm.memory.write(p+12,7);vm.memory.write(p+16,13);found++;return 7;}assert.equal(msg,0x437);assert.equal(w,0);assert.equal(vm.memory.read(p),7);assert.equal(vm.memory.read(p+4),13);selected++;return 0;});
  vm.invoke('proc:Form1:Form_Load');assert.equal(found,1);assert.equal(selected,flags&8?0:1);
 });
 test('Find empty and not-found results leave the native selection unchanged O'+optimization,t=>{
  const vm=machine(t,'If R.Find("")<>-1 Then Err.Raise 5\nIf R.Find("missing",,,-0)<>-1 Then Err.Raise 5',optimization);let calls=0;
  vm.hook('user32.dll','SendMessageW',4,([hwnd,msg,w,p])=>{assert.equal(msg,0x47c);assert.equal(vm.memory.read(p),0);assert.equal(vm.memory.read(p+4),0xffffffff);assert.equal(w,1);calls++;return -1;});vm.invoke('proc:Form1:Form_Load');assert.equal(calls,1);
 });
 for(const source of ['R.Find("a",-1)','R.Find("a",3,2)','R.Find("a",0,-2)','R.Find("a",0,-1,1)','R.Find("a" & ChrW$(0) & "b")'])test('Find invalid contract fails before native mutation: '+source+' O'+optimization,t=>{
  const vm=machine(t,source,optimization);vm.hook('user32.dll','SendMessageW',4,()=>{assert.fail('invalid Find must not send a native message');});assert.throws(()=>vm.invoke('proc:Form1:Form_Load'),e=>e.number===380);
 });
 test('line and undo/redo use exact message parameters and Boolean results O'+optimization,t=>{
  const vm=machine(t,'If R.GetLineFromChar(3)<>2 Then Err.Raise 5\nIf Not R.CanUndo() Then Err.Raise 5\nR.Undo\nIf Not R.CanRedo() Then Err.Raise 5\nR.Redo',optimization),messages=[];
  vm.hook('user32.dll','SendMessageW',4,([hwnd,msg,w,p])=>{assert.equal(hwnd,101);assert.equal(w,0);assert.equal(p,msg===0x436?3:0);messages.push(msg);return msg===0x436?2:1;});vm.invoke('proc:Form1:Form_Load');assert.deepEqual(messages,[0x436,0xc6,0xc7,0x455,0x454]);
 });
}
test('native rich methods reject bad arity and retain plain-control dependencies',()=>{
 for(const source of ['R.Find','R.Find("a",0,-1,0,0)','R.CanRedo(1)','R.GetLineFromChar()'])assert.throws(()=>compileWin32(project(source)),/expects/);
 const p=project('');p.modules[0].form.controls[0]=createControl('TextBox','R');const r=compileWin32(p);assert.deepEqual(r.report.controls.runtime.richTextFeatures,[]);assert.deepEqual(r.report.controls.runtime.selectionFormatting,[]);
});

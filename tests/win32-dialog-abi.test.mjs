import test from 'node:test';
import assert from 'node:assert/strict';
import {PE32Image} from '../src/native/pe32.js';
import {compileWin32} from '../src/native/compiler.js';
import {newProject,createControl} from '../src/project/model.js';
import {NATIVE_DIALOG_FIELDS as F,nativeDialogSeed,NATIVE_DIALOG_BYTES} from '../src/native/dialog-contract.js';
import {NativeX86Machine} from './support/native-x86-machine.mjs';
function machine(t,method='ShowOpen',optimization=0){
 const p=newProject('DialogAbi');p.modules[0].form.controls=[createControl('CommonDialog','Dialog')];p.modules[0].code=`Private Sub Form_Load()\nDialog.${method}\nEnd Sub`;
 let linked;const finish=PE32Image.prototype.finish;t.mock.method(PE32Image.prototype,'finish',function(...args){linked=finish.apply(this,args);return linked;});compileWin32(p,{optimization});return new NativeX86Machine(linked);
}
function state(vm,properties={}){const ptr=vm.memory.alloc(NATIVE_DIALOG_BYTES,'dialog-state');vm.memory.region(ptr).bytes.fill(0);const seed=nativeDialogSeed(properties);for(const [name,f]of Object.entries(F))vm.memory.write(ptr+f.offset,f.type==='string'?vm.memory.string(seed[name]):seed[name]);return ptr;}
const count=vm=>vm.memory.regions.filter(r=>r.label==='BSTR').length;
const write=(vm,p,text)=>{for(let i=0;i<text.length;i++)vm.memory.write(p+i*2,text.charCodeAt(i),16);vm.memory.write(p+text.length*2,0,16);};
for(const optimization of [0,1,2])test(`emitted file filter ABI validates counted UTF-16 and zeroes undefined allocator bytes O${optimization}`,t=>{
 const vm=machine(t,'ShowOpen',optimization);
 for(const [filter,expected]of [['Text|*.txt|All|*.*','Text\0*.txt\0All\0*.*\0\0'],['Text|*.txt|','Text\0*.txt\0\0'],['','\0\0']]){
  const input=vm.memory.string(filter),before=count(vm),ptr=vm.invoke('native:dialog:filter',[input]);assert.ok(ptr);assert.equal(vm.get('edx'),0);
  const got=Array.from({length:expected.length},(_,i)=>String.fromCharCode(vm.memory.read(ptr+2*i,16))).join('');assert.equal(got,expected);assert.equal(count(vm),before+1);
 }
 for(const invalid of ['Text','Text||All|*.*','Text|*.txt\0bad','|*.*']){const input=vm.memory.string(invalid),before=count(vm);assert.equal(vm.invoke('native:dialog:filter',[input]),0);assert.equal(vm.get('edx'),380);assert.equal(count(vm),before);}
});
for(const optimization of [0,1,2])for(const multi of [false,true])test(`emitted file dialog commits exact single/multiple results and frees staging O${optimization} multi=${multi}`,t=>{
 const vm=machine(t,'ShowOpen',optimization),s=state(vm,{Filter:'Text|*.txt',FileName:'old.txt',MaxFileSize:256,Flags:multi?0x200:0}),before=count(vm),output=multi?'C:\\folder\0first.txt\0second.txt\0':'C:\\folder\\first.txt';
 vm.hook('comdlg32.dll','GetOpenFileNameW',1,([p])=>{
  const r=o=>vm.memory.read(p+o);assert.equal(r(0),88);assert.equal(r(4),123);assert.ok(r(52)&8);assert.ok(r(52)&0x80000);assert.equal(r(32),256);
  assert.equal(vm.memory.utf16(r(28)),'old.txt');assert.equal(vm.memory.read(r(28)+510,16),0);assert.equal(vm.memory.read(r(36)+510,16),0);
  assert.equal(vm.memory.utf16(r(12)),'Text');assert.equal(vm.memory.utf16(r(12)+10),'*.txt');write(vm,r(28),output);write(vm,r(36),'first.txt');vm.memory.write(p+24,2);return 1;
 });
 vm.invoke('native:dialog:showopen',[123,s]);
 assert.equal(vm.memory.bstr(vm.memory.read(s+F.filename.offset)),multi?output.slice(0,-1):output);assert.equal(vm.memory.bstr(vm.memory.read(s+F.filetitle.offset)),'first.txt');assert.equal(vm.memory.read(s+F.filterindex.offset),2);assert.equal(vm.memory.read(s+76),0);assert.equal(count(vm),before);
});
for(const [error,cancel,expected]of [[0,false,null],[0,true,32755],[0x3003,false,7],[2,false,380]])test(`emitted dialog cancellation/error ${error}/${cancel} is transactional`,t=>{
 const vm=machine(t),s=state(vm,{FileName:'unchanged',CancelError:cancel?-1:0}),before=count(vm),old=vm.memory.read(s+F.filename.offset);
 vm.hook('comdlg32.dll','GetOpenFileNameW',1,()=>0);vm.hook('comdlg32.dll','CommDlgExtendedError',0,()=>error);
 if(expected)assert.throws(()=>vm.invoke('native:dialog:showopen',[1,s]),e=>e.number===expected);else vm.invoke('native:dialog:showopen',[1,s]);
 assert.equal(vm.memory.read(s+F.filename.offset),old);assert.equal(vm.memory.bstr(old),'unchanged');assert.equal(vm.memory.read(s+76),0);assert.equal(vm.memory.read(s+F.lasterror.offset),error);assert.equal(count(vm),before);
});

for(const optimization of [0,1,2])for(const action of [1,2,0])test(`emitted printer dialog ownership and accepted/cancelled settings O${optimization} action=${action}`,t=>{
 const vm=machine(t,'ShowPrinter',optimization),s=state(vm,{Min:2,Max:20,FromPage:3,ToPage:5,Copies:2,Flags:2}),freed=[],deleted=[];let ole=0;
 vm.memory.write(s+F.hdc.offset,400);
 vm.hook('ole32.dll','OleInitialize',1,([reserved])=>{assert.equal(reserved,0);ole++;return 0;});vm.hook('ole32.dll','OleUninitialize',0,()=>{ole--;});
 vm.hook('kernel32.dll','GlobalFree',1,([h])=>{freed.push(h);return 0;});vm.hook('gdi32.dll','DeleteDC',1,([h])=>{deleted.push(h);return 1;});
 vm.hook('comdlg32.dll','PrintDlgExW',1,([p])=>{
  const r=o=>vm.memory.read(p+o);assert.equal(r(0),84);assert.equal(r(4),123);assert.equal(r(8),0);assert.equal(r(12),0);assert.equal(r(16),0);assert.equal(r(20),0x102);assert.equal(r(32),1);assert.equal(r(36),1);assert.equal(r(44),2);assert.equal(r(48),20);assert.equal(r(52),2);assert.equal(r(76),0xffffffff);assert.equal(vm.memory.read(r(40)),3);assert.equal(vm.memory.read(r(40)+4),5);
  vm.memory.write(p+8,101);vm.memory.write(p+12,102);vm.memory.write(p+16,500);vm.memory.write(p+52,4);vm.memory.write(r(40),6);vm.memory.write(r(40)+4,7);vm.memory.write(p+80,action);return 0;
 });
 vm.invoke('native:dialog:showprinter',[123,s]);assert.equal(ole,0);assert.deepEqual(freed,[101,102]);assert.equal(vm.memory.read(s+76),0);
 if(action){assert.equal(vm.memory.read(s+F.hdc.offset),500);assert.equal(vm.memory.read(s+F.copies.offset),4);assert.equal(vm.memory.read(s+F.frompage.offset),6);assert.equal(vm.memory.read(s+F.topage.offset),7);assert.deepEqual(deleted,[400]);}
 else{assert.equal(vm.memory.read(s+F.hdc.offset),400);assert.equal(vm.memory.read(s+F.copies.offset),2);assert.equal(vm.memory.read(s+F.frompage.offset),3);assert.deepEqual(deleted,[500]);}
});
for(const [cancel,error,expected]of [[true,0,32755],[false,0x80004005,380]])test(`printer failure releases native handles and COM before VB error ${expected}`,t=>{
 const vm=machine(t,'ShowPrinter'),s=state(vm,{CancelError:cancel?-1:0}),freed=[],deleted=[];let ole=0;
 vm.hook('ole32.dll','OleInitialize',1,()=>{ole++;return 1;});vm.hook('ole32.dll','OleUninitialize',0,()=>ole--);
 vm.hook('kernel32.dll','GlobalFree',1,([h])=>{freed.push(h);return 0;});vm.hook('gdi32.dll','DeleteDC',1,([h])=>{deleted.push(h);return 1;});
 vm.hook('comdlg32.dll','PrintDlgExW',1,([p])=>{vm.memory.write(p+8,101);vm.memory.write(p+12,102);vm.memory.write(p+16,500);return error;});
 assert.throws(()=>vm.invoke('native:dialog:showprinter',[123,s]),e=>e.number===expected);assert.deepEqual(freed,[101,102]);assert.deepEqual(deleted,[500]);assert.equal(ole,0);assert.equal(vm.memory.read(s+76),0);assert.equal(vm.memory.read(s+F.hdc.offset),0);
});
test('printer default query and incompatible COM apartment have explicit results',t=>{
 const vm=machine(t,'ShowPrinter'),s=state(vm,{Flags:0x400});let uninit=0;
 vm.hook('ole32.dll','OleInitialize',1,()=>0x80010106);vm.hook('ole32.dll','OleUninitialize',0,()=>uninit++);
 assert.throws(()=>vm.invoke('native:dialog:showprinter',[123,s]),e=>e.number===380);assert.equal(uninit,0);assert.equal(vm.memory.read(s+76),0);
 vm.set('esp',0x1003f000);vm.hook('ole32.dll','OleInitialize',1,()=>0);vm.hook('comdlg32.dll','PrintDlgExW',1,([p])=>{vm.memory.write(p+16,500);return 0;});
 vm.invoke('native:dialog:showprinter',[123,s]);assert.equal(uninit,1);assert.equal(vm.memory.read(s+F.hdc.offset),500);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {PE32Image} from '../src/native/pe32.js';
import {compileWin32} from '../src/native/compiler.js';
import {newProject,createControl} from '../src/project/model.js';
import {NativeX86Machine} from './support/native-x86-machine.mjs';
function compile(t,code,optimization){const p=newProject('FormatAbi');p.modules[0].form.controls=[createControl('RichTextBox','R')];p.modules[0].code=`Private Sub Form_Load()\n${code}\nEnd Sub`;let linked;const finish=PE32Image.prototype.finish;t.mock.method(PE32Image.prototype,'finish',function(...args){linked=finish.apply(this,args);return linked;});compileWin32(p,{optimization});const vm=new NativeX86Machine(linked);for(const [symbol,n]of [['hwnd:Form1',100],['hwnd:Form1:r',101],['initialized:Form1',1],['loaded:Form1',1]])vm.memory.write(vm.symbol(symbol),n);return vm;}
for(const optimization of [0,1,2])for(const [prop,mask,offset,input,expected]of [['SelColor',0x40000000,20,123,123],['SelBackColor',0x04000000,96,456,456],['SelBold',1,8,'True',1],['SelItalic',2,8,'False',0],['SelIndent',1,12,120,120],['SelAlignment',8,24,2,3]])test(`emitted ${prop} writes only its mask/field through SendMessageW O${optimization}`,t=>{
 const vm=compile(t,`R.${prop}=${input}`,optimization),paragraph=prop==='SelIndent'||prop==='SelAlignment';let sent=0;
 vm.hook('oleaut32.dll','OleTranslateColor',3,([color,palette,out])=>{assert.equal(palette,0);vm.memory.write(out,color);return 0;});
 vm.hook('user32.dll','SendMessageW',4,([hwnd,msg,w,p])=>{assert.equal(hwnd,101);assert.equal(msg,paragraph?0x447:0x444);assert.equal(w,paragraph?0:1);assert.equal(vm.memory.read(p),paragraph?188:116);assert.equal(vm.memory.read(p+4),mask);assert.equal(vm.memory.read(p+offset,prop==='SelAlignment'?16:32),expected);sent++;return 1;});
 vm.invoke('proc:Form1:Form_Load');assert.equal(sent,1);
});

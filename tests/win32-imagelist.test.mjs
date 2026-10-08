import test from 'node:test';
import assert from 'node:assert/strict';
import {compileWin32} from '../src/native/compiler.js';
import {PE32Image} from '../src/native/pe32.js';
import {newProject,createControl} from '../src/project/model.js';
import {nativeImageListPlan} from '../src/native/control-imagelist.js';
import {NativeX86Machine} from './support/native-x86-machine.mjs';
import {nativeTestIcon,nativeDataUri} from './support/native-picture-fixtures.mjs';
const picture=nativeDataUri(nativeTestIcon(),'image/x-icon');
function project(code){const p=newProject('ImageListAbi');p.modules[0].form.controls=[createControl('ImageList','Icons'),createControl('Image','Preview')];p.modules[0].code=`Private Sub Form_Load()\n${code}\nEnd Sub`;return p;}
function machine(t,optimization=0,source=null){const p=project(`Icons.ListImages.Add 0,"one",LoadPicture("${picture}")
Dim i As Long,s As String
s=Icons.ListImages(1).Key
i=Icons.ListImages("one").Index
Icons.ListImages(1).Key="renamed"
Icons.ListImages(1).Tag="info"
Set Icons.ListImages(1).Picture=LoadPicture("${picture}")
Set Preview.Picture=Icons.ListImages(1).Picture
Icons.ListImages.Remove 1
Icons.ListImages.Clear`);if(source)p.modules[0].code=source;let linked;const finish=PE32Image.prototype.finish;t.mock.method(PE32Image.prototype,'finish',function(...args){linked=finish.apply(this,args);return linked;});const result=compileWin32(p,{optimization}),vm=new NativeX86Machine(linked),s=vm.symbol('control-state:Form1:icons'),images=[],destroyed=[];let image=1000,copyFailure=0;
 vm.memory.write(s+76,77);vm.memory.write(s+80,0);vm.memory.write(s+84,0);vm.memory.write(s+88,16);vm.memory.write(s+92,16);
 for(const [symbol,n]of [['hwnd:Form1',100],['hwnd:Form1:icons',s],['hwnd:Form1:preview',101],['initialized:Form1',1],['loaded:Form1',1]])vm.memory.write(vm.symbol(symbol),n);
 vm.hook('user32.dll','CreateIconFromResourceEx',7,()=>image++);vm.hook('user32.dll','DestroyIcon',1,([p])=>{assert.ok(!destroyed.includes(p),'double DestroyIcon');destroyed.push(p);return 1;});
 vm.hook('kernel32.dll','CompareStringOrdinal',5,([a,ac,b,bc,ignore])=>{assert.equal(ac,0xffffffff);assert.equal(bc,0xffffffff);assert.equal(ignore,1);a=vm.memory.utf16(a).toLowerCase();b=vm.memory.utf16(b).toLowerCase();return a===b?2:a<b?1:3;});
 vm.hook('comctl32.dll','ImageList_ReplaceIcon',3,([h,index,icon])=>{assert.equal(h,77);index|=0;if(index===-1){images.push(icon);return images.length-1;}assert.ok(index>=0&&index<images.length);images[index]=icon;return index;});
 vm.hook('comctl32.dll','ImageList_Copy',5,([dst,di,src,si,flags])=>{assert.deepEqual([dst,src,flags],[77,77,1]);assert.ok(di<images.length&&si<images.length);if(copyFailure&&!--copyFailure)return 0;[images[di],images[si]]=[images[si],images[di]];return 1;});
 vm.hook('comctl32.dll','ImageList_Remove',2,([h,index])=>{assert.equal(h,77);index|=0;if(index===-1)images.length=0;else{assert.ok(index>=0&&index<images.length);images.splice(index,1);}return 1;});
 vm.hook('comctl32.dll','ImageList_Destroy',1,([h])=>{assert.equal(h,77);images.length=0;return 1;});
 // Nonvisual ImageList identities are state pointers, not HWNDs.
 vm.hook('user32.dll','IsWindow',1,([hwnd])=>{assert.ok([100,101].includes(hwnd),'only owner-form and visual HWNDs may be validated');return 1;});
 vm.hook('user32.dll','RedrawWindow',4,()=>1);vm.hook('user32.dll','InvalidateRect',3,()=>1);
 const pic=()=>vm.invoke('native:picture:load',[vm.symbol('native:picture:data:0'),64,3,2,2]);
 const add=(name,index=0)=>{const p=pic(),text=vm.memory.string(name);try{return vm.invoke('native:imagelist:add',[s,index,text,p]);}finally{vm.memory.free(text-4);}};
 const keys=()=>{const keys=[];let n=vm.memory.read(s+80);while(n){keys.push(vm.memory.bstr(vm.memory.read(n+4)));n=vm.memory.read(n);}return keys;};
 return {vm,s,images,destroyed,add,pic,keys,result,failCopy:n=>copyFailure=n};
}
test('native ImageList plans validate dimensions, keyed identity and owned image input',()=>{
 assert.equal(nativeImageListPlan({ListImages:[{Key:'a',Picture:picture}]}).images.length,1);
 for(const properties of [{ImageWidth:0},{ImageHeight:2049},{ListImages:[{Key:'x',Picture:picture},{Key:'X',Picture:picture}]},{ListImages:[{}]}])assert.throws(()=>nativeImageListPlan(properties));
});
for(const optimization of [0,1,2])test(`native ImageList ordered insertion, lookup, key/tag mutation and removal execute emitted helpers O${optimization}`,t=>{
 const {vm,s,images,destroyed,add,keys}=machine(t,optimization),a=add('a'),c=add('c'),b=add('b',2);
 assert.deepEqual(keys(),['a','b','c']);assert.deepEqual(images,[1000,1002,1001]);assert.equal(vm.memory.read(s+84),3);
 for(const [index,node]of [[1,a],[2,b],[3,c]]){assert.equal(vm.invoke('native:imagelist:find',[s,0,index]),node);assert.equal(vm.get('edx'),index-1);}
 const upper=vm.memory.string('B');assert.equal(vm.invoke('native:imagelist:find',[s,1,upper]),b);vm.memory.free(upper-4);
 const rename=vm.memory.string('beta'),tag=vm.memory.string('details\0counted');vm.invoke('native:imagelist:key',[s,rename,b]);vm.invoke('native:imagelist:tag',[s,tag,b]);vm.memory.free(rename-4);vm.memory.free(tag-4);assert.deepEqual(keys(),['a','beta','c']);assert.equal(vm.memory.bstr(vm.memory.read(b+8)),'details\0counted');
 vm.invoke('native:imagelist:remove',[s,b,1]);assert.deepEqual(keys(),['a','c']);assert.deepEqual(images,[1000,1001]);assert.deepEqual(destroyed,[1002]);assert.equal(vm.memory.read(s+84),2);
 vm.invoke('native:imagelist:clear',[s]);assert.deepEqual(keys(),[]);assert.deepEqual(images,[]);assert.equal(vm.memory.read(s+84),0);assert.deepEqual(destroyed,[1002,1000,1001]);assert.equal(vm.memory.regions.filter(r=>r.label==='native-owned-record').length,0);
});
test('ImageList duplicate keys and failed native reorder release incoming ownership without changing metadata',t=>{
 const {vm,s,images,add,keys,destroyed,failCopy}=machine(t);add('a');add('c');const before=[...images];assert.throws(()=>add('A'),e=>e.number===35602);assert.deepEqual(images,before);assert.deepEqual(keys(),['a','c']);assert.ok(destroyed.includes(1002));vm.set('esp',0x1003f000);
 failCopy(2);assert.throws(()=>add('z',1),e=>e.number===481);assert.deepEqual(images,before);assert.deepEqual(keys(),['a','c']);assert.equal(vm.memory.read(s+84),2);assert.ok(destroyed.includes(1003));
});
test('inline ListImage Picture access and native collection calls execute as compiled VB',t=>{
 const {vm,images,destroyed}=machine(t);vm.invoke('proc:Form1:Form_Load');assert.deepEqual(images,[]);const state=vm.symbol('control-state:Form1:preview'),ptr=vm.memory.read(state+76);assert.ok(ptr);assert.equal(vm.memory.read(ptr),1);vm.invoke('native:picture:release',[ptr]);assert.equal(destroyed.length,2);
});
test('ImageList resource bindings compile with correct borrowed-handle policy and do not include unused codecs',t=>{
 const p=project('');p.modules[0].form.controls[0].properties.ListImages=[{Key:'one',Picture:picture}];
 for(const [type,props]of [['TreeView',{ImageList:'Icons',Nodes:[{Key:'n',Text:'Node',Image:'one'}]}],['ListView',{Icons:'Icons',Items:[{Text:'Item',Icon:'one'}]}],['Toolbar',{ImageList:'Icons',Buttons:[{Caption:'Open',Image:'one'}]}],['TabStrip',{ImageList:'Icons',Tabs:[{Caption:'Tab',Image:'one'}]}]]){const c=createControl(type,type);Object.assign(c.properties,props);p.modules[0].form.controls.push(c);}
 const r=compileWin32(p);assert.ok(r.report.imports.some(i=>i.symbol==='ImageList_Create'));assert.equal(r.report.imports.some(i=>i.dll==='gdiplus.dll'),false);assert.deepEqual(r.bytes,compileWin32(p).bytes);
});

for(const fail of [false,true])test(`native collection targets survive RHS removal${fail?' and error unwinding':''}`,t=>{
 const code=`Private Sub Form_Load()
Icons.ListImages.Add 0,"one",LoadPicture("${picture}")
${fail?'On Error Resume Next':''}
Icons.ListImages(1).Tag=RemoveTarget()
End Sub
Private Function RemoveTarget() As String
Icons.ListImages.Clear
${fail?'Error 5':'RemoveTarget="detached"'}
End Function`;
 const {vm,s,images,destroyed}=machine(t,0,code);if(fail)vm.hooks.delete(vm.symbol('native:error:raise'));
 vm.invoke('proc:Form1:Form_Load');assert.equal(vm.memory.read(s+84),0);assert.deepEqual(images,[]);assert.equal(destroyed.length,1);
 assert.equal(vm.memory.regions.filter(r=>r.label==='native-owned-record').length,0,'all item and picture references released');
});

for(const args of [', ,', ', "one",'])test('ImageList.Add binds omitted optional index/key through shared frontend: '+args,t=>{
 const code=`Private Sub Form_Load()
Icons.ListImages.Add ${args} LoadPicture("${picture}")
Icons.ListImages.Clear
End Sub`;
 const {vm,s,images,destroyed}=machine(t,0,code);vm.invoke('proc:Form1:Form_Load');assert.equal(vm.memory.read(s+84),0);assert.deepEqual(images,[]);assert.equal(destroyed.length,1);
});

for(const fail of [false,true])test(`With captures native ImageList item identity across removal${fail?' and Resume Next':''}`,t=>{
 const code=`Private Sub Form_Load()
Icons.ListImages.Add 0,"one",LoadPicture("${picture}")
${fail?'On Error Resume Next':''}
With Icons.ListImages(NextIndex())
 Icons.ListImages.Clear
 ${fail?'Error 5':''}
 .Tag="detached"
End With
If hits<>1 Then Error 5
End Sub
Private hits As Long
Private Function NextIndex() As Long
 hits=hits+1
 NextIndex=1
End Function`;
 const {vm,images,destroyed}=machine(t,0,code);if(fail)vm.hooks.delete(vm.symbol('native:error:raise'));
 vm.invoke('proc:Form1:Form_Load');assert.deepEqual(images,[]);assert.equal(destroyed.length,1);assert.equal(vm.memory.regions.filter(r=>r.label==='native-owned-record').length,0);
});
test('With captures owned picture identity rather than rereading a replaced property',t=>{
 const code=`Private Sub Form_Load()
Set Preview.Picture=LoadPicture("${picture}")
Dim h As Long
With Preview.Picture
 Set Preview.Picture=Nothing
 h=.Handle
 If h=0 Then Error 5
End With
End Sub`;
 const {vm,destroyed}=machine(t,0,code);vm.invoke('proc:Form1:Form_Load');assert.equal(destroyed.length,1);assert.equal(vm.memory.regions.filter(r=>r.label==='native-owned-record').length,0);
});
test('dynamically indexed native ImageList bindings retain per-element handles',()=>{
 const p=project('Dim n As Long\nn=1\nSet Tree.ImageList=Icons(n)');p.modules[0].form.controls=[...p.modules[0].form.controls.filter(c=>c.name!=='Icons'),createControl('TreeView','Tree')];
 for(const index of [1,3]){const c=createControl('ImageList','Icons');c.properties.Index=index;p.modules[0].form.controls.push(c);}
 for(const optimization of [0,1,2])assert.doesNotThrow(()=>compileWin32(p,{optimization}));
});
test('native control Tag setters and getters preserve counted embedded NULs',t=>{
 const code=`Private Sub Form_Load()
Preview.Tag="a" & ChrW$(0) & "b"
Icons.Tag=Preview.Tag
If Len(Icons.Tag)<>3 Then Error 5
End Sub`;
 const {vm,s}=machine(t,0,code);vm.invoke('proc:Form1:Form_Load');assert.equal(vm.memory.bstr(vm.memory.read(s+28)),'a\0b');assert.equal(vm.memory.bstr(vm.memory.read(vm.symbol('control-state:Form1:preview')+28)),'a\0b');
});
test('picture retain overflow fails before mutating an existing reference count',t=>{
 const {vm,pic}=machine(t),p=pic();vm.memory.write(p,0x7fffffff);assert.throws(()=>vm.invoke('native:picture:retain',[p]),e=>e.number===6);assert.equal(vm.memory.read(p),0x7fffffff);
});

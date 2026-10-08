import test from 'node:test';
import assert from 'node:assert/strict';
import {NATIVE_CONTROL_CATALOG,nativeControlDependencies} from '../src/native/control-catalog.js';
import {nativeControlStyle,nativeControlOrder,nativeControlEvents,nativeCommandEvents,nativeDateFields} from '../src/native/control-plan.js';
const control=(name,type='Frame',parent=null,index)=>({key:name,model:{id:name+(index??''),name,type,parent,properties:{TabIndex:0,...(index===undefined?{}:{Index:index})}}});
test('Win32 dependency closure is deterministic and does not pull in unused common controls or RichEdit',()=>{
  assert.deepEqual(nativeControlDependencies(['Label','CommandButton','Timer']),{commonControls:0,libraries:[]});
  assert.deepEqual(nativeControlDependencies(['ProgressBar','TreeView','ListView','ProgressBar']),{commonControls:0x23,libraries:[]});
  assert.deepEqual(nativeControlDependencies(['RichTextBox','RichTextBox']),{commonControls:0,libraries:['msftedit.dll']});
  assert.throws(()=>nativeControlDependencies(['NotAControl']),/No Win32 control descriptor/);
  assert.ok(Object.isFrozen(NATIVE_CONTROL_CATALOG));
});
test('Win32 creation styles retain authored enabled, visible, tab, edit and list properties',()=>{
  let value=nativeControlStyle('TextBox',{Visible:0,Enabled:0,TabStop:0,MultiLine:-1,Locked:-1,ScrollBars:3,PasswordChar:'*',Alignment:2});
  assert.equal(value.style&0x10000000,0);assert.ok(value.style&0x08000000);assert.equal(value.style&0x10000,0);
  assert.equal(value.style&0x300000,0x300000);assert.ok(value.style&4);assert.ok(value.style&0x800);assert.ok(value.style&0x20);assert.equal(value.style&3,1);
  assert.equal(nativeControlStyle('ListBox',{MultiSelect:1}).style&8,8);
  assert.equal(nativeControlStyle('ListBox',{MultiSelect:2}).style&0x800,0x800);
  assert.equal(nativeControlStyle('PictureBox',{}).style&0x1f,0xd);
  assert.equal(nativeControlStyle('VScrollBar',{}).style&1,1);
  assert.equal(nativeControlStyle('ListView',{View:3}).style&3,1);
  assert.equal(nativeControlStyle('SSTab',{TabOrientation:3}).style&0x82,0x82);
});
test('native event notifications distinguish BUTTON double clicks from STATIC notifications',()=>{
  assert.deepEqual(nativeCommandEvents('CommandButton'),[[0,'Click'],[5,'DblClick']]);
  assert.deepEqual(nativeCommandEvents('Label'),[[0,'Click'],[1,'DblClick']]);
  assert.ok(nativeControlEvents('RichTextBox').includes('change'));
  assert.ok(nativeControlEvents('HScrollBar').includes('scroll'));
  assert.ok(nativeControlEvents('DTPicker').includes('change'));
  assert.deepEqual(nativeControlEvents('Timer'),['timer']);
});
test('Win32 parent ordering preserves nested pictures/tabs and indexed parent identity',()=>{
  const outer=control('Outer','PictureBox'),tab=control('Tab','SSTab','Outer'),button=control('Button','CommandButton','Tab');
  const result=nativeControlOrder([button,tab,outer]);assert.deepEqual(result.ordered,[outer,tab,button]);assert.equal(result.parents.get(button),tab);
  const a=control('Group','Frame',null,0),b=control('Group','Frame',null,1),child=control('Child','Label','Group');child.model.nativeParentId=b.model.id;
  assert.equal(nativeControlOrder([child,a,b]).parents.get(child),b);
  delete child.model.nativeParentId;assert.throws(()=>nativeControlOrder([a,b,child]),/ambiguous/);
  const x=control('X','Frame','Y'),y=control('Y','Frame','X');assert.throws(()=>nativeControlOrder([x,y]),/Cyclic/);
  assert.throws(()=>nativeControlOrder([control('Parent','Label'),control('Child','TextBox','Parent')]),/container/);
});
test('native date seeds validate the actual calendar and never parse date-only text through local time',()=>{
  assert.deepEqual(nativeDateFields('2024-02-29'),[2024,2,4,29,0,0,0,0]);
  assert.deepEqual(nativeDateFields('2000-01-01T23:59:59'),[2000,1,6,1,23,59,59,0]);
  for(const value of ['2023-02-29','2026-13-01','2026-01-01T24:00','1500-01-01','10/07/2026'])assert.throws(()=>nativeDateFields(value),/date|value/);
});

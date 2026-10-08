import test from 'node:test';import assert from 'node:assert/strict';
import {emittedGridEdit} from './support/native-grid-edit-abi.mjs';
for(const optimization of [0,1,2])test(`native emitted grid editor creates one clipped EDIT, commits Unicode, and owns every session O${optimization}`,t=>{
 const g=emittedGridEdit(t,optimization),{vm,m,windows,state}=g;
 const h=g.begin();assert.ok(h);const w=windows.get(h);assert.equal(w.text,'original');assert.deepEqual([w.x,w.y,w.width,w.height],[80,21,80,21]);assert.equal(w.limit,1048576);assert.deepEqual(w.selection,[0,-1]);assert.equal(g.focus(),h);
 assert.equal(g.begin(),h,'repeated edit requests reuse only the active editor');
 w.text='日本'+String.fromCodePoint(0x1f680)+' text';g.finish(h);assert.equal(g.text(),w.text);assert.equal(g.focus(),101);assert.deepEqual(g.notices,[0,1]);assert.equal(m.read(state+108),0);assert.equal(m.read(state+112),0);assert.equal(windows.size,1);
 const h2=g.begin(0x3bb);assert.equal(windows.get(h2).text,'λ');g.finish(h2,0);assert.equal(g.text(),w.text);assert.equal(windows.size,1);g.invoke('Dispose',[0]);assert.equal(g.arrays.size,0);
});
for(const optimization of [0,1,2])test(`actual emitted grid editor honours cancel and refuses stale cell revisions O${optimization}`,t=>{
 const g=emittedGridEdit(t,optimization),{m,windows,vm}=g;
 let h=g.begin();windows.get(h).text='discard';g.validation(()=>1);g.finish(h);assert.equal(g.text(),'original');assert.deepEqual(g.notices,[0]);
 g.validation((r,nested)=>{const p=m.string('event changed');nested('proc:VB6NativeGrid:SetText',[...g.args,1,1,p]);m.free(p-4);return 0;});
 h=g.begin();windows.get(h).text='must not overwrite';g.finish(h);assert.equal(g.text(),'event changed');assert.deepEqual(g.notices,[0,0]);assert.equal(windows.size,1);
});
test('compiled BeforeColUpdate and Validate can cancel, and ByRef old String retains ownership',t=>{
 const events=`Private Sub G_BeforeColUpdate(ColIndex As Integer, OldValue As String, Cancel As Integer)
 If OldValue<>"original" Then Err.Raise 5
 OldValue="temporary event copy"
End Sub
Private Sub G_Validate(Cancel As Boolean)
 Cancel=True
End Sub`;
 const g=emittedGridEdit(t,1,events),h=g.begin();g.windows.get(h).text='cancelled';g.finish(h);assert.equal(g.text(),'original');assert.deepEqual(g.notices,[0]);
});
test('actual grid editor keyboard procedure consumes Enter/Escape without eating normal dialog navigation',t=>{
 const g=emittedGridEdit(t),h=g.begin();assert.equal(g.vm.invoke('native:grid:edit-procedure',[h,0x87,13,0]),0x84);assert.equal(g.vm.invoke('native:grid:edit-procedure',[h,0x87,9,0]),0);g.windows.get(h).text='enter';g.vm.invoke('native:grid:edit-procedure',[h,0x100,13,0]);assert.equal(g.text(),'enter');const h2=g.begin();g.windows.get(h2).text='escape';g.vm.invoke('native:grid:edit-procedure',[h2,0x100,27,0]);assert.equal(g.text(),'enter');
});
test('destroying the editor during native validation cannot free the retained session early',t=>{
 const g=emittedGridEdit(t),h=g.begin(),r=g.record(h);g.validation((record,nested)=>{assert.equal(record,r);nested('native:grid:edit-procedure',[h,0x82,0,0]);g.windows.delete(h);return 0;});g.windows.get(h).text='never';g.finish(h);assert.equal(g.text(),'original');assert.equal(g.windows.size,1);assert.throws(()=>g.m.region(r),/unmapped/);
});
test('grid editor refuses locked/fixed/offscreen cells and NUL data without truncation or leaked snapshots',t=>{
 const g=emittedGridEdit(t),pod=g.vm.symbol('native:grid:state');g.m.write(pod+13*4,-1);assert.equal(g.begin(),0);g.m.write(pod+13*4,0);g.m.write(pod+4*4,1);g.m.write(pod+10*4,1);g.m.write(pod+6*4,0);assert.equal(g.begin(),0);g.m.write(pod+6*4,1);g.m.write(pod+5*4,1);g.m.write(pod+11*4,2);assert.equal(g.begin(),0);g.m.write(pod+11*4,1);
 const text=g.m.string('a\0b');g.invoke('SetText',[...g.args,1,1,text]);g.m.free(text-4);const regions=g.m.regions.length;assert.throws(()=>g.begin(),e=>e.number===5);assert.equal(g.text(),'a\0b');assert.equal(g.m.regions.length,regions);assert.equal(g.windows.size,1);
});
test('allocation failure or failed subclass installation leaves no temporary HWND, BSTR or session',t=>{
 const g=emittedGridEdit(t),before=g.m.regions.length;g.vm.hook('user32.dll','SetWindowLongW',3,([h,i,v])=>{const w=g.windows.get(h);if((i|0)===-4)return 0;const old=w.data||0;w.data=v;return old;});
 // The EDIT was never subclassed, so its normal destruction has no session hook.
 g.vm.hook('user32.dll','DestroyWindow',1,([h])=>{g.windows.delete(h);return 1;});
 assert.throws(()=>g.begin(),e=>e.number===7);assert.equal(g.m.regions.length,before);assert.equal(g.windows.size,1);assert.equal(g.m.read(g.state+108),0);assert.equal(g.text(),'original');
});

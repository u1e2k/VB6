/** One temporary Unicode EDIT child per actively edited grid, never per cell.
 * The session owns its old BSTR and a ref-counted record. HWND destruction may
 * occur inside validation/focus callbacks; a retained session is revalidated by
 * epoch AND storage revision before it can write. Failed/cancelled validation
 * discards the edit, matching the browser grid's unbound editing transaction.
 * No COM/Variant/provider contract is implied by this scalar String editor.
 */
import {mem32} from './x86-operands.js';
import {NATIVE_GRID_FIELDS as F} from './control-grid-contract.js';
import {MAX_NATIVE_STRING} from './storage.js';
const m=(base,displacement=0)=>mem32({base,displacement}),a=n=>({argument:n}),global=memory=>({memory});
// Session fields (44 bytes): state, grid HWND, epoch, version, row, column,
// owned old text, editor HWND, original EDIT procedure, phase, references.
const R={state:0,grid:4,epoch:8,version:12,row:16,col:20,text:24,edit:28,proc:32,phase:36,refs:40};
const label=name=>'native:grid:edit-'+name;
export const nativeGridEditMethods={
 gridEditWindowMessages(control,zero,exit,fallback){
  if(!this.isNativeGrid(control))return;
  this.nativeGridEditing=true;this.gridFeatures.add('inline-editing');
  const x=this.x,after=x.unique(),finish=x.unique(),cancel=x.unique(),begin=x.unique(),character=x.unique(),notify=x.unique();
  x.value(a(12)).compare(0x8006).branch('e',finish).compare(0x111).branch('e',notify).compare(5).branch('e',cancel).compare(0x203).branch('e',after).compare(0x100).branch('e',begin).compare(0x102).branch('e',character).jump(after);
  x.label(begin).value(a(16)).compare(113).branch('ne',after).push(0).push(a(8)).call(label('begin')).jump(zero);
  x.label(character).value(a(16)).compare(32).branch('b',after).compare(127).branch('e',after).compare(65535).branch('a',after).push().push(a(8)).call(label('begin')).jump(zero);
  x.label(cancel).value({memory:control.state,addend:108}).test().branch('e',after).push(0).push(0).push({memory:control.state,addend:108}).call(label('finish')).jump(after);
  x.label(notify).value(a(16)).shift('shr','eax',16).compare(0x200).branch('ne',after).value(a(20)).test().branch('e',after);
  // EN_KILLFOCUS always arrives at the native EDIT parent through WM_COMMAND.
  x.value(a(20)).emit(0x3b,0x05).addr(control.state,108).branch('ne',after).push(0).push(1).push(a(20)).call(label('finish')).jump(zero);
  x.label(finish).value(a(20)).test().branch('e',zero).emit(0x3b,0x05).addr(control.state,108).branch('ne',zero).push(1).push(a(16)).push(a(20)).call(label('finish')).jump(zero);
  x.label(after);
 },
 gridEditNotifications(module,zero,exit){
  const controls=[...module.controls.values()].filter(c=>this.isNativeGrid(c));if(!controls.length)return;
  const x=this.x,after=x.unique();x.value(a(12)).compare(0x8007).branch('ne',after).value(a(20)).test().branch('e',zero).mov('esi','eax');
  for(const c of controls){const next=x.unique(),post=x.unique(),cancel=x.unique();
   x.value(c.state).cmp(m('esi',R.state),'eax').branch('ne',next).mov('eax',m('esi',R.grid)).emit(0x3b,0x05).addr(c.handle).branch('ne',zero).mov('eax',m('esi',R.epoch)).emit(0x3b,0x05).addr(c.state,80).branch('ne',zero);
   x.mov('eax',m('esi',R.col)).mov(m('ebp',-20),'eax').value(a(16)).test().branch('ne',post);
   x.mov(m('ebp',-28),0).lea('eax',m('esi',R.text)).mov(m('ebp',-24),'eax');
   this.controlHandler(module,c,'BeforeColUpdate',[{ref:-20},{indirectRef:-24,type:'string'},{ref:-28}]);
   x.mov('eax',m('ebp',-28)).and('eax',65535).test().branch('ne',cancel);
   x.value(global(module.loaded)).test().branch('e',cancel).mov('eax',m('esi',R.grid)).emit(0x3b,0x05).addr(c.handle).branch('ne',cancel).mov('eax',m('esi',R.epoch)).emit(0x3b,0x05).addr(c.state,80).branch('ne',cancel);
   this.controlHandler(module,c,'Validate',[{ref:-28,types:['boolean','integer']}]);x.mov('eax',m('ebp',-28)).and('eax',65535).test().branch('ne',cancel).value(0).jump(exit);
   x.label(post);this.controlHandler(module,c,'AfterColUpdate',[{ref:-20}]);x.jump(zero).label(cancel).value(1).jump(exit).label(next);
  }x.jump(zero).label(after);
 },
 emitNativeGridEditHelpers(){
  if(!this.nativeGridEditing)return;
  const x=this.x,stride=Object.keys(F).length*4;
  // These helpers only receive state pointers belonging to emitted grid HWNDs.
  x.label(label('pod')).enter().value(a(8)).mov('ecx',m('eax',76)).cmp('ecx',this.nativeGridControls.length).branch('ae','error:91').imul('ecx','ecx',stride).value('native:grid:state').add('eax','ecx').leave(4);
  const bad=x.unique();x.label(label('valid')).enter().value(a(8)).mov('esi','eax').mov('eax',m('esi',R.state)).push().call(label('pod')).mov('edi','eax');
  for(const [field,source]of [[F.hwnd,R.grid],[F.epoch,R.epoch],[F.version,R.version]])x.mov('eax',m('edi',4*field)).cmp('eax',m('esi',source)).branch('ne',bad);
  x.mov('eax',m('edi',4*F.locked)).test().branch('ne',bad).mov('eax',m('esi',R.grid)).push().invoke('user32.dll','IsWindowEnabled').leave(4);x.label(bad).value(0).leave(4);
  const alive=x.unique();x.label(label('release')).enter().value(a(8)).mov('esi','eax').dec(m('esi',R.refs)).branch('ne',alive).pushOperand(m('esi',R.text)).invoke('oleaut32.dll','SysFreeString').api('kernel32.dll','GetProcessHeap').pushOperand('esi').pushOperand(0).push().invoke('kernel32.dll','HeapFree');x.label(alive).value(0).leave(4);
  const noClose=x.unique();x.label(label('close')).enter().value(a(8)).mov('esi','eax').mov(m('esi',R.phase),2).mov('eax',m('esi',R.edit)).test().branch('e',noClose).push().invoke('user32.dll','DestroyWindow');x.label(noClose).value(0).leave(4);
  // axis(array, fixed, firstVisible, selected, pixelLimit, pair*) -> Boolean.
  // Stop at the client edge: even huge logical grids cannot overflow a LONG
  // sum merely because the selected cell is currently outside the viewport.
  const loop=x.unique(),axisBad=x.unique(),selected=x.unique(),mapped=x.unique(),axisDone=x.unique();
  x.label(label('axis')).enter(16).value(a(24)).test().branch('le',axisBad).mov('edi','eax').imul('edi','edi',15).mov('esi',0).mov('ebx',0);
  x.label(loop).cmp('esi',m('ebp',12)).branch('ne',mapped).mov('esi',m('ebp',16)).label(mapped).cmp('esi',m('ebp',20)).branch('g',axisBad).cmp('ebx','edi').branch('ge',axisBad);
  x.mov(m('ebp',-4),'esi').mov(m('ebp',-8),0).local(-8).push().local(-4).push().push(a(8)).invoke('oleaut32.dll','SafeArrayGetElement').test().branch('s','error:381');
  x.cmp('esi',m('ebp',20)).branch('e',selected).add('ebx',m('ebp',-8)).inc('esi').jump(loop);
  x.label(selected).mov('eax','ebx').add('eax',7).emit(0x99).mov('ecx',15).emit(0xf7,0xf9).mov('esi',m('ebp',28)).mov(m('esi'),'eax');
  x.mov('eax','ebx').add('eax',m('ebp',-8)).add('eax',7).emit(0x99).mov('ecx',15).emit(0xf7,0xf9).cmp('eax',m('ebp',24)).branch('le',axisDone).mov('eax',m('ebp',24));
  x.label(axisDone).sub('eax',m('esi')).test().branch('le',axisBad).mov(m('esi',4),'eax').value(1).leave(24).label(axisBad).value(0).leave(24);
  this.emitNativeGridEditBegin();this.emitNativeGridEditFinish();this.emitNativeGridEditProcedure();
 },
 emitNativeGridEditBegin(){
  const x=this.x,done=x.unique(),existing=x.unique(),allocated=x.unique(),fail=x.unique(),free=x.unique(),invalidText=x.unique(),textReady=x.unique(),safe=x.unique();
  x.label(label('begin')).enter(56).mov(m('ebp',-4),0).mov(m('ebp',-8),0).mov(m('ebp',-12),0).api('user32.dll','IsWindowEnabled',[a(8)]).test().branch('e',done);
  x.api('user32.dll','GetWindowLongW',[a(8),-21]).test().branch('e',done).mov('esi','eax').mov('eax',m('esi',108)).test().branch('ne',existing);
  x.pushOperand('esi').call(label('pod')).mov('edi','eax').mov('eax',m('edi',4*F.hwnd)).cmp('eax',m('ebp',8)).branch('ne',done).cmp(m('edi',4*F.locked),0).branch('ne',done);
  for(const [value,fixed,count]of [[F.row,F.fixedrows,F.rows],[F.col,F.fixedcols,F.cols]])x.mov('eax',m('edi',4*value)).cmp('eax',m('edi',4*fixed)).branch('l',done).cmp('eax',m('edi',4*count)).branch('ge',done);
  x.local(-32).push().push(a(8)).invoke('user32.dll','GetClientRect').test().branch('e',done);
  for(const [sizes,fixed,first,target,limit,out]of [[F.widths,F.fixedcols,F.leftcol,F.col,-24,-48],[F.heights,F.fixedrows,F.toprow,F.row,-20,-40]])x.local(out).push().push(a(limit)).pushOperand(m('edi',4*target)).pushOperand(m('edi',4*first)).pushOperand(m('edi',4*fixed)).pushOperand(m('edi',4*sizes)).call(label('axis')).test().branch('e',done);
  x.mov('eax',m('edi',4*F.row)).imul('eax',m('edi',4*F.cols)).add('eax',m('edi',4*F.col)).mov(m('ebp',-52),'eax');
  x.local(-4).push().local(-52).push().pushOperand(m('edi',4*F.cells)).invoke('oleaut32.dll','SafeArrayGetElement').test().branch('s',fail);
  // A native EDIT cannot represent embedded NULs; reject without replacing the
  // stored cell or passing a truncated C string to CreateWindowExW.
  x.api('oleaut32.dll','SysStringLen',[a(-4)]).mov('ebx','eax').compare(MAX_NATIVE_STRING).branch('a',fail).test().branch('e',textReady).api('kernel32.dll','lstrlenW',[a(-4)]).cmp('eax','ebx').branch('ne',invalidText).label(textReady);
  x.api('kernel32.dll','GetProcessHeap').pushOperand(44).pushOperand(8).push().invoke('kernel32.dll','HeapAlloc').test().branch('e',fail).mov(m('ebp',-8),'eax').mov('ebx','eax');
  x.mov(m('ebx',R.state),'esi').value(a(8)).mov(m('ebx',R.grid),'eax');
  for(const [to,field]of [[R.epoch,F.epoch],[R.version,F.version],[R.row,F.row],[R.col,F.col]])x.mov('eax',m('edi',4*field)).mov(m('ebx',to),'eax');
  x.value(a(-4)).mov(m('ebx',R.text),'eax').mov(m('ebp',-56),'eax').mov(m('ebp',-4),0).mov(m('ebx',R.refs),1);
  x.api('user32.dll','CreateWindowExW',[0,this.string('EDIT'),a(-56),0x408001c4,a(-48),a(-40),a(-44),a(-36),a(8),0x7ffd,global('instance'),0]).test().branch('e',fail).mov(m('ebx',R.edit),'eax').mov(m('esi',108),'eax');
  // Install the session before the procedure; allocation has a caller reference
  // and acquires a separate window reference once subclassing succeeds.
  x.api('kernel32.dll','SetLastError',[0]).pushOperand('ebx').pushOperand(-21).pushOperand(m('ebx',R.edit)).invoke('user32.dll','SetWindowLongW').api('kernel32.dll','GetLastError').test().branch('ne',allocated+':failed-proc');
  x.push(label('procedure')).pushOperand(-4).pushOperand(m('ebx',R.edit)).invoke('user32.dll','SetWindowLongW').test().branch('e',allocated+':failed-proc').mov(m('ebx',R.proc),'eax').inc(m('ebx',R.refs)).mov(m('esi',112),'ebx').jump(allocated);
  x.label(allocated+':failed-proc').pushOperand(0).pushOperand(-21).pushOperand(m('ebx',R.edit)).invoke('user32.dll','SetWindowLongW').pushOperand(m('ebx',R.edit)).invoke('user32.dll','DestroyWindow').mov(m('esi',108),0).mov(m('ebx',R.edit),0).jump(fail);
  x.label(allocated).api('user32.dll','SendMessageW',[a(8),0x31,0,0]).pushOperand(0).push().pushOperand(0x30).pushOperand(m('ebx',R.edit)).invoke('user32.dll','SendMessageW');
  x.pushOperand(0).pushOperand(MAX_NATIVE_STRING).pushOperand(0xc5).pushOperand(m('ebx',R.edit)).invoke('user32.dll','SendMessageW').pushOperand(5).pushOperand(m('ebx',R.edit)).invoke('user32.dll','ShowWindow').pushOperand(m('ebx',R.edit)).invoke('user32.dll','SetFocus');
  x.cmp(m('ebx',R.phase),0).branch('ne',free).pushOperand('ebx').call(label('valid')).test().branch('e',allocated+':stale').pushOperand(-1).pushOperand(0).pushOperand(0xb1).pushOperand(m('ebx',R.edit)).invoke('user32.dll','SendMessageW');
  x.value(a(12)).test().branch('e',free).pushOperand(0).push().pushOperand(0x102).pushOperand(m('ebx',R.edit)).invoke('user32.dll','SendMessageW').jump(free);
  x.label(allocated+':stale').pushOperand('ebx').call(label('close')).jump(free);
  x.label(existing).mov('ebx','eax').value(a(12)).test().branch('e',done).pushOperand(0).push().pushOperand(0x102).pushOperand('ebx').invoke('user32.dll','SendMessageW').jump(done);
  x.label(invalidText).mov(m('ebp',-12),5).jump(free).label(fail).mov(m('ebp',-12),7).label(free).value(a(-8)).test().branch('e',safe).push().call(label('release')).label(safe).api('oleaut32.dll','SysFreeString',[a(-4)]);
  x.value(a(-12)).test().branch('ne','native:error:raise').label(done).value(0).leave(8);
 },
 emitNativeGridEditFinish(){
  const x=this.x,done=x.unique(),close=x.unique(),free=x.unique(),invalid=x.unique(),ready=x.unique(),updated=x.unique(),noFocus=x.unique();
  x.label(label('finish')).enter(20).mov(m('ebp',-4),0).mov(m('ebp',-8),0).mov(m('ebp',-12),0).mov(m('ebp',-16),0);
  x.api('user32.dll','GetWindowLongW',[a(8),-21]).test().branch('e',done).mov('esi','eax').cmp(m('esi',R.phase),0).branch('ne',done).inc(m('esi',R.refs)).mov(m('esi',R.phase),1);
  x.api('user32.dll','GetFocus').cmp('eax',m('ebp',8)).branch('ne',ready).value(a(16)).mov(m('ebp',-12),'eax').label(ready);
  x.value(a(12)).test().branch('e',close).pushOperand('esi').call(label('valid')).test().branch('e',close);
  x.api('user32.dll','GetWindowTextLengthW',[a(8)]).compare(MAX_NATIVE_STRING).branch('a',invalid).mov('ebx','eax').push().pushOperand(0).invoke('oleaut32.dll','SysAllocStringLen').test().branch('e',invalid).mov(m('ebp',-4),'eax').mov('ecx','ebx');
  x.inc('ecx').pushOperand('ecx').push().push(a(8)).invoke('user32.dll','GetWindowTextW').cmp('eax','ebx').branch('a',invalid).branch('e',updated).push().push(a(-4)).local(-4).push().invoke('oleaut32.dll','SysReAllocStringLen').test().branch('e',invalid);
  x.label(updated).mov('edi',m('esi',R.state)).pushOperand('esi').pushOperand(0).pushOperand(0x8007).pushOperand(m('edi',140)).invoke('user32.dll','SendMessageW').test().branch('ne',close);
  x.cmp(m('esi',R.phase),1).branch('ne',close).pushOperand('esi').call(label('valid')).test().branch('e',close);
  x.pushOperand(m('esi',R.state)).call(label('pod')).mov('edi','eax').mov('eax',m('esi',R.row)).imul('eax',m('edi',4*F.cols)).add('eax',m('esi',R.col)).mov(m('ebp',-20),'eax');
  x.push(a(-4)).local(-20).push().pushOperand(m('edi',4*F.cells)).invoke('oleaut32.dll','SafeArrayPutElement').test().branch('s',invalid);
  const version=x.unique();x.cmp(m('edi',4*F.version),2147483647).branch('ne',version).mov(m('edi',4*F.version),0).label(version).inc(m('edi',4*F.version)).mov(m('ebp',-16),1);
  x.pushOperand(0).pushOperand(0).pushOperand(m('esi',R.grid)).invoke('user32.dll','InvalidateRect').jump(close);
  x.label(invalid).mov(m('ebp',-8),7);
  x.label(close).pushOperand('esi').call(label('close'));
  x.value(a(-12)).test().branch('e',noFocus).mov('edi',m('esi',R.state)).mov('eax',m('edi',80)).cmp('eax',m('esi',R.epoch)).branch('ne',noFocus).pushOperand(m('esi',R.grid)).invoke('user32.dll','IsWindow').test().branch('e',noFocus).pushOperand(m('esi',R.grid)).invoke('user32.dll','SetFocus');
  x.label(noFocus).value(a(-16)).test().branch('e',free).mov('edi',m('esi',R.state)).pushOperand('esi').pushOperand(1).pushOperand(0x8007).pushOperand(m('edi',140)).invoke('user32.dll','SendMessageW');
  x.label(free).api('oleaut32.dll','SysFreeString',[a(-4)]).pushOperand('esi').call(label('release')).value(a(-8)).test().branch('ne','native:error:raise');
  x.label(done).value(0).leave(12);
 },
 emitNativeGridEditProcedure(){
  const x=this.x,none=x.unique(),fallback=x.unique(),exit=x.unique(),zero=x.unique(),destroy=x.unique(),query=x.unique(),key=x.unique(),character=x.unique(),dispatch=x.unique();
  x.label(label('procedure')).enter(32);this.enterCallbackBoundary(-12);
  x.api('user32.dll','GetWindowLongW',[a(8),-21]).test().branch('e',none).mov('esi','eax').mov('edi',m('esi',R.proc));
  x.value(a(12)).compare(0x82).branch('e',destroy).compare(0x87).branch('e',query).compare(0x100).branch('e',key).compare(0x102).branch('e',character).jump(fallback);
  x.label(query).value(a(16)).compare(13).branch('e',query+':wanted').compare(27).branch('ne',fallback).label(query+':wanted').value(0x84).jump(exit);
  x.label(character).value(a(16)).compare(13).branch('e',zero).compare(27).branch('e',zero).jump(fallback);
  x.label(key).value(a(16)).compare(13).branch('e',key+':enter').compare(27).branch('ne',fallback).value(0).jump(dispatch).label(key+':enter').value(1);
  x.label(dispatch).cmp(m('esi',R.phase),0).branch('ne',zero).pushOperand(m('ebp',8)).push().pushOperand(0x8006).pushOperand(m('esi',R.grid)).invoke('user32.dll','SendMessageW').jump(zero);
  x.label(destroy).mov(m('esi',R.phase),2).mov(m('esi',R.edit),0).mov('ebx',m('esi',R.state));
  const different=x.unique();x.value(a(8)).cmp('eax',m('ebx',108)).branch('ne',different).mov(m('ebx',108),0).mov(m('ebx',112),0).label(different);
  x.push(a(20)).push(a(16)).push(a(12)).push(a(8)).pushOperand('edi').invoke('user32.dll','CallWindowProcW').mov(m('ebp',-4),'eax').pushOperand(0).pushOperand(-21).push(a(8)).invoke('user32.dll','SetWindowLongW').pushOperand('esi').call(label('release')).value(a(-4)).jump(exit);
  x.label(fallback).push(a(20)).push(a(16)).push(a(12)).push(a(8)).pushOperand('edi').invoke('user32.dll','CallWindowProcW').jump(exit);
  x.label(none).api('user32.dll','DefWindowProcW',[a(8),a(12),a(16),a(20)]).jump(exit).label(zero).value(0).label(exit);this.leaveCallbackBoundary(-12);x.leave(16);
 }
};

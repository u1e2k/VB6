/** HWND dispatch around the private grid kernel. Paint HDCs are always ended
 * before propagating a VB error back across the callback boundary. */
const arg=argument=>({argument}),mem=memory=>({memory}),save=(x,n)=>x.emit(0x89,0x85).imm(n);
export const nativeGridWindowMethods={
 gridWindowMessages(control,zero,exit,fallback){
  if(!this.isNativeGrid(control))return;
  this.gridEditWindowMessages(control,zero,exit,fallback);
  const x=this.x,skip=x.unique(),paint=x.unique(),size=x.unique(),keys=x.unique(),mouse=x.unique(),scroll=x.unique(),wheel=x.unique();
  const args=[control.gridIndex,arg(8),{memory:control.state,addend:80}];
  const call=(name,extra=[])=>{for(const v of [...args,...extra].reverse())x.push(v);x.call(this.gridProc(name).label);this.checkNativeError();};
  x.value({memory:control.state,addend:80}).test().branch('e',fallback);
  x.value(arg(12)).compare(0x87).branch('ne',skip).value(0x81).jump(exit).label(skip);
  x.compare(0x14).branch('e',zero).compare(0xf).branch('e',paint).compare(0x318).branch('e',paint).compare(5).branch('e',size).compare(0x100).branch('e',keys).compare(0x201).branch('e',mouse).compare(0x203).branch('e',mouse).compare(0x114).branch('e',scroll).compare(0x115).branch('e',scroll).compare(0x20a).branch('e',wheel).jump(fallback);
  x.label(size).api('user32.dll','InvalidateRect',[arg(8),0,0]).jump(zero);
  x.label(paint).value(0);save(x,-168);call('getfield',[12]);save(x,-44);
  const begin=x.unique(),ready=x.unique(),paintEnd=x.unique(),paintDone=x.unique();
  x.value(arg(12)).compare(0x318).branch('ne',begin).value(arg(16)).jump(ready);
  x.label(begin).local(-112).push().push(arg(8)).invoke('user32.dll','BeginPaint');
  x.label(ready);save(x,-48);x.test().branch('e',paintEnd);x.push().invoke('gdi32.dll','SaveDC');save(x,-168);x.test().branch('e',paintEnd);
  x.local(-132).push().push(arg(8)).invoke('user32.dll','GetClientRect').test().branch('e',paintEnd);
  x.value(arg(-44)).test().branch('e',paintEnd);
  this.nativeControlColors=true;x.value({memory:control.state,addend:32}).push().call('native:control:ole-color').push().push(arg(-48)).invoke('gdi32.dll','SetDCBrushColor').api('gdi32.dll','GetStockObject',[18]).push().local(-132).push().push(arg(-48)).invoke('user32.dll','FillRect');
  x.value(arg(-120)).emit(0x6b,0xc0,15).push().value(arg(-124)).emit(0x6b,0xc0,15).push().push(arg(-48)).push(args[2]).push(arg(8)).push(control.gridIndex).call(this.gridProc('paint').label);
  x.label(paintEnd).value(arg(-168)).test().branch('e',paintDone+':restore').push().push(arg(-48)).invoke('gdi32.dll','RestoreDC').label(paintDone+':restore').value(arg(12)).compare(0x318).branch('e',paintDone).local(-112).push().push(arg(8)).invoke('user32.dll','EndPaint');
  x.label(paintDone);this.checkNativeError();x.jump(zero);
  x.label(keys);const accept=x.unique();x.value(arg(16));for(const k of [33,34,35,36,37,38,39,40])x.compare(k).branch('e',accept);x.jump(fallback).label(accept);
  x.api('user32.dll','GetKeyState',[16]).emit(0x25).imm(0x8000);save(x,-36);call('keymove',[arg(16),arg(-36)]);x.jump(zero);
  x.label(mouse).api('user32.dll','SetFocus',[arg(8)]);
  x.value(arg(20)).emit(0x0f,0xbf,0xc0,0x6b,0xc0,15);save(x,-36);x.value(arg(20)).emit(0xc1,0xf8,16,0x6b,0xc0,15);save(x,-40);
  x.value(arg(16)).emit(0x83,0xe0,4);save(x,-44);
  const dbl=x.unique();x.value(arg(12)).compare(0x203).value(8).branch('ne',dbl).value(16).label(dbl);save(x,-48);
  call('mouseselect',[arg(-36),arg(-40),arg(-44),arg(-48)]);x.value(arg(12)).compare(0x203).branch('ne',zero).value(arg(8)).emit(0x3b,0x05).addr(control.handle).branch('ne',zero).push(0).push(arg(8)).call('native:grid:edit-begin').jump(zero);
  x.label(scroll).value(arg(20)).test().branch('ne',fallback).value(arg(12)).emit(0x2d).imm(0x114);save(x,-36);
  x.value(arg(16)).emit(0x25).imm(65535);save(x,-40);x.value(0);save(x,-136);
  const tracked=x.unique();x.value(arg(-40)).compare(4).branch('e',tracked+':read').compare(5).branch('ne',tracked);
  x.label(tracked+':read').value(28);save(x,-160);x.value(0x10);save(x,-156);x.local(-160).push().push(arg(-36)).push(arg(8)).invoke('user32.dll','GetScrollInfo').test().branch('e',zero);
  x.label(tracked);call('scroll',[arg(-36),arg(-40),arg(-136)]);x.jump(zero);
  // Each full wheel detent moves three rows; sub-detent deltas are retained by
  // the kernel rather than promoting every precision-scroll event to one row.
  x.label(wheel).value(arg(16)).emit(0xc1,0xf8,16);save(x,-36);call('wheel',[arg(-36)]);x.jump(zero);
 },
 gridNotificationMessages(module,zero,fallback){
  const grids=[...module.controls.values()].filter(c=>this.isNativeGrid(c));if(!grids.length)return;
  const x=this.x,after=x.unique();x.value(arg(12)).compare(0x8005).branch('ne',after).value(mem(module.loaded)).test().branch('e',zero);
  for(const control of grids){const next=x.unique();x.value(arg(20)).test().branch('e',zero).emit(0x3b,0x05).addr(control.handle).branch('ne',next);
   for(const [mask,event]of [[1,'RowColChange'],[2,'SelChange'],[4,'Scroll'],[8,'Click'],[16,'DblClick']]){
    const no=x.unique();x.value(arg(16)).emit(0xa9).imm(mask).branch('e',no);this.controlHandler(module,control,event);x.value(arg(20)).emit(0x3b,0x05).addr(control.handle).branch('ne',zero);x.label(no);
   }x.jump(zero).label(next);
  }x.jump(fallback).label(after);
 }
};

const arg=argument=>({argument});
export const nativeChartHostMethods={
 emitChartHost(name,proc){const x=this.x,ret=proc.argumentBytes,save=n=>x.emit(0x89,0x85).imm(n);
  if(name==='buffernew'){const valid=x.unique();x.label(proc.label).enter().value(arg(12)).compare(5).branch('e',valid).compare(8).branch('ne','error:13').label(valid).value(arg(8)).compare(Math.min(1048576,Math.floor(this.maxArrayBytes/8))).branch('a','error:7').api('oleaut32.dll','SafeArrayCreateVector',[arg(12),0,arg(8)]).test().branch('e','error:7').leave(ret);return;}
  if(['bufferfree','buffertext','bufferwrite','hostinvalidate'].includes(name)){this.emitGridHost(name,proc);return;}
  if(name==='finite'){x.label(proc.label).enter().value(arg(12)).emit(0x25).imm(0x7ff00000).compare(0x7ff00000);this.boolean('<>');x.leave(ret);return;}
  if(name==='numberget'){x.label(proc.label).enter(8).local(-8).push().local(12).push().push(arg(8)).invoke('oleaut32.dll','SafeArrayGetElement').call('native:array:check').emit(0xdd,0x45,0xf8).leave(ret);return;}
  if(name==='numberput'){x.label(proc.label).enter().local(16).push().local(12).push().push(arg(8)).invoke('oleaut32.dll','SafeArrayPutElement').call('native:array:check').value(0).leave(ret);return;}
  if(name==='hostdraw'){
   const done=x.unique(),line=x.unique(),rect=x.unique(),restore=x.unique(),font=x.unique();this.nativeControlColors=true;
   x.label(proc.label).enter(32).api('gdi32.dll','SaveDC',[arg(12)]).test().branch('e',done);save(-4);
   x.push(arg(40)).call('native:control:ole-color');save(-8);
   for(let i=0;i<4;i++){x.value(arg(20+i*4));save(-24+i*4);}
   x.value(arg(16)).compare(0).branch('e',line).compare(1).branch('e',rect);
   x.api('gdi32.dll','SetTextColor',[arg(12),arg(-8)]).api('gdi32.dll','SetBkMode',[arg(12),1]).api('user32.dll','SendMessageW',[arg(8),0x31,0,0]).test().branch('ne',font).api('gdi32.dll','GetStockObject',[17]).label(font).push().push(arg(12)).invoke('gdi32.dll','SelectObject');
   x.api('oleaut32.dll','SysStringLen',[arg(36)]).emit(0x89,0xc3).push(0x8825).local(-24).push().emit(0x53).push(arg(36)).push(arg(12)).invoke('user32.dll','DrawTextW').jump(restore);
   x.label(line).api('gdi32.dll','SetDCPenColor',[arg(12),arg(-8)]).api('gdi32.dll','GetStockObject',[19]).push().push(arg(12)).invoke('gdi32.dll','SelectObject').api('gdi32.dll','MoveToEx',[arg(12),arg(20),arg(24),0]).api('gdi32.dll','LineTo',[arg(12),arg(28),arg(32)]).jump(restore);
   x.label(rect).api('gdi32.dll','SetDCBrushColor',[arg(12),arg(-8)]).api('gdi32.dll','GetStockObject',[18]).push().local(-24).push().push(arg(12)).invoke('user32.dll','FillRect');
   x.label(restore).api('gdi32.dll','RestoreDC',[arg(12),arg(-4)]).label(done).value(0).leave(ret);return;
  }throw new Error('Unknown chart host '+name);
 }
};

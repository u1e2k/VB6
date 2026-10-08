/** Small private kernel intrinsics. SAFEARRAY/BSTR ownership follows OleAut32:
 * GetElement allocates a BSTR copy; PutElement takes a BSTR, not BSTR**.
 * https://learn.microsoft.com/en-us/windows/win32/api/oleauto/nf-oleauto-safearrayputelement
 * Drawing uses stock DC_BRUSH and SaveDC/RestoreDC, with no per-cell GDI allocation.
 */
const arg=argument=>({argument}),save=(x,offset)=>x.emit(0x89,0x85).imm(offset);
export const nativeGridHostMethods={
 emitGridHost(name,proc){
  const x=this.x,label=proc.label,ret=proc.argumentBytes;
  if(name==='buffernew'){
   const good=x.unique();x.label(label).enter().value(arg(12)).compare(3).branch('e',good).compare(8).branch('ne','error:13').label(good);
   x.value(arg(8)).compare(0).branch('l','error:9').compare(Math.min(1048576,Math.floor(this.maxArrayBytes/4))).branch('a','error:7');
   x.api('oleaut32.dll','SafeArrayCreateVector',[arg(12),0,arg(8)]).test().branch('e','error:7').leave(ret);return;
  }
  if(name==='bufferfree'){
   const end=x.unique();x.label(label).enter().value(arg(8)).test().branch('e',end).push().invoke('oleaut32.dll','SafeArrayDestroy').call('native:array:check');x.label(end).value(0).leave(ret);return;
  }
  if(name==='buffercopy'){
   x.label(label).enter(4).value(0);save(x,-4);x.local(-4).push().push(arg(8)).invoke('oleaut32.dll','SafeArrayCopy').call('native:array:check').value(arg(-4)).leave(ret);return;
  }
  if(name==='bufferget'||name==='buffertext'){
   x.label(label).enter(4).value(0);save(x,-4);x.local(-4).push().local(12).push().push(arg(8)).invoke('oleaut32.dll','SafeArrayGetElement').call('native:array:check').value(arg(-4)).leave(ret);return;
  }
  if(name==='bufferput'||name==='bufferwrite'){
   x.label(label).enter();if(name==='bufferwrite')x.value(arg(16));else x.local(16);
   x.push().local(12).push().push(arg(8)).invoke('oleaut32.dll','SafeArrayPutElement').call('native:array:check').value(0).leave(ret);return;
  }
  if(name==='hostinvalidate'){x.label(label).enter().api('user32.dll','InvalidateRect',[arg(8),0,0]).leave(ret);return;}
  if(name==='hostnotify'){
   const end=x.unique();x.label(label).enter().api('user32.dll','GetWindowLongW',[arg(8),-21]).test().branch('e',end).emit(0x8b,0x80).imm(140).test().branch('e',end).emit(0x89,0xc3);
   x.push(arg(8)).push(arg(12)).push(0x8005).emit(0x53).invoke('user32.dll','SendMessageW').label(end).leave(ret);return;
  }
  if(name==='hostcolors'){
   const end=x.unique();x.label(label).enter().api('user32.dll','GetWindowLongW',[arg(8),-21]).test().branch('e',end).emit(0x89,0xc3);
   for(let i=0;i<5;i++)x.value(arg(12+i*4)).emit(0x89,0x83).imm(88+i*4);
   x.label(end).value(0).leave(ret);return;
  }
  if(name==='hostbars'){
   const show=x.unique(),styleReady=x.unique(),needShow=x.unique(),end=x.unique(),set=x.unique(),bounds=x.unique();
   x.label(label).enter(56);
   // Do not send a size-changing message on every paint when the style already
   // agrees. The rectangle and scroll records belong to this invocation.
   x.api('user32.dll','GetWindowLongW',[arg(8),-16]).emit(0x89,0xc3).value(arg(12)).test().value(0x100000).branch('e',styleReady).value(0x200000).label(styleReady).emit(0x21,0xd8).test().branch('ne',show);
   x.value(arg(32)).test().branch('ne',needShow).jump(end+':info');
   x.label(show).value(arg(32)).test().branch('ne',end+':info');
   x.label(needShow).api('user32.dll','ShowScrollBar',[arg(8),arg(12),arg(32)]);
   x.label(end+':info').value(arg(32)).test().branch('e',end);
   x.value(28);save(x,-28);x.value(7);save(x,-24);
   x.local(-28).push().push(arg(12)).push(arg(8)).invoke('user32.dll','GetScrollInfo');save(x,-44);
   x.value(arg(20)).emit(0x3b,0x45,16).branch('ge',bounds).value(arg(16)).label(bounds);save(x,-36);
   x.value(arg(24)).compare(1);const page=x.unique();x.branch('ge',page).value(1).label(page);save(x,-40);
   x.value(arg(-44)).test().branch('e',set);
   for(const [old,now]of [[-20,16],[-16,-36],[-12,-40],[-8,28]])x.value(arg(old)).emit(0x3b,0x85).imm(now).branch('ne',set);
   x.jump(end).label(set).value(15);save(x,-24);x.value(arg(16));save(x,-20);x.value(arg(-36));save(x,-16);x.value(arg(-40));save(x,-12);x.value(arg(28));save(x,-8);
   x.push(1).local(-28).push().push(arg(12)).push(arg(8)).invoke('user32.dll','SetScrollInfo');
   x.label(end).value(0).leave(ret);return;
  }
  if(name==='hostcell'){
   this.nativeControlColors=true;
   const normal=x.unique(),fixed=x.unique(),colors=x.unique(),font=x.unique(),align=x.unique(),center=x.unique(),border=x.unique(),done=x.unique();
   x.label(label).enter(48).api('user32.dll','GetWindowLongW',[arg(8),-21]).test().branch('e',done).emit(0x89,0xc6);
   x.api('gdi32.dll','SaveDC',[arg(12)]).test().branch('e',done);save(x,-4);
   // RECT is computed before GDI calls; coordinates are nonnegative twips.
   for(const [source,offset,sum]of [[16,-24,null],[20,-20,null],[16,-16,24],[20,-12,28]]){
    x.value(arg(source));if(sum)x.emit(0x03,0x85).imm(sum);x.emit(0x83,0xc0,7,0x99,0xb9).imm(15).emit(0xf7,0xf9);save(x,offset);
   }
   x.value(arg(36)).emit(0xa8,2).branch('e',fixed).emit(0x8b,0x46,96,0x8b,0x5e,100).jump(colors);
   x.label(fixed).value(arg(36)).emit(0xa8,1).branch('e',normal).emit(0x8b,0x46,88,0x8b,0x5e,92).jump(colors);
   x.label(normal).emit(0x8b,0x46,32,0x8b,0x5e,36).label(colors).push().call('native:control:ole-color').push().push(arg(12)).invoke('gdi32.dll','SetDCBrushColor');
   x.api('gdi32.dll','GetStockObject',[18]).push().local(-24).push().push(arg(12)).invoke('user32.dll','FillRect');
   x.emit(0x53).call('native:control:ole-color').push().push(arg(12)).invoke('gdi32.dll','SetTextColor').api('gdi32.dll','SetBkMode',[arg(12),1]);
   x.api('user32.dll','SendMessageW',[arg(8),0x31,0,0]).test().branch('ne',font).api('gdi32.dll','GetStockObject',[17]).label(font).push().push(arg(12)).invoke('gdi32.dll','SelectObject');
   x.api('oleaut32.dll','SysStringLen',[arg(32)]).emit(0x89,0xc7).value(arg(40)).compare(2).branch('e',center).compare(1).branch('ne',align).value(2).jump(align+':done').label(center).value(1).jump(align+':done').label(align).value(0).label(align+':done').emit(0x0d).imm(0x8824).push();
   x.emit(0x83,0x45,0xe8,3,0x83,0x6d,0xf0,3).local(-24).push().emit(0x57).push(arg(32)).push(arg(12)).invoke('user32.dll','DrawTextW');
   x.emit(0x83,0x6d,0xe8,3,0x83,0x45,0xf0,3).value(arg(36)).emit(0xa8,4).branch('e',border);
   x.emit(0xff,0x76,104).call('native:control:ole-color').push().push(arg(12)).invoke('gdi32.dll','SetDCBrushColor').api('gdi32.dll','GetStockObject',[18]).push().local(-24).push().push(arg(12)).invoke('user32.dll','FrameRect');
   x.label(border).api('gdi32.dll','RestoreDC',[arg(12),arg(-4)]).label(done).value(0).leave(ret);return;
  }
  throw new Error('Unknown private grid host '+name);
 }
};

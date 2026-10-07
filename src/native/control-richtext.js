/** RichEdit streaming. Callback errors return through EDITSTREAM.dwError; they
 * never jump across Windows frames into a suspended VB error handler.
 * https://learn.microsoft.com/en-us/windows/win32/controls/em-streamin
 * https://learn.microsoft.com/en-us/windows/win32/controls/em-streamout
 * Literal Unicode input uses UTF-8; ASCII RTF retains its own code pages.
 * Output uses standard escaped 7-bit RTF,
 * not the UTF-8-specific URTF dialect; ASCII output is also valid UTF-8.
 * Independent Windows implementation reference (no source copied):
 * https://github.com/wxWidgets/wxWidgets/blob/master/src/msw/textctrl.cpp
 * File streams retain Windows' native SF_RTF / SF_TEXT byte representation.
 */
import {MAX_NATIVE_STRING} from './storage.js';
import {foldNativeInteger} from './optimizer.js';
const arg=argument=>({argument}),mem=memory=>({memory}),lit=value=>({kind:'literal',value});
const R='native:rich:',OLE='oleaut32.dll',K='kernel32.dll',U='user32.dll';
const UTF8_RTF=((65001<<16)|0x20|2)>>>0;
const MAX_BYTES=MAX_NATIVE_STRING*4;
const save=(x,offset)=>x.emit(0x89,0x45,offset&255);
export const nativeRichTextMethods={
  useNativeRichText(feature){(this.nativeRichTextFeatures ||= new Set()).add(feature);},
  initializeNativeRichText(control){
    if(control.model.type!=='RichTextBox')return;
    const rtf=control.model.properties.TextRTF;if(rtf===undefined||rtf===null||rtf==='')return;
    if(typeof rtf!=='string'||rtf.length>MAX_NATIVE_STRING)this.fail('Native TextRTF must be a String of at most '+MAX_NATIVE_STRING+' UTF-16 units',control.module);
    this.useNativeRichText('set');
    const bytes=new TextEncoder().encode(rtf),label='control-rtf:'+control.module.name+':'+control.key;
    this.ro.label(label);for(let i=0;i<bytes.length;i+=8192)this.ro.emit(...bytes.subarray(i,i+8192));
    this.x.push(bytes.length).push(label).push(mem(control.handle)).call(R+'set');
  },
  getNativeRichTextProperty(object,property){
    if(object.model?.type!=='RichTextBox'||!['textrtf','selrtf'].includes(property))return false;
    this.ensure(object);this.useNativeRichText('get');
    const bytes=this.temporaryString(),wide=this.temporaryString(),x=this.x;
    this.rawStorageAddress(bytes);x.push().push(property==='selrtf'?0x8000:0).push(this.controlHandleRef(object)).call(R+'get');
    this.nativeConvertString(wide,'from-utf8');return true;
  },
  setNativeRichTextProperty(object,property,expr){
    if(object.model?.type!=='RichTextBox'||!['textrtf','selrtf'].includes(property))return false;
    this.useNativeRichText('set');const bytes=this.temporaryString(),x=this.x;
    this.textExpression(expr);this.nativeConvertString(bytes,'to-utf8');
    x.push().invoke(OLE,'SysStringByteLen').push();this.rawStorageAddress(bytes);x.emit(0x8b,0x00).push();
    if(property==='selrtf')this.useNativeRichText('set-selection');
    x.push(this.controlHandleRef(object)).call(R+(property==='selrtf'?'set-selection':'set'));return true;
  },
  nativeRichTextMethod(object,method,args){
    if(object.model?.type!=='RichTextBox'||!['loadfile','savefile'].includes(method))return false;
    if(args.length<1||args.length>2)this.fail(method+' expects a path and optional file type (0=RTF, 1=text)');
    const known=args[1]?foldNativeInteger(args[1],node=>this.nativeConstant(node))?.value:undefined;if(known!==undefined&&known!==null&&![0,1].includes(known))this.fail('RichTextBox file type must be 0 (RTF) or 1 (text)');
    this.ensure(object);this.useNativeRichText(method);
    // Preserve evaluation order and the path across evaluation of fileType.
    const x=this.x;this.textExpression(args[0]);x.push().call('native:string:copy');const path=this.ownString();
    this.numeric(args[1]||lit(0));x.compare(0).branch('l','error:5').compare(1).branch('g','error:5').push();
    this.rawStorageAddress(path);x.emit(0x8b,0x00).push().push(this.controlHandleRef(object)).call(R+method);return true;
  },
  emitNativeRichTextHelpers(){
    const features=this.nativeRichTextFeatures;if(!features?.size)return;
    const x=this.x;
    if(features.has('set')){
      // Do not override font/ANSI code pages in ordinary ASCII RTF: the
      // document may contain \'hh escapes using several native font charsets.
      // Only raw non-ASCII UTF-8 bytes require SF_USECODEPAGE. Scan the counted
      // buffer, not a NUL-terminated view; do not read beyond the input length.
      const scan=x.unique(),utf8=x.unique(),flagsDone=x.unique();
      x.label(R+'input-flags').enter().value(arg(12)).emit(0x89,0xc1).value(arg(8)).emit(0x89,0xc2).value(2).emit(0x85,0xc9).branch('e',flagsDone);
      x.label(scan).emit(0xf6,0x02,0x80).branch('ne',utf8).emit(0x42,0x49).branch('ne',scan).jump(flagsDone);
      x.label(utf8).value(UTF8_RTF).label(flagsDone).leave(8);
      const bounded=x.unique(),bad=x.unique();
      x.label(R+'read-memory').enter().value(arg(20)).emit(0xc7,0x00,0,0,0,0).value(arg(16)).test().branch('s',bad).emit(0x89,0xc1).value(arg(8)).emit(0x89,0xc3,0x3b,0x4b,4).branch('be',bounded).emit(0x8b,0x4b,4).label(bounded);
      x.value(arg(20)).emit(0x89,0x08,0x29,0x4b,4,0x8b,0x33,0x01,0x0b).value(arg(12)).emit(0x89,0xc7,0xfc,0xf3,0xa4).value(0).leave(16);
      x.label(bad).value(5).leave(16);
      for(const selection of [false,...(features.has('set-selection')?[true]:[])]){
        x.label(R+(selection?'set-selection':'set')).enter(20);
        x.value(arg(12));save(x,-8);x.value(arg(16));save(x,-4);
        x.local(-8);save(x,-20);x.value(0);save(x,-16);x.value(R+'read-memory');save(x,-12);
        x.push(arg(16)).push(arg(12)).call(R+'input-flags');
        if(selection)x.emit(0x0d).imm(0x8000);
        x.emit(0x89,0xc3).local(-20).push().emit(0x53).push(0x449).push(arg(8)).invoke(U,'SendMessageW');
        x.value(arg(-16)).test().branch('ne','error:5').value(0).leave(12);
      }
    }
    if(features.has('get')){
      const fail=x.unique(),done=x.unique(),copy=x.unique(),grow=x.unique(),capacityReady=x.unique(),zero=x.unique();
      x.label(R+'write-memory').enter(8).value(arg(20)).emit(0xc7,0x00,0,0,0,0).value(arg(16)).test().branch('s',fail).branch('e',zero);
      x.value(arg(8)).emit(0x89,0xc3).value(arg(16)).emit(0x03,0x43,4).branch('c',fail).compare(MAX_BYTES).branch('a',fail);save(x,-4);
      x.emit(0x3b,0x43,8).branch('be',copy).emit(0x8b,0x43,8).test().branch('ne',grow).value(4096);
      x.label(grow).emit(0x3b,0x45,0xfc).branch('ae',capacityReady).emit(0xd1,0xe0).jump(grow);
      x.label(capacityReady);save(x,-8);x.push().push(0).invoke(OLE,'SysAllocStringByteLen').test().branch('e',fail).emit(0x89,0xc7,0x8b,0x33,0x8b,0x4b,4,0x57,0xfc,0xf3,0xa4,0xff,0x33).invoke(OLE,'SysFreeString').emit(0x58,0x89,0x03).value(arg(-8)).emit(0x89,0x43,8);
      x.label(copy).emit(0x8b,0x3b,0x03,0x7b,4).value(arg(12)).emit(0x89,0xc6).value(arg(16)).emit(0x89,0xc1,0xfc,0xf3,0xa4).value(arg(-4)).emit(0x89,0x43,4).value(arg(16)).emit(0x89,0xc1).value(arg(20)).emit(0x89,0x08);
      x.label(zero).value(0).jump(done).label(fail).value(7).label(done).leave(16);
      const freeError=x.unique(),success=x.unique();
      // cookie = [BSTR capacity buffer, used bytes, capacity]; ES/cookie are local
      // to each call, so nested streaming never reuses another operation's state.
      x.label(R+'get').enter(24).value(0);for(const offset of [-12,-8,-4,-20])save(x,offset);
      x.local(-12);save(x,-24);x.value(R+'write-memory');save(x,-16);
      // Without SF_USECODEPAGE, RichEdit preserves Unicode through RTF escapes.
      // Keep SFF_SELECTION from the caller, but never request a URTF header.
      x.local(-24).push().value(arg(12)).emit(0x0d).imm(2).push().push(0x44a).push(arg(8)).invoke(U,'SendMessageW');
      x.value(arg(-20)).test().branch('ne',freeError);
      x.api(OLE,'SysAllocStringByteLen',[arg(-12),arg(-8)]).emit(0x89,0xc6);
      x.api(OLE,'SysFreeString',[arg(-12)]).emit(0x85,0xf6).branch('e','error:7');
      x.value(arg(16)).emit(0x89,0xc3,0xff,0x33).invoke(OLE,'SysFreeString').emit(0x89,0x33,0x89,0xf0).jump(success);
      x.label(freeError).api(OLE,'SysFreeString',[arg(-12)]).value(arg(-20)).jump('native:error:raise');
      x.label(success).leave(12);
    }
    for(const method of ['loadfile','savefile'])if(features.has(method)){
      const read=method==='loadfile',failed=x.unique(),ok=x.unique(),mode=x.unique(),closed=x.unique();
      x.label(R+method+'-callback').enter().value(arg(20)).emit(0xc7,0x00,0,0,0,0).value(arg(16)).test().branch('s',failed);
      x.api(K,read?'ReadFile':'WriteFile',[arg(8),arg(12),arg(16),arg(20),0]).test().branch('e',failed);
      if(!read){x.value(arg(20)).emit(0x8b,0x00,0x3b,0x45,16).branch('ne',failed);}
      x.value(0).jump(ok).label(failed).value(read?62:61).label(ok).leave(16);
      x.label(R+method).enter(20).api(K,'CreateFileW',[arg(12),read?0x80000000:0x40000000,read?1:0,0,read?3:2,0x80,0]).compare(-1);
      const opened=x.unique();x.branch('ne',opened).api(K,'GetLastError').store('native:error:lastdllerror').value(75).jump('native:error:raise').label(opened);save(x,-20);save(x,-12);
      x.value(0);save(x,-8);x.value(R+method+'-callback');save(x,-4);
      x.value(arg(16)).test().branch('e',mode).value(1).jump(closed).label(mode).value(2).label(closed).emit(0x89,0xc3).local(-12).push().emit(0x53).push(read?0x449:0x44a).push(arg(8)).invoke(U,'SendMessageW');
      x.api(K,'CloseHandle',[arg(-20)]).value(arg(-8)).test().branch('ne','native:error:raise').value(0).leave(12);
    }
  }
};

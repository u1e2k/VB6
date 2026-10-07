/** Mutable per-control fonts. The initial HFONT stays in the existing shared
 * cache; replacement fonts and face strings have explicit per-control ownership.
 * No mutable font payload or helper is emitted without a font property access. */
export const NATIVE_FONT_PROPERTIES=new Set(['fontname','fontsize','fontbold','fontitalic','fontunderline','fontstrikethrough','fontstrikethru']);
const mem=memory=>({memory}),arg=argument=>({argument});
export const nativeControlFontMethods={
  prepareNativeFontAccess(object){
    const controls=object.indexed||object.boundIndex?[...object.group.entries.values()]:[object];
    for(const control of controls)if(!control.fontState){
      const p={...control.module.form.properties,...control.model.properties};
      control.fontSeed={name:String(p.FontName||'MS Sans Serif'),size:Number(p.FontSize||8.25),weight:p.FontBold?700:400,italic:p.FontItalic?1:0,underline:p.FontUnderline?1:0,strike:p.FontStrikethrough||p.FontStrikethru?1:0};
      if(control.fontSeed.name.length>31||control.fontSeed.name.includes('\0'))this.fail('Native font face names must contain at most 31 non-NUL UTF-16 units');
      control.fontState='control-font-state:'+control.module.name+':'+control.key;this.data.align(8).label(control.fontState).zero(48);
    }
  },
  initializeNativeControlFont(control){
    if(!control.fontState)return;
    const x=this.x,s=control.fontSeed,f=control.fontState;
    x.value(f).store(control.state,72).value(0).store(f).store(f,8).value(this.string(s.name)).store(f,4).value(Math.round(s.size*100)).store(f,12);
    for(const [offset,value]of [[16,s.weight],[20,s.italic],[24,s.underline],[28,s.strike]])x.value(value).store(f,offset);
    const number=this.floatLiteral(s.size);x.value(mem(number)).store(f,40).value({memory:number,addend:4}).store(f,44);
  },
  nativeFontState(object){this.nativeControlState(object);this.x.emit(0x8b,0x40,72).test().branch('e','error:5');},
  getNativeFontProperty(object,property){
    if(!object.model||object.model.type==='Timer'||!NATIVE_FONT_PROPERTIES.has(property))return false;
    this.prepareNativeFontAccess(object);this.ensure(object);this.nativeFontState(object);const x=this.x;
    if(property==='fontname'){x.emit(0xff,0x70,4).invoke('oleaut32.dll','SysAllocString');this.ownString();return true;}
    if(property==='fontsize'){const out=this.floatWorkspace();x.emit(0x8b,0x48,40,0x8b,0x50,44);this.rawStorageAddress(out);x.emit(0x89,0x08,0x89,0x50,4);return true;}
    x.emit(0x8b,0x40,{fontbold:16,fontitalic:20,fontunderline:24,fontstrikethrough:28,fontstrikethru:28}[property]);
    if(property==='fontbold'){x.compare(400);this.boolean('>');}else x.emit(0xf7,0xd8);return true;
  },
  setNativeFontProperty(object,property,expr){
    if(!object.model||object.model.type==='Timer'||!NATIVE_FONT_PROPERTIES.has(property))return false;
    this.prepareNativeFontAccess(object);this.nativeMutableFonts=true;const x=this.x;
    if(property==='fontname'){
      this.textExpression(expr);x.emit(0x89,0xc3).push().invoke('kernel32.dll','lstrlenW').compare(31).branch('g','error:5').test().branch('e','error:5').emit(0x53).invoke('oleaut32.dll','SysAllocString').test().branch('e','error:7').push();
      this.nativeFontState(object);x.emit(0x89,0xc6,0x5f);const borrowed=x.unique();x.emit(0x83,0x7e,8,0).branch('e',borrowed).emit(0xff,0x76,4).invoke('oleaut32.dll','SysFreeString').label(borrowed).emit(0x89,0x7e,4,0xc7,0x46,8,1,0,0,0);
    }else if(property==='fontsize'){
      this.floatExpression(expr);x.call('native:number:finite').emit(0x89,0xc3).push(this.floatLiteral(1)).emit(0x53).call('native:number:compare').test().branch('s','error:5');
      x.push(this.floatLiteral(512)).emit(0x53).call('native:number:compare').compare(0).branch('g','error:5');this.nativeFontState(object);x.emit(0x89,0xc6,0x8b,0x03,0x89,0x46,40,0x8b,0x43,4,0x89,0x46,44);
      const out=this.floatWorkspace();this.rawStorageAddress(out);x.push().push(this.floatLiteral(100)).emit(0x53).call('native:number:multiply').push().call('native:number:integer').emit(0x89,0x46,12);
    }else{
      this.numeric(expr);this.check('Boolean');x.emit(0xf7,0xd8);if(property==='fontbold')x.emit(0x69,0xc0).imm(300).emit(0x05).imm(400);x.push();this.nativeFontState(object);x.emit(0x89,0xc6,0x59,0x89,0x4e,{fontbold:16,fontitalic:20,fontunderline:24,fontstrikethrough:28,fontstrikethru:28}[property]);
    }
    x.emit(0x56).push(this.controlHandleRef(object)).call('native:control:set-font');return true;
  },
  disposeNativeControlFont(control){
    if(!control.fontState)return;
    const x=this.x,f=control.fontState,borrowedFont=x.unique(),borrowedName=x.unique();
    x.value(mem(f)).test().branch('e',borrowedFont).push().invoke('gdi32.dll','DeleteObject').label(borrowedFont);
    x.value({memory:f,addend:8}).test().branch('e',borrowedName).push({memory:f,addend:4}).invoke('oleaut32.dll','SysFreeString').label(borrowedName).value(0).store(f).store(f,8);
  },
  emitNativeFontHelpers(){
    if(!this.nativeMutableFonts)return;
    const x=this.x,borrowed=x.unique();
    x.label('native:control:set-font').enter().value(arg(12)).emit(0x89,0xc6).api('user32.dll','GetDC',[0]).emit(0x89,0xc3).push(90).emit(0x53).invoke('gdi32.dll','GetDeviceCaps').emit(0x89,0xc7).emit(0x53).push(0).invoke('user32.dll','ReleaseDC');
    x.push(7200).emit(0x57,0xff,0x76,12).invoke('kernel32.dll','MulDiv').emit(0xf7,0xd8,0x89,0xc7);
    x.emit(0xff,0x76,4).push(0).push(0).push(0).push(0).push(1).emit(0xff,0x76,28,0xff,0x76,24,0xff,0x76,20,0xff,0x76,16).push(0).push(0).push(0).emit(0x57).invoke('gdi32.dll','CreateFontW').test().branch('e','error:7').emit(0x89,0xc7,0x8b,0x1e,0x89,0x3e);
    x.push(1).emit(0x57).push(0x30).push(arg(8)).invoke('user32.dll','SendMessageW').emit(0x85,0xdb).branch('e',borrowed).emit(0x53).invoke('gdi32.dll','DeleteObject').label(borrowed).value(0).leave(8);
  }
};

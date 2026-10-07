/** RichEdit character/paragraph formatting. Records are invocation-local and
 * contain only SDK-defined fields; mixed selections are not silently coerced.
 * https://learn.microsoft.com/windows/win32/api/richedit/ns-richedit-charformat2w_1
 * https://learn.microsoft.com/windows/win32/api/richedit/ns-richedit-paraformat2
 */
import {mem16,mem32} from './x86-operands.js';
const m=(base,displacement=0)=>mem32({base,displacement});
const u='user32.dll',lit=value=>({kind:'literal',value}),key=s=>String(s).toLowerCase();
export const NATIVE_RICH_FORMAT = Object.freeze(Object.fromEntries(Object.entries({
  selbold:{mask:1,effect:1},selitalic:{mask:2,effect:2},selunderline:{mask:4,effect:4},selstrikethru:{mask:8,effect:8},selprotected:{mask:16,effect:16},
  selcolor:{mask:0x40000000,offset:20,color:true},selbackcolor:{mask:0x04000000,offset:96,color:true},
  selfontname:{mask:0x20000000,offset:26,string:true},selfontsize:{mask:0x80000000,offset:12,points:true},
  selalignment:{mask:8,offset:24,paragraph:true,alignment:true},
  selindent:{mask:1,offset:12,paragraph:true},selrightindent:{mask:2,offset:16,paragraph:true},selhangingindent:{mask:4,offset:20,paragraph:true},
  selbullet:{mask:0x20,offset:8,paragraph:true,bullet:true}
}).map(([name,value])=>[name,Object.freeze(value)])));
export const nativeRichFormatMethods = {
  nativeRichFormatType(node){
    if(node.kind!=='member'||this.object(node.object)?.model?.type!=='RichTextBox')return null;
    const f=NATIVE_RICH_FORMAT[key(node.name)];return f?.string?'string':f?.points?'double':null;
  },
  nativeRichFormatRecord(object,format,read){
    const size=format.paragraph?188:116,record=this.arrayWorkspace(size,'rich-format'),x=this.x;
    this.rawStorageAddress(record);x.mov('edi','eax').xor('eax','eax').mov('ecx',size/4).emit(0xfc,0xf3,0xab);
    this.rawStorageAddress(record);x.mov(m('eax'),size);
    if(read)x.push().push(format.paragraph?0:1).push(format.paragraph?0x43d:0x43a).push(this.controlHandleRef(object)).invoke(u,'SendMessageW');
    this.rawStorageAddress(record);return record;
  },
  nativeRichFormatNull(node,name){
    if(name!=='isnull'||node.args.length!==1||node.args[0].kind!=='member')return false;
    const member=node.args[0],object=this.object(member.object),f=NATIVE_RICH_FORMAT[key(member.name)];
    if(object?.model?.type!=='RichTextBox'||!f)return false;
    this.ensure(object);this.useNativeRichText('format');this.nativeRichFormatRecord(object,f,true);
    this.x.mov('eax',m('eax',4)).and('eax',f.mask).test();this.boolean('=');return true;
  },
  getNativeRichFormatProperty(object,property){
    const f=NATIVE_RICH_FORMAT[property];if(object.model?.type!=='RichTextBox'||!f)return false;
    this.ensure(object);this.useNativeRichText('format');this.nativeRichFormatRecord(object,f,true);
    const x=this.x;x.testOperand(m('eax',4),f.mask).branch('e','error:94');
    if(f.effect){x.mov('eax',m('eax',8)).and('eax',f.effect).test();this.boolean('<>');}
    else if(f.string){x.add('eax',f.offset).push().invoke('oleaut32.dll','SysAllocString');this.ownString();}
    else if(f.alignment){x.movzx('eax',mem16({base:'eax',displacement:f.offset})).dec('eax');}
    else if(f.bullet){x.movzx('eax',mem16({base:'eax',displacement:f.offset})).test();this.boolean('<>');}
    else if(f.points){const out=this.floatWorkspace();x.lea('ecx',m('eax',f.offset)).emit(0xdb,0x01);this.rawStorageAddress(out);x.emit(0xdd,0x18);x.push().push(this.floatLiteral(20));this.rawStorageAddress(out);x.emit(0x5a,0x59).push().emit(0x52,0x51).call('native:number:divide');}
    else {x.mov('eax',m('eax',f.offset));if(f.paragraph&&Number(object.module.form.properties.ScaleMode)===3)x.mov('ecx',15).emit(0x99).idiv('ecx');}
    return true;
  },
  setNativeRichFormatProperty(object,property,expr){
    const f=NATIVE_RICH_FORMAT[property];if(object.model?.type!=='RichTextBox'||!f)return false;
    const x=this.x;this.useNativeRichText('format');
    if(f.string){this.textExpression(expr);x.push().call('native:string:copy');const value=this.ownString();x.push().invoke('oleaut32.dll','SysStringLen').compare(1).branch('b','error:380').compare(31).branch('a','error:380');this.rawStorageAddress(value);x.mov('eax',m('eax'));}
    else if(f.points){this.floatExpression(expr);x.push().push(this.floatLiteral(20));const scaled=this.floatWorkspace();this.rawStorageAddress(scaled);x.emit(0x5a,0x59).push().emit(0x52,0x51).call('native:number:multiply');this.floatToInteger();x.compare(1).branch('l','error:380').compare(327670).branch('g','error:380');}
    else {this.numeric(expr);if(f.effect||f.bullet)this.check('Boolean');else if(f.alignment)x.compare(0).branch('l','error:380').compare(3).branch('g','error:380');else if(f.paragraph){if(Number(object.module.form.properties.ScaleMode)===3)x.imul('eax','eax',15).branch('o','error:6');x.compare(-31680).branch('l','error:380').compare(31680).branch('g','error:380');}else if(f.color){this.nativeControlColors=true;x.push().call('native:control:ole-color');}}
    x.push();const record=this.nativeRichFormatRecord(object,f,false);x.popOperand('ecx').mov(m('eax',4),f.mask);
    if(f.effect)x.and('ecx',f.effect).mov(m('eax',8),'ecx');
    else if(f.bullet)x.neg('ecx').mov(mem16({base:'eax',displacement:f.offset}),'cx');
    else if(f.alignment)x.inc('ecx').mov(mem16({base:'eax',displacement:f.offset}),'cx');
    else if(f.string){x.mov('esi','ecx').lea('edi',m('eax',f.offset));const loop=x.unique();x.label(loop).movzx('ecx',mem16({base:'esi'})).mov(mem16({base:'edi'}),'cx').add('esi',2).add('edi',2).testOperand('ecx','ecx').branch('ne',loop);}
    else x.mov(m('eax',f.offset),'ecx');
    this.rawStorageAddress(record);x.push().push(f.paragraph?0:1).push(f.paragraph?0x447:0x444).push(this.controlHandleRef(object)).invoke(u,'SendMessageW').test().branch('e','error:380');return true;
  },
  nativeRichFormatMethod(object,method,args){
    if(object.model?.type!=='RichTextBox')return false;
    const x=this.x;
    if(['redo','canundo','canredo'].includes(method)&&!args.length){this.ensure(object);x.api(u,'SendMessageW',[this.controlHandleRef(object),{redo:0x454,canundo:0xc6,canredo:0x455}[method],0,0]).test();this.boolean('<>');return true;}
    if(method==='getlinefromchar'){
      if(args.length!==1)this.fail('GetLineFromChar expects one character position');this.ensure(object);this.numeric(args[0]);x.compare(-1).branch('l','error:380').push().push(0).push(0x436).push(this.controlHandleRef(object)).invoke(u,'SendMessageW');return true;
    }
    if(method!=='find')return false;
    if(args.length<1||args.length>4)this.fail('RichTextBox.Find expects text, optional start/end and flags');
    this.ensure(object);const find=this.arrayWorkspace(20,'rich-find'),flags=this.arrayWorkspace(4,'rich-find-flags');
    this.textExpression(args[0]);x.push().call('native:string:copy');const text=this.ownString();
    for(const [i,fallback,offset]of [[1,0,0],[2,-1,4]]){this.numeric(args[i]||lit(fallback));x.compare(i===1?0:-1).branch('l','error:380').push();this.rawStorageAddress(find);x.popOperand('ecx').mov(m('eax',offset),'ecx');}
    this.numeric(args[3]||lit(0));x.testOperand('eax',~14>>>0).branch('ne','error:380').push();this.rawStorageAddress(flags);x.popOperand('ecx').mov(m('eax'),'ecx');
    this.rawStorageAddress(text);x.mov('ecx',m('eax'));this.rawStorageAddress(find);x.mov(m('eax',8),'ecx').mov(m('eax',12),-1).mov(m('eax',16),-1).push();
    this.rawStorageAddress(flags);x.mov('eax',m('eax')).shift('shr','eax',1).and('eax',3).shift('shl','eax',1).or('eax',1).push().push(0x47c).push(this.controlHandleRef(object)).invoke(u,'SendMessageW');
    // VB rtfWholeWord=2 / rtfMatchCase=4 already match FR_WHOLEWORD/FR_MATCHCASE.
    const done=x.unique();x.compare(-1).branch('e',done).push();this.rawStorageAddress(flags);x.testOperand(m('eax'),8);const noSelect=x.unique();x.branch('ne',noSelect);this.rawStorageAddress(find);x.add('eax',12).push().push(0).push(0x437).push(this.controlHandleRef(object)).invoke(u,'SendMessageW');x.label(noSelect).popOperand('eax').label(done);return true;
  }
};

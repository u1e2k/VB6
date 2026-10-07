/** Length-aware native BSTR intrinsics. No NUL-terminated shortcut is used for
 * trimming, reversal or comparison. Each returned allocation has an owner. */
import {MAX_NATIVE_STRING} from './storage.js';
import {mem16,mem32} from './x86-operands.js';
const N='native:string-library:',DLL='oleaut32.dll';
const arg=argument=>({argument});
const lit=value=>({kind:'literal',value});
const stringNames=new Set(['trim','ltrim','rtrim','strreverse','lcase','ucase']);
export const NATIVE_STRING_CONSTANTS=Object.freeze({vbbinarycompare:0,vbtextcompare:1,vbusecompareoption:-1});
export const nativeStringLibraryMethods={
  stringLibraryType(node) {
    return node.kind==='call'&&node.callee.kind==='id'&&stringNames.has(node.callee.name.toLowerCase().replace(/\$$/,''))?'string':null;
  },
  nativeCompareMode() {
    const mode=this.context?.module?.module?.optionCompare||'binary';
    if(!['binary','text'].includes(mode))this.fail('Native strings support Option Compare Binary or Text');
    return mode==='text'?1:0;
  },
  compareNativeStrings(left,right,mode=lit(this.nativeCompareMode())) {
    this.textExpression(left);this.x.push();this.textExpression(right);this.x.push();this.numeric(mode);
    const ready=this.x.unique();this.x.compare(-1).branch('ne',ready).value(this.nativeCompareMode()).label(ready);
    this.x.emit(0x5a,0x59).push().emit(0x52,0x51).call(N+'compare');
  },
  stringLibraryBuiltin(node,name) {
    const x=this.x,args=node.args;
    if(name==='strcomp'){
      if(args.length<2||args.length>3)this.fail('StrComp expects two or three arguments');
      this.compareNativeStrings(args[0],args[1],args[2]?.kind==='missing'||!args[2]?lit(this.nativeCompareMode()):args[2]);return true;
    }
    if(!stringNames.has(name))return false;
    if(args.length!==1)this.fail(name+' expects one argument');
    this.textExpression(args[0]);
    if(['trim','ltrim','rtrim'].includes(name))x.emit(0x89,0xc3).push(name==='trim'?3:name==='ltrim'?1:2).emit(0x53).call(N+'trim');
    else if(name==='strreverse')x.push().call(N+'reverse');
    else x.emit(0x89,0xc3).push(name==='ucase'?0x200:0x100).emit(0x53).call(N+'case');
    this.ownString();return true;
  }
};
export function emitNativeStringLibraryHelpers(c) {
  const x=c.x;
  const trimLeft=x.unique(),trimRight=x.unique(),leftLoop=x.unique(),rightLoop=x.unique(),trimDone=x.unique();
  // trim(BSTR, flags): only U+0020 is removed, never tabs, NULs or other whitespace.
  x.label(N+'trim').enter().api(DLL,'SysStringLen',[arg(8)]).mov('ecx','eax').value(arg(8)).mov('esi','eax').mov('edi',0);
  x.value(arg(12)).testOperand('eax',1).branch('e',trimRight);
  x.label(leftLoop).cmp('edi','ecx').branch('ae',trimDone).cmp(mem16({base:'esi',index:'edi',scale:2}),32).branch('ne',trimRight).add('edi',1).jump(leftLoop);
  x.label(trimRight).value(arg(12)).testOperand('eax',2).branch('e',trimDone);
  x.label(rightLoop).cmp('ecx','edi').branch('be',trimDone).cmp(mem16({base:'esi',index:'ecx',scale:2,displacement:-2}),32).branch('ne',trimDone).sub('ecx',1).jump(rightLoop);
  x.label(trimDone).sub('ecx','edi').lea('eax',mem16({base:'esi',index:'edi',scale:2})).pushOperand('ecx').push().invoke(DLL,'SysAllocStringLen').test().branch('e','error:7').leave(8);

  const reverseLoop=x.unique(),reversed=x.unique();
  x.label(N+'reverse').enter().api(DLL,'SysStringLen',[arg(8)]).compare(MAX_NATIVE_STRING).branch('a','error:7').mov('ebx','eax').push().push(0).invoke(DLL,'SysAllocStringLen').test().branch('e','error:7');
  x.mov('edi','eax').push().value(arg(8)).mov('esi','eax').mov('ecx','ebx');
  x.label(reverseLoop).testOperand('ecx','ecx').branch('e',reversed).sub('ecx',1).movzx('eax',mem16({base:'esi',index:'ecx',scale:2})).mov(mem16({base:'edi'}),'ax').add('edi',2).jump(reverseLoop);
  x.label(reversed).emit(0x58).leave(4);

  const binary=x.unique(),empty=x.unique(),equal=x.unique(),greater=x.unique(),compareDone=x.unique();
  x.label(N+'compare').enter(8).value(arg(16)).compare(0).branch('e',binary).compare(1).branch('ne','error:5');
  x.api(DLL,'SysStringLen',[arg(8)]).mov(mem32({base:'ebp',displacement:-4}),'eax');
  x.api(DLL,'SysStringLen',[arg(12)]).mov(mem32({base:'ebp',displacement:-8}),'eax').test().branch('e',empty);
  x.value(arg(-4)).test().branch('e',empty);
  x.api('kernel32.dll','CompareStringW',[0x400,1,arg(8),arg(-4),arg(12),arg(-8)]).test().branch('e','error:5').sub('eax',2).jump(compareDone);
  x.label(empty).value(arg(-4)).cmp('eax',mem32({base:'ebp',displacement:-8})).branch('e',equal).branch('g',greater).value(-1).jump(compareDone);
  x.label(greater).value(1).jump(compareDone).label(equal).value(0).jump(compareDone);
  x.label(binary).push(arg(12)).push(arg(8)).call('native:string:compare');
  x.label(compareDone).leave(12);

  const caseEmpty=x.unique(),mapped=x.unique();
  // Query the required output size: locale mappings are not necessarily length preserving.
  x.label(N+'case').enter(8).api(DLL,'SysStringLen',[arg(8)]).mov(mem32({base:'ebp',displacement:-4}),'eax').test().branch('e',caseEmpty);
  x.api('kernel32.dll','LCMapStringW',[0x400,arg(12),arg(8),arg(-4),0,0]).test().branch('e','error:5').compare(MAX_NATIVE_STRING).branch('a','error:7').mov(mem32({base:'ebp',displacement:-8}),'eax');
  x.push().push(0).invoke(DLL,'SysAllocStringLen').test().branch('e','error:7').mov('edi','eax');
  x.push(arg(-8)).pushOperand('edi').push(arg(-4)).push(arg(8)).push(arg(12)).push(0x400).invoke('kernel32.dll','LCMapStringW');
  x.cmp('eax',mem32({base:'ebp',displacement:-8})).branch('e',mapped);
  x.pushOperand('edi').invoke(DLL,'SysFreeString').jump('error:5');
  x.label(mapped).mov('eax','edi').leave(8);
  x.label(caseEmpty).api(DLL,'SysAllocStringLen',[0,0]).test().branch('e','error:7').leave(8);
}

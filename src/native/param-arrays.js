/** Classic VB ParamArray lowering. Packing is a value operation, never an ABI
 * varargs call. One caller-owned Variant owns the complete SAFEARRAY; publishing
 * that owner before evaluating arguments makes partial packs exception-safe.
 * MS-VBAL 5.3.1.11 and the VBA named-argument diagnostic define this contract.
 */
import {mem32} from './x86-operands.js';
import {NATIVE_ARRAY_MAX_BYTES} from './arrays.js';
const P='native:paramarray:',V='native:variant:',DLL='oleaut32.dll';
const arg=argument=>({argument}),addr=address=>({address});
const at=(base,displacement=0)=>mem32({base,displacement});

export function lowerNativeParamArray(c,args) {
  if(args.length>Math.floor((c.maxArrayBytes??NATIVE_ARRAY_MAX_BYTES)/16))
    c.fail('Native ParamArray exceeds the configured array backing-store budget');
  if(args.some(a=>['named','byval','addressOf'].includes(a?.kind)))
    c.fail('Native ParamArray elements must be positional values or omitted placeholders');
  c.useVariant('paramarray');const x=c.x,owner=c.temporaryVariant();
  x.push(args.length);c.rawStorageAddress(owner);x.push().call(P+'create');
  args.forEach((node,index)=>{
    if(!node||node.kind==='missing')c.variantSeed(10,0x80020004);
    else c.boxVariant(node);
    x.push().push(index);c.rawStorageAddress(owner);x.push().call(P+'put');
  });
  // The existing unsized array ABI takes a SAFEARRAY**. ReDim/Erase in the callee
  // update this very slot, so the owner's eventual VariantClear sees its value.
  c.rawStorageAddress(owner);x.add('eax',8);
  return owner;
}

export function emitNativeParamArrayHelpers(c) {
  const x=c.x,limit=Math.floor((c.maxArrayBytes??NATIVE_ARRAY_MAX_BYTES)/16);
  // create(owner, count): ownership is installed before another fallible call.
  // SafeArrayCreate accepts a zero count and retains lower=0, upper=-1. Unlike
  // SafeArrayCreateVector it does not force FADF_FIXEDSIZE on this local array.
  x.label(P+'create').enter(8).value(arg(12)).compare(limit).branch('a','error:7');
  x.mov(at('ebp',-8),'eax').mov(at('ebp',-4),0);
  x.push(arg(8)).call(V+'clear').api(DLL,'SafeArrayCreate',[12,1,addr(-8)]).test().branch('e','error:7');
  x.mov('edx','eax').value(arg(8)).mov(at('eax',8),'edx').mov(at('eax'),0x200c).add('eax',8).leave(8);
  // put(owner, index, source): OleAut32 copies a Variant, including its BSTR or
  // nested SAFEARRAY. The source stays separately owned by the current statement.
  x.label(P+'put').enter().value(arg(8)).mov('ebx',at('eax',8)).testOperand('ebx','ebx').branch('e','error:9');
  x.push(arg(16)).push(addr(12)).pushOperand('ebx').invoke(DLL,'SafeArrayPutElement').call(V+'check').leave(12);
}

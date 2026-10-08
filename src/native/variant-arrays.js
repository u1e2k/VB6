/** Value arrays inside owned Variants, distinct from typed Variant arrays.
 * L-values expose a locked, correctly typed VT_BYREF element view: there is no
 * delayed copy-back and no unpinned data pointer survives a fallible operation.
 */
import {mem16,mem32} from './x86-operands.js';
import {NATIVE_ARRAY_MAX_BYTES,NATIVE_ARRAY_MAX_RANK} from './arrays.js';
import {NATIVE_VARIANT_TYPES,NATIVE_VARIANT_ARRAY_WIDTHS} from './variant-types.js';
const P='native:variant-array:',DLL='oleaut32.dll';
const key=v=>String(v).toLowerCase(),at=(base,displacement=0)=>mem32({base,displacement});
const literal=value=>({kind:'literal',value});
function arrayName(c,node){
 if(node?.kind!=='call')return false;const callee=node.callee;
 if(callee.kind==='id'&&key(callee.name)==='array')return !c.resolveProcedure(callee)&&!c.variable(callee);
 return callee.kind==='member'&&key(callee.name)==='array'&&callee.object.kind==='id'&&key(callee.object.name)==='vba'&&!c.modules?.has('vba')&&!c.variable(callee.object);
}
export const nativeVariantArrayMethods={
  useVariantArray(feature){this.useVariant('arrays');(this.nativeVariantArrayFeatures ||= new Set()).add(feature);},
  variantArrayType(node){
    if(arrayName(this,node))return true;
    return node?.kind==='call'&&node.callee.kind==='call'&&this.type(node.callee)==='variant';
  },
  boxNativeArray(variable){
    if(variable.fixedLength||variable.nativeRecord||variable.recordFieldArray)this.fail('A Variant cannot contain fixed-length String or user-defined record arrays');
    const tag=NATIVE_VARIANT_TYPES[key(variable.type)];if(!NATIVE_VARIANT_ARRAY_WIDTHS[tag])this.fail('Unsupported native array element type: '+variable.type);
    const x=this.x,view=this.arrayWorkspace(16,'array-variant-view');
    this.rawStorageAddress(variable);x.push();this.zeroStorage(view);this.rawStorageAddress(view);
    x.popOperand('edx').mov(at('eax'),0x6000|tag).mov(at('eax',8),'edx');this.copyVariantPointer();
    // A value copy is resizable independently of the source's fixed declaration.
    const done=x.unique();x.mov('edx',at('eax',8)).testOperand('edx','edx').branch('e',done).and(mem16({base:'edx',displacement:2}),0xffef).label(done);
  },
  variantElementAddress(variable){
    this.useVariantArray('element');const x=this.x,rank=variable.indices.length;
    if(rank<1||rank>NATIVE_ARRAY_MAX_RANK)this.fail('Native Variant array rank must be 1..60');
    const indices=this.arrayWorkspace(rank*4,'variant-indices'),receiver=this.arrayWorkspace(4,'variant-array-receiver'),view=this.arrayWorkspace(16,'variant-element-view'),pin=this.arrayPin();
    pin.parentPin=this.address(variable.variantElementOf);x.push();this.rawStorageAddress(receiver);x.popOperand('edx').mov(at('eax'),'edx');
    variable.indices.forEach((node,i)=>{this.numeric(node);x.push();this.rawStorageAddress(indices);x.popOperand('edx').mov(at('eax',i*4),'edx');});
    this.zeroStorage(view);this.rawStorageAddress(view);x.push();this.rawStorageAddress(pin);x.push();this.rawStorageAddress(indices);x.push().push(rank);
    this.rawStorageAddress(receiver);x.pushOperand(at('eax')).call(P+'element');return pin;
  },
  variantArrayBoundCall(node,upper){
    this.useVariantArray('bound');const x=this.x,v=this.variable(node.args[0]);let pin;
    if(v&&!v.nativeArray)pin=this.address(v);else this.boxVariant(node.args[0]);
    x.push();this.numeric(node.args[1]||literal(1));x.popOperand('edx').push().pushOperand('edx').call(P+(upper?'upper':'lower'));this.releaseArrayPin(pin);
  },
  assignNativeVariantArray(variable,node){
    const source=this.variable(node);if(source?.nativeArray&&!source.elementOf||this.type(node)!=='variant')return false;
    if(!variable.nativeDynamic||variable.fixedLength||variable.nativeRecord)this.fail('Variant array assignment requires a dynamic destination with supported elements');
    const tag=NATIVE_VARIANT_TYPES[key(variable.type)];if(!NATIVE_VARIANT_ARRAY_WIDTHS[tag])this.fail('Unsupported Variant array destination type');
    this.useVariantArray('take');this.boxVariant(node);const x=this.x;x.pushOperand(tag).pushOperand('eax');this.rawStorageAddress(variable);x.push().call(P+'take');return true;
  },
  eraseVariantArray(variable){
    this.useVariantArray('erase');const pin=this.address(variable);this.x.push().call(P+'erase');this.releaseArrayPin(pin);
  },
  redimVariantArray(variable,decl,preserve){
    const rank=decl.bounds?.length;if(!rank||rank>NATIVE_ARRAY_MAX_RANK)this.fail('Native ReDim requires one to 60 dimensions');
    const tag=decl.explicitType?NATIVE_VARIANT_TYPES[key(decl.type)]:0;
    if(decl.fixedLength||decl.autoNew||tag!==0&&!NATIVE_VARIANT_ARRAY_WIDTHS[tag])this.fail('Native Variant ReDim requires a supported variable-length element type');
    this.useVariantArray('redim');this.nativeVariantArraysUsed=true;const x=this.x,bounds=this.arrayWorkspace(rank*8,'variant-redim-bounds'),pin=this.address(variable);x.push();
    for(let i=0;i<rank;i++){
      this.numeric(decl.bounds[i][0]||literal(this.context.module.module.optionBase||0));x.push();this.numeric(decl.bounds[i][1]);
      x.popOperand('ebx').cmp('eax','ebx').branch('l','error:9').sub('eax','ebx').branch('o','error:7').inc('eax').branch('o','error:7').push();
      this.rawStorageAddress(bounds);x.popOperand('edx').mov(at('eax',i*8),'edx').mov(at('eax',i*8+4),'ebx');
    }
    x.popOperand('ebx').push(preserve?1:0);this.rawStorageAddress(bounds);x.push().push(rank).push(tag).pushOperand('ebx').call(P+'redim');this.releaseArrayPin(pin);
  },
  variantArrayBuiltin(node,name){
    const x=this.x;
    if(arrayName(this,node)){
      const args=node.args,lower=node.callee.kind==='member'?0:this.context.module.module.optionBase||0;
      if(args.length>Math.floor((this.maxArrayBytes??NATIVE_ARRAY_MAX_BYTES)/16))this.fail('Native Array exceeds the configured backing-store budget');
      if(args.some(a=>['named','byval','addressOf'].includes(a?.kind)))this.fail('Native Array expects positional values or omitted placeholders');
      this.useVariant('paramarray');const owner=this.temporaryVariant(),bounds=this.arrayWorkspace(8,'variant-array-bounds');
      this.clearVariantStorage(owner);this.rawStorageAddress(bounds);x.mov(at('eax'),args.length).mov(at('eax',4),lower).push().push(1).push(12).invoke(DLL,'SafeArrayCreate').test().branch('e','error:7');
      x.mov('edx','eax');this.rawStorageAddress(owner);x.mov(at('eax'),0x200c).mov(at('eax',8),'edx');
      args.forEach((arg,index)=>{if(!arg||arg.kind==='missing')this.variantSeed(10,0x80020004);else this.boxVariant(arg);x.push().push(index+lower);this.rawStorageAddress(owner);x.push().call('native:paramarray:put');});
      this.rawStorageAddress(owner);return true;
    }
    if(node.kind==='call'&&node.callee.kind==='call'&&this.type(node.callee)==='variant'&&!this.variable(node)){
      this.boxVariant(node.callee);const snapshot=this.arrayWorkspace(4,'variant-array-expression');x.push();this.rawStorageAddress(snapshot);x.popOperand('edx').mov(at('eax'),'edx');
      // A synthetic addressable parameter aliases the already owned value result,
      // never its source variable. A nested function result remains statement-owned.
      this.loadVariant({type:'Variant',variantElementOf:{...snapshot,type:'Variant',parameter:true,byRef:true},indices:node.args});return true;
    }
    return false;
  }
};

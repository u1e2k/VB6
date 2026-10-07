/** Native intra-procedure control flow. GoSub uses a bounded per-activation
 * return stack separate from ESP, so error unwinding cannot corrupt returns. */
import {mem32} from './x86-operands.js';
const slot=v=>mem32({base:'ebp',displacement:v.offset});
export function nativeGoSubLimit(value=1024) {
  if(!Number.isInteger(value)||value<1||value>16384)throw new Error('maxGoSubDepth must be an integer from 1 to 16384');
  return value;
}
export const nativeFlowMethods={
  prepareNativeFlow(context) {
    context.nativeWithStack=[];
    if(context.proc.code.some(ins=>ins.op==='gosub'||ins.op==='gosubReturn'||ins.op==='computedJump'&&ins.gosub)){
      const depth=this.arrayWorkspace(4,'gosub-depth'),returns=this.arrayWorkspace(this.maxGoSubDepth*4,'gosub-returns');
      context.locals.set(depth.name,depth); // Zero the depth at procedure entry, not every GoSub.
      context.nativeGoSub={depth,returns,limit:this.maxGoSubDepth};
    }
  },
  pushNativeGoSub(context,returnLabel) {
    const {depth,returns,limit}=context.nativeGoSub,x=this.x;
    x.mov('ecx',slot(depth)).cmp('ecx',limit).branch('ae','error:28');
    x.value(returnLabel).mov(mem32({base:'ebp',index:'ecx',scale:4,displacement:returns.offset}),'eax');
    x.add('ecx',1).mov(slot(depth),'ecx'); // EDX is preserved for computed dispatch.
  },
  currentNativeWith(context=this.context) {
    const binding=context?.nativeWithStack?.at(-1);
    if(!binding)this.fail('Native With reference has no enclosing With block');
    return binding;
  },
  loadNativeWithAddress(variable) {
    this.x.mov('eax',slot(variable.nativeWithAddress)).test().branch('e','error:91');
    return null;
  },
  nativeFlowInstruction(ins,context,index) {
    const x=this.x,next=context.label+':'+(index+1);
    if(ins.op==='branch'){
      if(!this.optimizedNativeBranch(ins.test,context.label+':'+ins.target,!!ins.invert)){
        this.truth(ins.test);x.test().branch(ins.invert?'ne':'e',context.label+':'+ins.target);
      }
      return true;
    }
    if(ins.op==='gosub'){
      this.pushNativeGoSub(context,next);x.jump(context.label+':'+ins.target);return true;
    }
    if(ins.op==='gosubReturn'){
      const {depth,returns}=context.nativeGoSub;
      x.mov('ecx',slot(depth)).testOperand('ecx','ecx').branch('e','error:3');
      x.sub('ecx',1).mov(slot(depth),'ecx').jumpIndirect(mem32({base:'ebp',index:'ecx',scale:4,displacement:returns.offset}));
      return true;
    }
    if(ins.op==='computedJump'){
      this.numeric(ins.expr);
      x.compare(0).branch('l','error:5').compare(255).branch('g','error:5');
      x.test().branch('e',next).compare(Math.min(ins.targets.length,255)).branch('g',next);
      if(ins.gosub){x.mov('edx','eax');this.pushNativeGoSub(context,next);x.mov('eax','edx');}
      if(this.optimization===2){
        const table=x.unique('computed-jump');this.ro.align(4).label(table);
        for(const target of ins.targets.slice(0,255))this.ro.reference(context.label+':'+target);
        x.jumpIndirect(mem32({index:'eax',scale:4,label:table,displacement:-4}));
        this.optimizationStats.jumpTables++;
      }else for(let i=0;i<Math.min(ins.targets.length,255);i++)x.compare(i+1).branch('e',context.label+':'+ins.targets[i]);
      return true;
    }
    if(ins.op==='withPush'){
      const variable=this.variable(ins.expr);
      if(!variable?.nativeRecord||variable.recordFieldArray)this.fail('Native With currently requires an addressable POD record');
      const address=this.arrayWorkspace(4,'with-record');context.locals.set(address.name,address);
      // Capture once before publishing the lexical binding; nested .members use the parent.
      this.address(variable);x.mov(slot(address),'eax');
      context.nativeWithStack.push({address,variable:{name:address.name,type:variable.type,nativeRecord:variable.nativeRecord,nativeBytes:variable.nativeRecord.size,nativeWithAddress:address}});
      return true;
    }
    if(ins.op==='withPop'){
      const binding=this.currentNativeWith(context);x.mov(slot(binding.address),0);context.nativeWithStack.pop();return true;
    }
    if(ins.op==='withUnwind'){
      if(!Number.isInteger(ins.count)||ins.count<0||ins.count>context.nativeWithStack.length)this.fail('Invalid native With unwind');
      if(!ins.count)return true;
      // This is a runtime exit path, not a lexical End With. Keep compile-time bindings.
      for(const binding of context.nativeWithStack.slice(-ins.count))x.mov(slot(binding.address),0);
      return true;
    }
    return false;
  }
};

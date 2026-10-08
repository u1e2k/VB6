/** Bounded test-only IA-32 interpreter for emitted helper ABIs. This is NOT
 * Windows execution or a Win32 compatibility runtime. Every external call is an
 * explicit test hook; unimplemented opcodes and unmapped/freed memory fail.
 * The instruction semantics are independent of the compiler's encoder.
 */
import assert from 'node:assert/strict';
export class NativeMemory {
 constructor(){this.regions=[];this.next=0x20000000;}
 map(address,size,{readonly=false,fill=0,label='memory'}={}){assert.ok(size>0);assert.ok(!this.regions.some(r=>address<r.address+r.bytes.length&&address+size>r.address));const region={address,bytes:new Uint8Array(size).fill(fill),readonly,label};this.regions.push(region);return region;}
 region(address,size=1,write=false){const r=this.regions.find(r=>address>=r.address&&address+size<=r.address+r.bytes.length);assert.ok(r,`unmapped/freed memory ${address.toString(16)} + ${size}`);assert.ok(!write||!r.readonly,`write to read-only ${r.label}`);return r;}
 alloc(size,label='heap'){const address=this.next;this.next+=size+32;this.map(address,size,{fill:0xa5,label});return address;}
 free(address){const i=this.regions.findIndex(r=>r.address===address);assert.ok(i>=0,`invalid/double free ${address.toString(16)}`);this.regions.splice(i,1);}
 read(address,width=32){const size=width/8,r=this.region(address,size),v=new DataView(r.bytes.buffer),at=address-r.address;return width===8?v.getUint8(at):width===16?v.getUint16(at,true):v.getUint32(at,true);}
 write(address,value,width=32){const size=width/8,r=this.region(address,size,true),v=new DataView(r.bytes.buffer),at=address-r.address;if(width===8)v.setUint8(at,value);else if(width===16)v.setUint16(at,value,true);else v.setUint32(at,value,true);}
 utf16(address,limit=1048576){if(!address)return '';let text='';for(let i=0;i<limit;i++){const c=this.read(address+2*i,16);if(!c)return text;text+=String.fromCharCode(c);}throw new Error('unterminated string');}
 string(value){const at=this.alloc(4+2*value.length+2,'BSTR');this.write(at,2*value.length);for(let i=0;i<value.length;i++)this.write(at+4+2*i,value.charCodeAt(i),16);this.write(at+4+2*value.length,0,16);return at+4;}
 bstr(address){if(!address)return '';const n=this.read(address-4)/2;let value='';for(let i=0;i<n;i++)value+=String.fromCharCode(this.read(address+2*i,16));return value;}
}
const names=['eax','ecx','edx','ebx','esp','ebp','esi','edi'];
export class NativeX86Machine {
 constructor(linked){
  this.memory=new NativeMemory();this.registers=new Uint32Array(8);this.flags={z:0,s:0,c:0,o:0,p:0};this.hooks=new Map();this.labels=new Map(Object.entries(linked.symbols).map(([name,rva])=>[name,0x400000+rva]));this.calls=[];
  for(const s of linked.sections){const r=this.memory.map(0x400000+s.rva,Math.max(s.size,1),{readonly:!(s.flags&0x80000000),label:s.name});r.bytes.set(linked.bytes.slice(s.offset,s.offset+s.size));}
  this.memory.map(0x10000000,256*1024,{label:'stack'});this.set('esp',0x1003f000);this.nextHook=0x70000000;
  this.installCore();
  const raise=this.labels.get('native:error:raise');if(raise)this.hooks.set(raise,{args:0,callback:()=>{const e=new Error('Native VB error '+this.get('eax'));e.number=this.get('eax');throw e;}});
 }
 get(reg){return this.registers[names.indexOf(reg)];}set(reg,value){this.registers[names.indexOf(reg)]=value>>>0;}
 hook(dll,name,args,callback){const label='iat:'+dll.toLowerCase()+'!'+name,slot=this.labels.get(label);if(!slot)return null;const address=this.function(args,callback,label);this.memory.write(slot,address);return address;}
 function(args,callback,name='vtable'){const address=this.nextHook;this.nextHook+=16;this.hooks.set(address,{args,callback,name});return address;}
 symbol(name){assert.ok(this.labels.has(name),'missing symbol '+name);return this.labels.get(name);}
 push(value){this.registers[4]-=4;this.memory.write(this.registers[4],value);}pop(){const v=this.memory.read(this.registers[4]);this.registers[4]+=4;return v;}
 invoke(name,args=[]){const stack=this.get('esp');for(const [i,n]of ['ebx','esi','edi','ebp'].entries())this.set(n,0x12340000+i);const before=['ebx','esi','edi','ebp'].map(r=>this.get(r));for(const v of [...args].reverse())this.push(v);this.push(0x7ffffffe);this.ip=this.symbol(name);let steps=0;
  while(this.ip!==0x7ffffffe){if(++steps>2000000)throw new Error('Native helper exceeded instruction budget');this.step();}
  assert.equal(this.get('esp'),stack,'stdcall argument cleanup');assert.deepEqual(['ebx','esi','edi','ebp'].map(r=>this.get(r)),before,'callee-save registers');return this.get('eax');
 }
 byte(){return this.memory.read(this.ip++,8);}word(){const n=this.memory.read(this.ip,16);this.ip+=2;return n;}dword(){const n=this.memory.read(this.ip);this.ip+=4;return n;}
 reg(index,width){return {get:()=>width===32?this.registers[index]:width===16?this.registers[index]&65535:index<4?this.registers[index]&255:(this.registers[index-4]>>>8)&255,set:value=>{if(width===32)this.registers[index]=value;else if(width===16)this.registers[index]=(this.registers[index]&0xffff0000)|(value&65535);else if(index<4)this.registers[index]=(this.registers[index]&0xffffff00)|(value&255);else this.registers[index-4]=(this.registers[index-4]&0xffff00ff)|((value&255)<<8);}};}
 rm(width=32){const byte=this.byte(),mod=byte>>>6,reg=(byte>>>3)&7,rm=byte&7;if(mod===3)return {reg,operand:this.reg(rm,width)};
  let address=0;if(rm===4){const sib=this.byte(),scale=1<<(sib>>>6),index=(sib>>>3)&7,base=sib&7;if(index!==4)address+=this.registers[index]*scale;if(base===5&&mod===0)address+=this.dword();else address+=this.registers[base];}else if(rm===5&&mod===0)address=this.dword();else address=this.registers[rm];
  if(mod===1)address+=(this.byte()<<24)>>24;else if(mod===2)address+=this.dword()|0;address>>>=0;
  return {reg,operand:{address,get:()=>this.memory.read(address,width),set:v=>this.memory.write(address,v,width)}};
 }
 flagsFor(a,b,op,width=32){const mask=width===32?0xffffffff:(1<<width)-1,sign=width===32?0x80000000:1<<(width-1),norm=v=>width===32?v>>>0:v&mask;let result;
  a=norm(a);b=norm(b);if(op==='add'){const n=a+b;result=norm(n);this.flags.c=n>2**width-1?1:0;this.flags.o=!!(~(a^b)&(a^result)&sign);}else if(op==='sub'){result=norm(a-b);this.flags.c=a<b?1:0;this.flags.o=!!((a^b)&(a^result)&sign);}else{result=norm(op==='and'?a&b:op==='or'?a|b:a^b);this.flags.c=0;this.flags.o=false;}
  this.flags.z=result===0;this.flags.s=!!(result&sign);this.flags.p=([0,1,2,3,4,5,6,7].reduce((n,i)=>n+((result>>>i)&1),0)&1)===0;return result;
 }
 condition(c){const {o,c:cf,z,s,p}=this.flags;return [o,!o,cf,!cf,z,!z,cf||z,!cf&&!z,s,!s,p,!p,s!==o,s===o,z||s!==o,!z&&s===o][c];}
 step(){
  if(this.hooks.has(this.ip)){const hook=this.hooks.get(this.ip),args=Array.from({length:hook.args},(_,i)=>this.memory.read(this.get('esp')+4+4*i));this.calls.push({name:hook.name,args});const result=hook.callback(args,this);this.ip=this.pop();this.set('esp',this.get('esp')+4*hook.args);this.set('eax',result??0);this.set('ecx',0xcccccccc);this.set('edx',0xdddddddd);return;}
  const start=this.ip;let width=32,rep=false,op=this.byte();while(op===0x66||op===0xf3){if(op===0x66)width=16;else rep=true;op=this.byte();}
  if(op>=0x50&&op<=0x57){this.push(this.registers[op-0x50]);return;}if(op>=0x58&&op<=0x5f){this.registers[op-0x58]=this.pop();return;}
  if(op>=0xb8&&op<=0xbf){this.reg(op-0xb8,width).set(width===16?this.word():this.dword());return;}
  if(op>=0x40&&op<=0x4f){const reg=this.reg(op&7,width),cf=this.flags.c;reg.set(this.flagsFor(reg.get(),1,op<0x48?'add':'sub',width));this.flags.c=cf;return;}
  if(op>=0x70&&op<=0x7f){const rel=(this.byte()<<24)>>24;if(this.condition(op&15))this.ip+=rel;return;}
  if(op===0x90||op===0xfc)return;
  if(op===0x99){assert.equal(width,32);this.set('edx',(this.get('eax')|0)<0?0xffffffff:0);return;}
  if(op===0x68||op===0x6a){this.push(op===0x68?this.dword():(this.byte()<<24)>>24);return;}
  if(op===0xc3||op===0xc2){const n=op===0xc2?this.word():0;this.ip=this.pop();this.set('esp',this.get('esp')+n);return;}
  if(op===0xe8||op===0xe9||op===0xeb){const rel=op===0xeb?(this.byte()<<24)>>24:this.dword()|0;if(op===0xe8)this.push(this.ip);this.ip=(this.ip+rel)>>>0;return;}
  if(op===0xa1||op===0xa3){const addr=this.dword();if(op===0xa1)this.reg(0,width).set(this.memory.read(addr,width));else this.memory.write(addr,this.reg(0,width).get(),width);return;}
  if(op===0xa4||op===0xa5||op===0xaa||op===0xab){const unit=(op&1)?width/8:1,count=rep?this.get('ecx'):1;assert.ok(count<=1048576);for(let i=0;i<count;i++){const value=op<0xaa?this.memory.read(this.get('esi'),unit*8):this.reg(0,unit*8).get();this.memory.write(this.get('edi'),value,unit*8);this.set('edi',this.get('edi')+unit);if(op<0xaa)this.set('esi',this.get('esi')+unit);}if(rep)this.set('ecx',0);return;}
  if([0x88,0x89,0x8a,0x8b,0x8d].includes(op)){const w=op===0x88||op===0x8a?8:width,{reg,operand}=this.rm(w),r=this.reg(reg,w);if(op===0x8d){assert.notEqual(operand.address,undefined);r.set(operand.address);}else if(op===0x88||op===0x89)operand.set(r.get());else r.set(operand.get());return;}
  if(op===0xc7||op===0xc6){const w=op===0xc6?8:width,{reg,operand}=this.rm(w);assert.equal(reg,0);operand.set(w===8?this.byte():w===16?this.word():this.dword());return;}
  if(op===0x81||op===0x83||op===0x80){const w=op===0x80?8:width,{reg,operand}=this.rm(w),imm=op===0x83?(this.byte()<<24)>>24:w===8?this.byte():w===16?this.word():this.dword(),kind={0:'add',1:'or',4:'and',5:'sub',6:'xor',7:'sub'}[reg];assert.ok(kind,'unsupported group1 '+reg);const value=this.flagsFor(operand.get(),imm,kind,w);if(reg!==7)operand.set(value);return;}
  if([0x01,0x03,0x09,0x0b,0x21,0x23,0x29,0x2b,0x31,0x33,0x39,0x3b,0x85,0x84].includes(op)){const w=op===0x84?8:width,{reg,operand}=this.rm(w),r=this.reg(reg,w),kind=op>=0x84?'and':{0:'add',1:'or',4:'and',5:'sub',6:'xor',7:'sub'}[op>>>3],reversed=!!(op&2),a=reversed?r:operand,b=reversed?operand:r,value=this.flagsFor(a.get(),b.get(),kind,w);if(op<0x38)a.set(value);return;}
  if([0x05,0x0d,0x25,0x2d,0x35,0x3d,0xa9,0xa8].includes(op)){const w=op===0xa8?8:width,imm=w===8?this.byte():w===16?this.word():this.dword(),kind=op>=0xa8?'and':{0:'add',1:'or',4:'and',5:'sub',6:'xor',7:'sub'}[op>>>3],value=this.flagsFor(this.reg(0,w).get(),imm,kind,w);if(op<0x38)this.reg(0,w).set(value);return;}
  if(op===0xf7||op===0xf6){const w=op===0xf6?8:width,{reg,operand}=this.rm(w);if(reg===0)this.flagsFor(operand.get(),w===8?this.byte():w===16?this.word():this.dword(),'and',w);else if(reg===2)operand.set(~operand.get());else if(reg===3)operand.set(this.flagsFor(0,operand.get(),'sub',w));else if(reg===7&&w===32){const denominator=BigInt(operand.get()|0),numerator=BigInt.asIntN(64,(BigInt(this.get('edx'))<<32n)|BigInt(this.get('eax')));assert.notEqual(denominator,0n,'IDIV zero');const quotient=numerator/denominator,remainder=numerator%denominator;assert.ok(quotient>=-2147483648n&&quotient<=2147483647n,'IDIV overflow');this.set('eax',Number(quotient));this.set('edx',Number(remainder));}else throw new Error('unsupported unary '+reg);return;}
  if(op===0xff){const {reg,operand}=this.rm(width);if(reg===6)this.push(operand.get());else if(reg===2){const target=operand.get();this.push(this.ip);this.ip=target;}else if(reg===4)this.ip=operand.get();else if(reg<=1){const cf=this.flags.c;operand.set(this.flagsFor(operand.get(),1,reg===0?'add':'sub',width));this.flags.c=cf;}else throw new Error('unsupported FF '+reg);return;}
  if(op===0x69||op===0x6b){const {reg,operand}=this.rm(width),imm=op===0x6b?(this.byte()<<24)>>24:this.dword()|0,value=(operand.get()|0)*imm;this.reg(reg,width).set(value);this.flags.o=this.flags.c=value< -2147483648||value>2147483647;return;}
  if(op===0xc1||op===0xd1||op===0xd3){const {reg,operand}=this.rm(width),n=(op===0xc1?this.byte():op===0xd1?1:this.get('ecx'))&31;if(n){const v=operand.get(),res=reg===4?v<<n:reg===5?v>>>n:reg===7?(v|0)>>n:null;assert.notEqual(res,null);this.flagsFor(res,0,'or',width);operand.set(res);}return;}
  if(op===0x0f){const second=this.byte();if(second>=0x80&&second<=0x8f){const rel=this.dword()|0;if(this.condition(second&15))this.ip+=rel;return;}if(second>=0x90&&second<=0x9f){this.rm(8).operand.set(this.condition(second&15)?1:0);return;}
   if([0xb6,0xb7,0xbe,0xbf].includes(second)){const w=second&1?16:8,{reg,operand}=this.rm(w),v=operand.get();this.reg(reg,width).set(second>=0xbe?(v<<(32-w))>>(32-w):v);return;}
   if(second===0xaf){const {reg,operand}=this.rm(width),value=(this.registers[reg]|0)*(operand.get()|0);this.registers[reg]=value;this.flags.o=this.flags.c=value< -2147483648||value>2147483647;return;}
   throw new Error('unsupported 0F opcode '+second.toString(16));
  }
  throw new Error(`unsupported opcode ${op.toString(16)} at ${start.toString(16)}`);
 }
 installCore(){
  const memory=this.memory;
  this.hook('oleaut32.dll','SysAllocStringLen',2,([src,n])=>{const at=memory.alloc(4+2*n+2,'BSTR');memory.write(at,2*n);for(let i=0;src&&i<n;i++)memory.write(at+4+2*i,memory.read(src+2*i,16),16);memory.write(at+4+2*n,0,16);return at+4;});
  this.hook('oleaut32.dll','SysAllocString',1,([src])=>memory.string(memory.utf16(src)));
  this.hook('oleaut32.dll','SysStringLen',1,([src])=>src?memory.read(src-4)/2:0);
  this.hook('oleaut32.dll','SysFreeString',1,([src])=>{if(src)memory.free(src-4);});
  this.hook('oleaut32.dll','VarBstrCat',3,([a,b,out])=>{memory.write(out,memory.string(memory.bstr(a)+memory.bstr(b)));return 0;});
  this.hook('kernel32.dll','lstrlenW',1,([src])=>memory.utf16(src).length);
  this.hook('kernel32.dll','lstrcpynW',3,([dest,src,n])=>{const text=memory.utf16(src).slice(0,Math.max(0,n-1));for(let i=0;i<text.length;i++)memory.write(dest+2*i,text.charCodeAt(i),16);if(n)memory.write(dest+2*text.length,0,16);return dest;});
  this.hook('kernel32.dll','GetProcessHeap',0,()=>1);
  this.hook('kernel32.dll','HeapAlloc',3,([heap,flags,size])=>{assert.equal(heap,1);const p=memory.alloc(size,'native-owned-record');if(flags&8)memory.region(p).bytes.fill(0);return p;});
  this.hook('kernel32.dll','HeapFree',3,([heap,flags,p])=>{assert.equal(heap,1);memory.free(p);return 1;});
  this.hook('kernel32.dll','MulDiv',3,([a,b,c])=>{a|=0;b|=0;c|=0;return Math.round(a*b/c);});
 }
}

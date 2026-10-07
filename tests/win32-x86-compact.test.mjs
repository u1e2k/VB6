import test from 'node:test';
import assert from 'node:assert/strict';
import {X86} from '../src/native/x86.js';
import {BinarySection} from '../src/native/pe32.js';
import {mem16,mem32,X86_REGISTERS} from '../src/native/x86-operands.js';
const encode=fn=>{const s=new BinarySection('.text',0x60000020);fn(new X86(s,null));return s.bytes;};
for(const [name,opcode]of Object.entries({add:0x04,or:0x0c,adc:0x14,sbb:0x1c,and:0x24,sub:0x2c,xor:0x34,cmp:0x3c})){
  test(name+' accumulator immediates use shortest flag-equivalent forms',()=>{
    assert.deepEqual(encode(x=>x[name]('al',128)),[opcode,128]);
    assert.deepEqual(encode(x=>x[name]('ax',128)),[0x66,opcode+1,128,0]);
    assert.deepEqual(encode(x=>x[name]('eax',128)),[opcode+1,128,0,0,0]);
    assert.equal(encode(x=>x[name]('eax',127)).length,3);
    assert.equal(encode(x=>x[name]('ax',65535)).length,4);
  });
}
for(const [width,regs]of [[16,X86_REGISTERS.word],[32,X86_REGISTERS.gpr]])for(const [index,reg]of regs.entries()){
  test('compact INC/DEC '+reg+' preserve carry semantics',()=>{
    const p=width===16?[0x66]:[];
    assert.deepEqual(encode(x=>x.inc(reg).dec(reg)),[...p,0x40+index,...p,0x48+index]);
  });
}
test('TEST accumulators, signed word multiplication and memory encodings',()=>{
  assert.deepEqual(encode(x=>x.testOperand('al',255)),[0xa8,255]);
  assert.deepEqual(encode(x=>x.testOperand('ax',65535)),[0x66,0xa9,255,255]);
  assert.deepEqual(encode(x=>x.testOperand('eax',-1)),[0xa9,255,255,255,255]);
  assert.deepEqual(encode(x=>x.imul('ax','bx',65535)),[0x66,0x6b,0xc3,255]);
  assert.deepEqual(encode(x=>x.inc(mem32({base:'eax'})).dec(mem16({base:'ebp'}))),[0xff,0,0x66,0xff,0x4d,0]);
});
test('legacy argument/address helpers compact only displacement, keeping EAX and flags contract',()=>{
  assert.deepEqual(encode(x=>x.value({argument:8}).local(-4).compare(127)),[0x8b,0x45,8,0x8d,0x45,252,0x83,0xf8,127]);
  for(const n of [-129,128])assert.equal(encode(x=>x.local(n)).length,6);
  assert.deepEqual(encode(x=>x.local(0xffffffff)),encode(x=>x.local(-1)));
  assert.deepEqual(encode(x=>x.push(0)),[0xb8,0,0,0,0,0x50]);
});
for(const [name,opcode]of Object.entries({movs:0xa4,cmps:0xa6,stos:0xaa,lods:0xac,scas:0xae}))for(const width of [8,16,32]){
  test('checked string '+name+' '+width,()=>{
    const suffix=[...(width===16?[0x66]:[]),opcode+(width===8?0:1)];
    assert.deepEqual(encode(x=>x.stringInstruction(name,width)),suffix);
    const comparing=['cmps','scas'].includes(name);
    assert.deepEqual(encode(x=>x.stringInstruction(name,width,comparing?'repe':'rep')),[0xf3,...suffix]);
    if(comparing)assert.deepEqual(encode(x=>x.stringInstruction(name,width,'repne')),[0xf2,...suffix]);
  });
}
test('string aliases and flag operations emit exact IA-32 opcodes',()=>{
  assert.deepEqual(encode(x=>x.repCompare(16).repCompare(8,false).repScan(32).repScan(8,true)),[0xf3,0x66,0xa7,0xf2,0xa6,0xf2,0xaf,0xf3,0xae]);
  assert.deepEqual(encode(x=>x.pushFlags().std().cld().stc().clc().cmc().popFlags()),[0x9c,0xfd,0xfc,0xf9,0xf8,0xf5,0x9d]);
});
for(const args of [['bad'],['movs',64],['scas',8,'rep'],['stos',8,'repne'],['lods',8,'lock'],['cmps',8,''],['movs',8,false]])test('invalid string request emits nothing '+args,()=>{
  const s=new BinarySection('.text',0x60000020),x=new X86(s,null);x.label('entry');
  assert.throws(()=>x.stringInstruction(...args),/Invalid/);assert.equal(s.length,0);assert.equal(s.fixups.length,0);assert.equal(s.labels.get('entry'),0);
});
test('invalid compact operands remain atomic',()=>{
  for(const fn of [x=>x.add('al',256),x=>x.add('ax',65536),x=>x.testOperand('eax',NaN),x=>x.inc('r8'),x=>x.repCompare(8,1),x=>x.repScan(8,'no')])assert.throws(()=>encode(fn));
});

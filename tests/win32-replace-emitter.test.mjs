import test from 'node:test';
import assert from 'node:assert/strict';
import {X86} from '../src/native/x86.js';
import {BinarySection,PE32Image} from '../src/native/pe32.js';
import {emitNativeReplace} from '../src/native/string-replace.js';
const emit=()=>{const section=new BinarySection('.text',0x60000020),image=new PE32Image();emitNativeReplace({x:new X86(section,image)});return {section,image,bytes:Buffer.from(section.bytes)};};

test('Replace emitter is deterministic and returns through the six-DWORD stdcall ABI',()=>{
 const a=emit(),b=emit();assert.deepEqual(a.bytes,b.bytes);assert.deepEqual(a.section.fixups,b.section.fixups);
 assert.equal(a.section.labels.get('native:string-library:replace'),0);
 assert.equal(a.bytes.subarray(-9).toString('hex'),'5f5e5b89ec5dc21800');
});
test('Replace uses only counted BSTR services and installed Windows NLS',()=>{
 const {section}=emit(),imports=section.fixups.filter(f=>f.label.startsWith('iat:')).map(f=>f.label);
 assert.ok(imports.length>0);assert.ok(imports.every(s=>/SysStringLen|SysAllocStringLen|SysFreeString|CompareStringW/.test(s)));
 assert.equal(imports.filter(s=>s.endsWith('SysStringLen')).length,3);
 assert.equal(imports.filter(s=>s.endsWith('SysAllocStringLen')).length,2); // General and empty-result paths.
 assert.equal(imports.filter(s=>s.endsWith('CompareStringW')).length,2); // Count and fill passes.
});
test('Replace contains bounded UTF-16 comparison and copy instructions rather than NUL scans',()=>{
 const {bytes}=emit();assert.ok(bytes.includes(Buffer.from('fcf366a5','hex')));assert.ok(bytes.includes(Buffer.from('f366a7','hex')));
 // Every NLS argument is pushed without overwriting the staged source pointer.
 assert.ok(bytes.includes(Buffer.from('ff75f8ff750cff75f8526a016800040000ff15','hex')));
});
test('Replace output cleanup precedes its recoverable failure transfer',()=>{
 const {section,bytes}=emit();const cleanup=section.fixups.find(f=>f.label.endsWith('SysFreeString'));
 assert.ok(cleanup);const next=section.fixups.find(f=>f.offset>cleanup.offset);assert.equal(next.label,'error:5');
 assert.equal(bytes[next.offset-1],0xe9);assert.ok(section.fixups.some(f=>f.label==='error:7'&&f.offset<cleanup.offset));
 for(const f of section.fixups)assert.ok(f.label.startsWith('iat:')||f.label.startsWith('error:')||section.labels.has(f.label),'unresolved internal label: '+f.label);
});

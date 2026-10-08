import test from 'node:test';
import assert from 'node:assert/strict';
import {convertVbNetProject} from '../src/migration/index.js';
import {compileProject} from '../src/language/compiler.js';
import {VirtualMachine} from '../src/runtime/vm.js';
import {FILE_ORDER_FIXTURE,FILE_ORDER_EXPECTED,FILE_ORDER_BYTES} from './migration-file-order-fixtures.mjs';
import {project} from './migration-fixtures.mjs';

for(const codeStyle of ['native','compatibility'])test(codeStyle+': file position precedes scalar, fixed string, Currency and UDT storage',()=>{
 const r=convertVbNetProject(FILE_ORDER_FIXTURE,{platform:'AnyCPU',codeStyle});
 assert.ok(r.success,JSON.stringify(r.diagnostics));
 const source=r.files['Application/Module1.vb'];
 assert.match(source,/__vbFilePutOrder_long\]?\(\[?Handle\]?\(\), \[?Position\]?\(1S\), \[?Storage\]?\(\).\[?Number\]?\)/);
 assert.match(source,/__vbFileGetOrder_long\]?\(\[?Handle\]?\(\), \[?Position\]?\(1S\), \[?Storage\]?\(\).\[?Number\]?\)/);
 assert.match(source,/__vbFilePutOrder_Currency/);
 assert.match(source,/__vbFilePutOrder_string_Fixed/);
 assert.match(source,/__vbFilePutOrder_Module1_Payload/);
 assert.match(source,/FilePut\(fileNumber, value, recordNumber, True\)/);
 assert.match(source,/FilePut\(fileNumber, CLng\(value.ToDecimal\(\) \* 10000D\), recordNumber\)/);
 assert.match(source,/FilePut\(fileNumber, DirectCast\(value, Global.System.ValueType\), recordNumber\)/);
});

test('literal and omitted positions retain direct scalar framework calls without new runtime support',()=>{
 const r=convertVbNetProject(project('Public Sub Main()\nDim x As Long\nPut #1, 1, x\nGet #1, , x\nEnd Sub'),{runtime:'none'});
 assert.ok(r.success,JSON.stringify(r.diagnostics));
 assert.doesNotMatch(r.files['Application/Module1.vb'],/__vbFile.*Order/);
 assert.deepEqual(r.report.runtime.features,[]);
});

test('original file statement VM independently produces the value and side-effect goldens',async()=>{
 const output=[],compiled=compileProject(FILE_ORDER_FIXTURE);
 assert.deepEqual(compiled.diagnostics,[]);
 const vm=new VirtualMachine(compiled,{print:value=>output.push(value)});
 await vm.start();
 assert.deepEqual(output,FILE_ORDER_EXPECTED);
 assert.equal(Buffer.from(vm.fs.readBytes('ordered.bin')).toString('hex'),FILE_ORDER_BYTES);
 // This fixture is not only a converter-writer/converter-reader round trip.
 const golden=Buffer.from(FILE_ORDER_BYTES,'hex');
 assert.equal(golden.readInt32LE(0),16909060);
 assert.equal(golden.readBigInt64LE(4),-123456n);
 assert.equal(golden.subarray(12,16).toString('ascii'),'AB  ');
 assert.equal(golden.readInt32LE(16),84281096);
});

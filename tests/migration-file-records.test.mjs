import test from 'node:test';
import assert from 'node:assert/strict';
import {convertVbNetProject} from '../src/migration/index.js';
import {FILE_RECORD_FIXTURE} from './migration-file-record-fixtures.mjs';
import {project} from './migration-fixtures.mjs';
const convert=(input,options={})=>convertVbNetProject(input,{platform:'AnyCPU',...options});

for(const codeStyle of ['native','compatibility'])test(codeStyle+': binary scalars, fixed strings, Currency and nested records are converted',()=>{
 const result=convert(FILE_RECORD_FIXTURE,{codeStyle});
 assert.ok(result.success,JSON.stringify(result.diagnostics));
 const source=result.files['Application/Module1.vb'];
 assert.match(source,/<Global.Microsoft.VisualBasic.VBFixedString\(4\)>/);
 assert.match(source,/StringIsFixedLength:=True/);
 assert.match(source,/Value:=CLng\(\[?money\]?.ToDecimal\(\) \* 10000D\)/);
 assert.match(source,/__vbFileGet_Currency/);
 assert.match(source,/__vbFileGet_Module1_Record/);
 assert.match(source,/Dim boxed As Global.System.ValueType = value/);
 assert.match(source,/Finally\n\s+value = DirectCast\(boxed,/);
 assert.doesNotMatch(Object.keys(result.files).join('\n'),/Compatibility\/.*FileGet/);
});

test('native numeric record I/O does not add compatibility support',()=>{
 const result=convert(project('Public Type Pair\nX As Long\nY As Integer\nEnd Type\nPublic Sub Main()\nDim row As Pair\nPut #1, 1, row\nGet #1, 1, row\nDebug.Print Len(row)\nEnd Sub'),{runtime:'none'});
 assert.ok(result.success,JSON.stringify(result.diagnostics));
 assert.deepEqual(result.report.runtime.features,[]);
 assert.match(result.files['Application/Module1.vb'],/Global.Microsoft.VisualBasic.Strings.Len\(row\)/);
});

for(const field of ['Values(2) As Long','Value As Variant','Value As Currency'])test('unproved binary record field remains blocking: '+field,()=>{
 const result=convert(project('Public Type Row\n'+field+'\nEnd Type\nPublic Sub Main()\nDim row As Row\nPut #1, , row\nEnd Sub'));
 assert.equal(result.success,false);assert.ok(result.diagnostics.some(d=>d.code==='MIG_BINARY_LAYOUT'));
 assert.match(result.files['Directory.Build.targets'],/RequireResolvedMigration/);
});

test('Currency binary files do not silently adopt approved Decimal layout changes',()=>{
 const result=convert(project('Public Sub Main()\nDim c As Currency\nPut #1, , c\nEnd Sub'),{semanticPolicy:'modernize',acceptedRules:['currency-decimal']});
 assert.ok(result.diagnostics.some(d=>d.code==='MIG_BINARY_CURRENCY_MODERNIZATION'));
});

test('FileGet arguments preserve handle, position and storage evaluation order',()=>{
 const input=project('Public Sub Main()\nDim x As Long\nGet #Handle(), Position(), x\nEnd Sub\nPublic Function Handle() As Integer\nHandle=1\nEnd Function\nPublic Function Position() As Long\nPosition=1\nEnd Function');
 const result=convert(input);assert.ok(result.success,JSON.stringify(result.diagnostics));
 assert.match(result.files['Application/Module1.vb'],/FileGet\(FileNumber:=Handle\(\), RecordNumber:=Position\(\), Value:=x\)/);
});

test('resolved fixed-string length expressions use the verified bound layout',()=>{
 const input=project('Private Const Width As Long=4\nPublic Type Row\nName As String * Width\nEnd Type\nPublic Sub Main()\nDim row As Row\nPut #1, , row\nEnd Sub');
 const result=convert(input);assert.ok(result.success,JSON.stringify(result.diagnostics));
 assert.match(result.files['Application/Module1.vb'],/VBFixedString\(4\)/);
});

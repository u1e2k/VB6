import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {convertVbNetProject} from '../src/migration/index.js';
import {procedure,project,formProject} from './migration-fixtures.mjs';

test('output-quality budgets compare identical projects under both explicit profiles',()=>{
 const fixtures={empty:procedure(''),scalar:procedure('Dim n As Long\nn=21\nDebug.Print n*2'),
 array:procedure('Dim a(9) As Long\na(3)=9\nDebug.Print a(3)'),
 record:project('Public Type Point\nX As Long\nY As Long\nEnd Type\nPublic Sub Main()\nDim p As Point\np.X=1\nEnd Sub'),form:formProject(),currency:procedure('Dim c As Currency\nc=1.23456@')};
 const cases=[];
 for(const [name,input] of Object.entries(fixtures)){
  const native=convertVbNetProject(input,{includeOriginals:false,codeStyle:'native',runtime:'minimal'}),legacy=convertVbNetProject(input,{includeOriginals:false,codeStyle:'compatibility',runtime:'project'});
  assert.ok(native.success,JSON.stringify(native.diagnostics));assert.ok(legacy.success);
  const measure=result=>({runtime:result.report.runtime,applicationSourceBytes:Object.entries(result.files).filter(([p])=>/^Application\/[^/]+\.vb$/.test(p)).reduce((n,[,v])=>n+Buffer.byteLength(v),0)});
  cases.push({name,native:measure(native),compatibility:measure(legacy)});
  assert.equal(native.report.runtime.sourceFiles,name==='currency'?1:0);
  assert.ok(native.report.runtime.sourceBytes<legacy.report.runtime.sourceBytes);
 }
 const dir=path.resolve(import.meta.dirname,'../reports/vbnet-migration');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'native-output-quality.json'),JSON.stringify({measurement:'generated UTF-8 source; not binary size or runtime speed',cases},null,2)+'\n');
});

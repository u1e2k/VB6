import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {harness,skip} from './migration-dotnet-support.mjs';
import {OPTIONAL_FIXTURE,OPTIONAL_EXPECTED,OPTIONAL_INTERFACE_FIXTURE,OPTIONAL_INTERFACE_EXPECTED} from './migration-optional-fixtures.mjs';

for(const codeStyle of ['native','compatibility'])for(const [name,input,expected] of [
 ['defaults',OPTIONAL_FIXTURE,OPTIONAL_EXPECTED],['interfaces',OPTIONAL_INTERFACE_FIXTURE,OPTIONAL_INTERFACE_EXPECTED]
])test('optional Currency .NET execution: '+codeStyle+' '+name,{skip,timeout:150000},t=>{
 const h=harness(t,'optional-'+codeStyle+'-'+name,input,{codeStyle,strict:true,patch(directory){
  const source=fs.existsSync(path.join(directory,'Application/__vbEntry.vb'))?'Application/__vbEntry.vb':'Application/Module1.vb';
  const file=path.join(directory,source);
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/Public Sub Main\(\)/,'Public Sub Main()\n        Global.System.Globalization.CultureInfo.CurrentCulture = Global.System.Globalization.CultureInfo.InvariantCulture'));
 }});
 assert.deepEqual(h.run(),expected);
});

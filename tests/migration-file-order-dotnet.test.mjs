import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {harness,skip} from './migration-dotnet-support.mjs';
import {FILE_ORDER_FIXTURE,FILE_ORDER_EXPECTED,FILE_ORDER_BYTES} from './migration-file-order-fixtures.mjs';
for(const codeStyle of ['native','compatibility'])test('file handle-position-storage .NET execution: '+codeStyle,{skip,timeout:150000},t=>{
 const h=harness(t,'file-order-'+codeStyle,FILE_ORDER_FIXTURE,{codeStyle,patch(directory){
  const file=path.join(directory,'Application/Module1.vb');
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/(Public Sub \[?Main\]?\(\))/, '$1\n        Global.System.Globalization.CultureInfo.CurrentCulture = Global.System.Globalization.CultureInfo.InvariantCulture'));
 }});
 assert.deepEqual(h.run(),FILE_ORDER_EXPECTED);
 assert.equal(fs.readFileSync(path.join(h.directory,'ordered.bin')).toString('hex'),FILE_ORDER_BYTES);
});

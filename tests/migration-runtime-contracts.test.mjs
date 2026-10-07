import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RUNTIME_FILES} from '../src/migration/runtime-sources.js';

test('array default indexer has a required first subscript and retains arbitrary rank',()=>{
  const source=RUNTIME_FILES['VB6.Compatibility/src/VbArray.vb'];
  assert.match(source,/Default Public Property Item\(first As Integer, ParamArray remaining As Integer\(\)\)/);
  assert.match(source,/remaining.Length \+ 1 <> Rank/);
  assert.match(source,/If\(i = 0, first, remaining\(i - 1\)\)/);
});
test('generated runtime payload contains the exact authored source and license files',()=>{
  for(const [directory,name] of [['vbnet-runtime','VB6.Compatibility'],['vbnet-runtime-windows','VB6.Compatibility.Windows']]){
    const base=new URL('../packages/'+directory+'/',import.meta.url);
    for(const file of ['LICENSE',name+'.vbproj',...fs.readdirSync(new URL('src/',base)).filter(f=>f.endsWith('.vb')).map(f=>'src/'+f)]){
      assert.equal(RUNTIME_FILES[name+'/'+file],fs.readFileSync(new URL(file,base),'utf8'),file);
    }
  }
});

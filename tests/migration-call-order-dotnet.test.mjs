import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,skip} from './migration-dotnet-support.mjs';
import {CALL_ORDER_FIXTURE,CALL_ORDER_EXPECTED} from './migration-call-order-fixtures.mjs';
for(const codeStyle of ['native','compatibility'])test('named argument order and live ByRef execution: '+codeStyle,{skip,timeout:150000},t=>{
 const h=harness(t,'call-order-'+codeStyle,CALL_ORDER_FIXTURE,{codeStyle,strict:true});
 assert.deepEqual(h.run(),CALL_ORDER_EXPECTED);
 if(codeStyle==='native')assert.deepEqual(h.result.report.runtime.features,[]);
});

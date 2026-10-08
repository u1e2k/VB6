import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,skip} from './migration-dotnet-support.mjs';
import {SETTER_ORDER_FIXTURE,SETTER_ORDER_EXPECTED} from './migration-setter-order-fixtures.mjs';
for(const codeStyle of ['native','compatibility'])test('indexed Property Let/Set evaluation order .NET execution: '+codeStyle,{skip,timeout:150000},t=>{
 const h=harness(t,'setter-order-'+codeStyle,SETTER_ORDER_FIXTURE,{codeStyle});
 assert.deepEqual(h.run(),SETTER_ORDER_EXPECTED);
});

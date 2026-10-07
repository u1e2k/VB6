import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeControlFixtures} from '../tools/win32-control-fixtures.mjs';
import {traceControlFixture} from '../tools/trace-win32-controls.mjs';
import {compileWin32} from '../src/native/compiler.js';
test('failure-only control tracing preserves authored fixture checks and original sources',()=>{
  for(const {project} of nativeControlFixtures()){
    const before=JSON.stringify(project),traced=traceControlFixture(project);
    assert.equal(JSON.stringify(project),before);
    for(const line of project.modules[0].code.split('\n').filter(s=>s.includes('Then ExitProcess ')))assert.ok(traced.modules[0].code.includes(line),line);
    for(const optimization of [0,1,2])assert.doesNotThrow(()=>compileWin32(traced,{optimization}));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileMacOS} from '../packages/macos-native/src/compiler.js';
import {lifetimeProject} from '../packages/macos-native/tests/lifetimes.mjs';

test('native class lifetime fixture lowers through the ordinary shared frontend', () => {
  const input=lifetimeProject(),before=JSON.stringify(input);
  const a=compileMacOS(input),b=compileMacOS(input);
  assert.equal(a.files['main.cpp'],b.files['main.cpp']);
  assert.equal(JSON.stringify(input),before);
  assert.match(a.files['main.cpp'],/m.procedures\["class_terminate"\]/);
  assert.match(a.files['main.cpp'],/InterfaceMember\{"ilifetimeprobe_touch"/);
});
test('native End suppresses pending finalizers before C++ stack unwinding', () => {
  const source=compileMacOS({schema:1,name:'Ends',startup:'Sub Main',modules:[
    {name:'Main',kind:'module',code:'Public Sub Main()\nEnd\nEnd Sub'}
  ]}).files['main.cpp'];
  assert.match(source,/f\.runtime\.ending=true;throw EndExecution\{\};/);
});
test('class procedures transfer argument ownership instead of retaining snapshots', () => {
  const source=compileMacOS(lifetimeProject()).files['main.cpp'];
  assert.match(source,/callMember\(f.runtime,receiver,"Touch",std::move\(args\)\)/);
  const frames=fs.readFileSync(new URL('../packages/macos-native/native/frames.cpp',import.meta.url),'utf8');
  assert.doesNotMatch(frames,/arguments\.emplace_back\(locals/);
  assert.doesNotMatch(source,/Args\{Arg\(/);
  assert.match(source,/args\.reserve\(2\);args\.emplace_back\(f\.ref\("value"\)/);
  assert.match(frames,/runtime\.invoke\(self,name,std::move\(args\),true\)/);
});

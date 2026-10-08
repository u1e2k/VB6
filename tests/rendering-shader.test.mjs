import test from 'node:test';
import assert from 'node:assert/strict';
import {UI_SHADER, WebGPUPainter} from '../src/rendering/webgpu.js';

test('instance-constant flat outputs allow either provoking vertex in compatibility mode', () => {
  assert.doesNotMatch(UI_SHADER, /@interpolate\(flat\)/);
  assert.match(UI_SHADER, /@interpolate\(flat, either\) clip:/);
  assert.match(UI_SHADER, /@interpolate\(flat, either\) mode:/);
  // Both outputs come directly from instance attributes, never a vertex corner.
  assert.match(UI_SHADER, /out\.clip = clip; out\.mode = paintFlags\.x;/);
});

test('WebIDL GPU validation objects preserve their diagnostic message and cause', async t => {
  const failure = {message:'compatibility pipeline validation failed'};
  t.mock.method(WebGPUPainter.prototype, 'initialize', async () => { throw failure; });
  const canvas = {ownerDocument:{defaultView:{}}};
  await assert.rejects(WebGPUPainter.create(canvas), error => {
    assert.ok(error instanceof Error); assert.equal(error.message, failure.message); assert.equal(error.cause, failure);
    return true;
  });
});

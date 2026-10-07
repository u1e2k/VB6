import test from 'node:test';
import assert from 'node:assert/strict';
import {compileWin32} from '../src/native/compiler.js';
import {PE32Image} from '../src/native/pe32.js';
import {richTextControlFixture} from '../tools/win32-control-fixtures.mjs';

// Check emitted instructions, not a parallel copy of the stream option planner.
// SF_USECODEPAGE with CP_UTF8 produces a URTF header. VB TextRTF/SelRTF must
// export ordinary 7-bit RTF, retaining Unicode through native escape sequences.
for(const optimization of [0,1,2])test(`RTF output uses standard SF_RTF while input preserves native code pages or selects UTF-8 at O${optimization}`,t=>{
  const finish=PE32Image.prototype.finish;let image;
  t.mock.method(PE32Image.prototype,'finish',function(...args){image=finish.apply(this,args);return image;});
  compileWin32(richTextControlFixture().project,{optimization});
  const code=label=>{
    const rva=image.symbols[label],section=image.sections.find(s=>rva>=s.rva&&rva<s.rva+s.size);
    assert.ok(section,label);const start=section.offset+rva-section.rva;
    return Buffer.from(image.bytes).subarray(start,start+256);
  };
  // OR EAX, SF_RTF follows loading the dynamic SFF_SELECTION argument.
  assert.ok(code('native:rich:get').includes(Buffer.from([0x0d,2,0,0,0])));
  assert.equal(code('native:rich:get').includes(Buffer.from([0x0d,0x22,0,0xe9,0xfd])),false);
  // Counted input scanning keeps ASCII RTF's declared font code pages and
  // switches only raw non-ASCII UTF-8 input to an explicit code-page override.
  const input=code('native:rich:input-flags');
  assert.ok(input.includes(Buffer.from([0xb8,2,0,0,0])));
  assert.ok(input.includes(Buffer.from([0xf6,0x02,0x80])));
  assert.ok(input.includes(Buffer.from([0xb8,0x22,0,0xe9,0xfd])));
  for(const name of ['set','set-selection']){
    const bytes=code('native:rich:'+name),base=image.symbols['native:rich:'+name];
    assert.ok([...bytes.keys()].some(i=>bytes[i]===0xe8&&i+5<=bytes.length&&base+i+5+bytes.readInt32LE(i+1)===image.symbols['native:rich:input-flags']));
  }
  assert.ok(code('native:rich:set-selection').includes(Buffer.from([0x0d,0,0x80,0,0])));
});

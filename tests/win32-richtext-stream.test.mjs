import test from 'node:test';
import assert from 'node:assert/strict';
import {compileWin32} from '../src/native/compiler.js';
import {PE32Image} from '../src/native/pe32.js';
import {richTextControlFixture} from '../tools/win32-control-fixtures.mjs';

// Check emitted instructions, not a parallel copy of the stream option planner.
// SF_USECODEPAGE with CP_UTF8 produces a URTF header. VB TextRTF/SelRTF must
// export ordinary 7-bit RTF, retaining Unicode through native escape sequences.
for(const optimization of [0,1,2])test(`RTF output uses standard SF_RTF while input accepts UTF-8 at O${optimization}`,t=>{
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
  // Input still accepts explicitly encoded UTF-8 without an ANSI round trip.
  const utf8=Buffer.from([0x22,0,0xe9,0xfd]);
  assert.ok(code('native:rich:set').includes(utf8));
  assert.ok(code('native:rich:set-selection').includes(Buffer.from([0x22,0x80,0xe9,0xfd])));
});

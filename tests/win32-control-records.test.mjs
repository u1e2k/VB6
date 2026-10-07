import test from 'node:test';
import assert from 'node:assert/strict';
import {compileWin32} from '../src/native/compiler.js';
import {PE32Image,PE32_BASE} from '../src/native/pe32.js';
import {contentControlFixture} from '../tools/win32-control-fixtures.mjs';

// Inspect the actual linked records, not a second implementation of their writer.
// String interning also appends to .rdata: doing it halfway through a record used
// to replace pointer fields with a BSTR length/header and split TBBUTTON arrays.
for(const optimization of [0,1,2])test(`native common-control records have contiguous ABI fields at O${optimization}`,t=>{
  const finish=PE32Image.prototype.finish;let linked;
  t.mock.method(PE32Image.prototype,'finish',function(...args){linked=finish.apply(this,args);return linked;});
  compileWin32(contentControlFixture().project,{optimization});
  const bytes=Buffer.from(linked.bytes);
  const offset=rva=>{const s=linked.sections.find(s=>rva>=s.rva&&rva<s.rva+s.size);assert.ok(s,`unmapped RVA ${rva.toString(16)}`);return s.offset+rva-s.rva;};
  const record=prefix=>{const name=Object.keys(linked.symbols).find(s=>s.toLowerCase()===prefix);assert.ok(name,prefix);return offset(linked.symbols[name]);};
  const word=(at)=>bytes.readUInt32LE(at);
  const textAt=at=>{const rva=word(at)-PE32_BASE,start=offset(rva);let end=start;while(bytes.readUInt16LE(end))end+=2;return bytes.toString('utf16le',start,end);};
  for(const [index,text,width]of [[0,'Name',100],[1,'Value',60]]){
    const at=record(`list-column:form1:rows:${index}`);
    assert.equal(word(at),15);assert.equal(word(at+8),width);assert.equal(textAt(at+12),text);assert.equal(word(at+20),index);
  }
  for(const [index,text,sub]of [[0,'First','One'],[1,'Second','Two']]){
    const at=record(`list-item:form1:rows:${index}`),child=record(`list-item:form1:rows:${index}:0`);
    assert.equal(word(at),1);assert.equal(word(at+4),index);assert.equal(textAt(at+20),text);assert.equal(word(at+28),0xffffffff);
    assert.equal(word(child+8),1);assert.equal(textAt(child+20),sub);
  }
  const buttons=record('toolbar-buttons:form1:tools');
  for(const [index,text]of [[0,'Open'],[1,'Save']]){
    const at=buttons+index*20;assert.equal(word(at),0xfffffffe);assert.equal(word(at+4),20001+index);
    assert.equal(bytes[at+8],4);assert.equal(bytes[at+9],16);assert.equal(word(at+12),0);assert.equal(textAt(at+16),text);
  }
  for(const [name,texts]of [['pages',['First','Second','Third']],['strip',['A','B']]])for(const [index,text]of texts.entries()){
    const at=record(`control-tab:form1:${name}:${index}`);assert.equal(word(at),1);assert.equal(textAt(at+12),text);assert.equal(word(at+20),0xffffffff);assert.equal(word(at+24),0);
  }
});

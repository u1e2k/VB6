/** Bounds-checked arm64 Mach-O executable inspection, usable without macOS. */
export function inspectMachO(input) {
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.byteLength<32)throw new Error('Truncated Mach-O header');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u32=offset=>view.getUint32(offset,true);
  if(u32(0)!==0xfeedfacf)throw new Error('Expected a thin little-endian 64-bit Mach-O');
  if(u32(4)!==0x0100000c)throw new Error('Executable is not Apple Silicon arm64');
  if(u32(12)!==2)throw new Error('Mach-O is not an MH_EXECUTE image');
  const count=u32(16),size=u32(20),end=32+size;
  if(count>65535||size<8*count||end>bytes.length)throw new Error('Invalid Mach-O load-command table');
  let at=32,entry=false,signature=null,build=null;
  const dylibs=[],segments=[];
  const version=n=>`${n>>>16}.${(n>>>8)&255}.${n&255}`;
  const string=(start,end)=>{
    let stop=start;while(stop<end&&bytes[stop])++stop;
    if(stop===end)throw new Error('Unterminated Mach-O string');
    return new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(start,stop));
  };
  for(let i=0;i<count;++i) {
    if(at+8>end)throw new Error('Truncated Mach-O load command');
    const command=u32(at),length=u32(at+4),next=at+length;
    if(length<8||length%8||next>end)throw new Error('Invalid Mach-O load-command size');
    if(command===0x80000028){if(length<24)throw new Error('Truncated LC_MAIN');entry=true;}
    if(command===0x1d) {
      if(length<16)throw new Error('Truncated code-signature command');
      const offset=u32(at+8),size=u32(at+12);
      if(size===0||offset<end||offset+size>bytes.length)throw new Error('Invalid embedded code signature');
      signature={offset,size};
    }
    if(command===0x32) {
      if(length<24||24+u32(at+20)*8>length)throw new Error('Truncated LC_BUILD_VERSION');
      if(u32(at+8)!==1)throw new Error('Mach-O is not a macOS executable');
      build={platform:'macOS',minimumVersion:version(u32(at+12)),sdk:version(u32(at+16))};
    }
    if(command===0x19) {
      if(length<72||72+u32(at+64)*80>length)throw new Error('Invalid LC_SEGMENT_64');
      const name=string(at+8,at+25),fileOffset=view.getBigUint64(at+40,true),fileSize=view.getBigUint64(at+48,true);
      if(fileOffset+fileSize>BigInt(bytes.length))throw new Error('Segment extends beyond Mach-O image');
      segments.push({name,read:!!(u32(at+60)&1),write:!!(u32(at+60)&2),execute:!!(u32(at+60)&4)});
    }
    if([0xc,0x80000018,0x8000001f,0x20,0x80000023].includes(command)) {
      if(length<24)throw new Error('Truncated dylib load command');
      const offset=u32(at+8);if(offset<24||offset>=length)throw new Error('Invalid dylib name offset');
      dylibs.push(string(at+offset,next));
    }
    at=next;
  }
  if(at!==end||!entry||!build)throw new Error('Missing executable entry or macOS platform metadata');
  if(!segments.some(s=>s.name==='__TEXT'&&s.execute&&!s.write))throw new Error('Missing read/execute __TEXT segment');
  if(segments.some(s=>s.write&&s.execute))throw new Error('Native export must not require writable executable memory');
  return Object.freeze({format:'Mach-O',architecture:'arm64',fileType:'executable',bytes:bytes.length,pie:!!(u32(24)&0x200000),build,signature,dylibs,segments});
}

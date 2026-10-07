/** Deterministic UTF-8 STORE ZIP; bounded classic ZIP, zero host dependencies. */
const encoder = new TextEncoder();
const table = new Uint32Array(256);
for (let i=0;i<256;i++) { let c=i; for(let b=0;b<8;b++) c=(c>>>1)^((c&1)?0xedb88320:0); table[i]=c>>>0; }
function checksum(bytes) { let c=0xffffffff; for(const b of bytes)c=table[(c^b)&255]^(c>>>8); return (c^0xffffffff)>>>0; }
export function migrationZip(files) {
  const paths=Object.keys(files).sort();
  if(paths.length>=65535)throw new RangeError('Too many migration archive entries');
  const records=[],central=[],names=new Set(); let offset=0,centralLength=0;
  for(const path of paths) {
    if(!path||/[\\\x00-\x1f<>:"|?*]/.test(path)||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw new TypeError('Unsafe archive path: '+path);
    const normalized=path.normalize('NFC').toLowerCase(); if(names.has(normalized))throw new TypeError('Duplicate archive path: '+path); names.add(normalized);
    if(new TextDecoder('utf-8',{fatal:true}).decode(encoder.encode(path))!==path)throw new TypeError('Invalid Unicode archive path');
    const name=encoder.encode(path),value=files[path],bytes=typeof value==='string'?encoder.encode(value):value instanceof Uint8Array?value:null;
    if(!bytes)throw new TypeError('Archive contents must be strings or Uint8Array');
    if(name.length>65535||bytes.length>=0xffffffff||offset+bytes.length+name.length+30>=0xffffffff)throw new RangeError('ZIP64 required');
    const crc=checksum(bytes),local=new Uint8Array(30),lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint16(12,33,true);
    lv.setUint32(14,crc,true);lv.setUint32(18,bytes.length,true);lv.setUint32(22,bytes.length,true);lv.setUint16(26,name.length,true);
    const directory=new Uint8Array(46),dv=new DataView(directory.buffer);
    dv.setUint32(0,0x02014b50,true);dv.setUint16(4,20,true);dv.setUint16(6,20,true);dv.setUint16(8,0x800,true);dv.setUint16(14,33,true);
    dv.setUint32(16,crc,true);dv.setUint32(20,bytes.length,true);dv.setUint32(24,bytes.length,true);dv.setUint16(28,name.length,true);dv.setUint32(42,offset,true);
    records.push(local,name,bytes);central.push(directory,name);offset+=30+name.length+bytes.length;centralLength+=46+name.length;
  }
  if(offset+centralLength+22>=0xffffffff)throw new RangeError('ZIP64 required');
  const end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,paths.length,true);ev.setUint16(10,paths.length,true);ev.setUint32(12,centralLength,true);ev.setUint32(16,offset,true);
  const result=new Uint8Array(offset+centralLength+22);let at=0;
  for(const part of [...records,...central,end]){result.set(part,at);at+=part.length;}return result;
}

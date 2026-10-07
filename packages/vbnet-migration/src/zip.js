import {checkedPath, MigrationError} from './contracts.js';
import {crc32} from '../../../src/project/zip.js';
const encoder=new TextEncoder();
export function fileBytes(value){
  if(typeof value==='string')return encoder.encode(value);
  if(value instanceof Uint8Array)return value;
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  throw new TypeError('Migration files must contain text or bytes');
}
/** Classic STORE ZIP with fixed UTC DOS epoch, UTF-8 paths, CRCs and bounded
 * allocation. Stable ordering and no clock/randomness make exports reproducible. */
export function migrationZip(files,maxBytes=100*1024*1024){
  const entries=Object.entries(files).sort(([a],[b])=>a<b?-1:a>b?1:0),names=new Set();
  if(entries.length>65534)throw new MigrationError('Too many ZIP entries');
  let localSize=0,centralSize=0;
  const prepared=entries.map(([path,value])=>{
    path=checkedPath(path);const key=path.normalize('NFC').toLowerCase();
    if(names.has(key))throw new MigrationError('Duplicate migration ZIP path: '+path);names.add(key);
    const name=encoder.encode(path),data=fileBytes(value);
    if(new TextDecoder('utf-8',{fatal:true}).decode(name)!==path)throw new MigrationError('Invalid Unicode ZIP path');
    if(name.length>65535)throw new MigrationError('ZIP path exceeds classic format');
    localSize+=30+name.length+data.length;centralSize+=46+name.length;
    if(localSize+centralSize+22>maxBytes||localSize>=0xffffffff)throw new MigrationError('Migration ZIP exceeds output byte budget');
    return {name,data,crc:crc32(data)};
  });
  const out=new Uint8Array(localSize+centralSize+22),view=new DataView(out.buffer);let local=0,central=localSize;
  for(const entry of prepared){const {name,data,crc}=entry;
    view.setUint32(local,0x04034b50,true);view.setUint16(local+4,20,true);view.setUint16(local+6,0x800,true);view.setUint16(local+12,33,true);
    view.setUint32(local+14,crc,true);view.setUint32(local+18,data.length,true);view.setUint32(local+22,data.length,true);view.setUint16(local+26,name.length,true);
    out.set(name,local+30);out.set(data,local+30+name.length);
    view.setUint32(central,0x02014b50,true);view.setUint16(central+4,20,true);view.setUint16(central+6,20,true);view.setUint16(central+8,0x800,true);view.setUint16(central+14,33,true);
    view.setUint32(central+16,crc,true);view.setUint32(central+20,data.length,true);view.setUint32(central+24,data.length,true);view.setUint16(central+28,name.length,true);view.setUint32(central+42,local,true);out.set(name,central+46);
    local+=30+name.length+data.length;central+=46+name.length;
  }
  view.setUint32(central,0x06054b50,true);view.setUint16(central+8,entries.length,true);view.setUint16(central+10,entries.length,true);view.setUint32(central+12,centralSize,true);view.setUint32(central+16,localSize,true);
  return out;
}

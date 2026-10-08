import test from 'node:test';
import assert from 'node:assert/strict';
import {nativePictureHeader,resolveNativePicture,resolveNativeResourcePicture,resolveNativeResourceString} from '../src/native/picture-resources.js';
import {toBase64} from '../src/project/frx.js';
import {encodeStringTable} from '../src/project/res.js';
export function nativeTestBitmap(width=2,height=2){const size=54+((width*3+3)&~3)*height,b=new Uint8Array(size),v=new DataView(b.buffer);v.setUint16(0,0x4d42,true);v.setUint32(2,size,true);v.setUint32(10,54,true);v.setUint32(14,40,true);v.setInt32(18,width,true);v.setInt32(22,height,true);v.setUint16(26,1,true);v.setUint16(28,24,true);b.fill(127,54);return b;}
const uri=bytes=>'data:image/bmp;base64,'+toBase64(bytes);
test('native picture planning decodes bounded dimensions without loading external assets',()=>{
 const bytes=nativeTestBitmap(),p={assets:{'form/image.bmp':{encoding:'base64',data:toBase64(bytes)}}};
 assert.deepEqual(nativePictureHeader(bytes),{kind:'raster',format:'bmp',width:2,height:2});
 assert.deepEqual(resolveNativePicture(p,uri(bytes)).bytes,bytes);assert.deepEqual(resolveNativePicture(p,'image.bmp',{sourcePath:'form/Main.frm'}).bytes,bytes);
 assert.throws(()=>resolveNativePicture(p,'https://example.com/picture.bmp'),/unsafe/);assert.throws(()=>resolveNativePicture(p,'missing.bmp'),/Missing/);
});
test('malformed and decompression-sized native picture headers fail before any executable is written',()=>{
 for(const input of [new Uint8Array(),new Uint8Array(8),new Uint8Array([71,73,70,56,57,97,1,0])])assert.throws(()=>nativePictureHeader(input));
 const b=nativeTestBitmap(),v=new DataView(b.buffer);v.setUint32(18,0x7fffffff,true);assert.throws(()=>nativePictureHeader(b),/dimensions/);v.setUint32(18,2,true);v.setUint32(10,b.length+1,true);assert.throws(()=>nativePictureHeader(b),/bitmap/);
});
test('project RT_BITMAP and string resources are resolved by identifier and language without retaining unrelated blobs',()=>{
 const bmp=nativeTestBitmap(),strings=Array(16).fill('');strings[2]='Hello\0World';
 const p={resources:{entries:[{type:2,name:101,language:0,data:toBase64(bmp.slice(14))},{type:6,name:1,language:0,data:toBase64(encodeStringTable(strings))}]}};
 assert.deepEqual(resolveNativeResourcePicture(p,101).bytes,bmp);assert.equal(resolveNativeResourceString(p,2),'Hello\0World');assert.throws(()=>resolveNativeResourcePicture(p,404),/not found/);
});

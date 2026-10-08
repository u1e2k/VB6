/** Compile-time image/resource resolution. The generated executable contains only
 * requested bytes, never this decoder, project assets, or a JavaScript runtime.
 * Native codecs still validate the payload at load time. Header dimensions are
 * bounded here to reject decompression-sized allocations before Windows sees it.
 */
import {rasterBytes,fromBase64,readFRXRecord,resolveProjectPath,MAX_RESOURCE_BYTES} from '../project/frx.js';
import {ResourceStore} from '../runtime/resources.js';
const limit=32768,pixels=64*1024*1024;
function dimensions(width,height){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>limit||height>limit||width*height>pixels)throw new TypeError('Native picture dimensions exceed 32768 per axis or 64M pixels');return {width,height};}
export function nativePictureHeader(input){
 const bytes=new Uint8Array(input),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=bytes.length;
 if(n<8||n>MAX_RESOURCE_BYTES)throw new TypeError('Native picture payload is truncated or oversized');
 const starts=values=>values.every((x,i)=>bytes[i]===x);
 if(starts([137,80,78,71,13,10,26,10])){
  if(n<33||v.getUint32(8)!==13||v.getUint32(12)!==0x49484452)throw new TypeError('Invalid PNG IHDR');
  return {kind:'raster',format:'png',...dimensions(v.getUint32(16),v.getUint32(20))};
 }
 if(n>=10&&starts([71,73,70,56])&&[55,57].includes(bytes[4])&&bytes[5]===97)return {kind:'raster',format:'gif',...dimensions(v.getUint16(6,true),v.getUint16(8,true))};
 if(starts([66,77])){
  if(n<54||v.getUint32(14,true)<40||v.getUint32(10,true)>n||v.getUint16(26,true)!==1)throw new TypeError('Invalid bitmap header');
  return {kind:'raster',format:'bmp',...dimensions(v.getInt32(18,true),Math.abs(v.getInt32(22,true)))};
 }
 if(starts([255,216])){
  let at=2;
  while(at+4<=n){if(bytes[at++]!==255)throw new TypeError('Invalid JPEG marker');while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===0xd9||marker===0xda)break;if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;const size=v.getUint16(at);if(size<2||at+size>n)throw new TypeError('Truncated JPEG segment');
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){if(size<8)throw new TypeError('Invalid JPEG frame');return {kind:'raster',format:'jpeg',...dimensions(v.getUint16(at+5),v.getUint16(at+3))};}at+=size;
  }throw new TypeError('JPEG picture has no bounded frame dimensions');
 }
 if(starts([0,0,1,0])){
  const count=v.getUint16(4,true);if(!count||count>256||n<6+16*count)throw new TypeError('Invalid ICO directory');
  const images=[];
  for(let i=0;i<count;i++){
   const at=6+16*i,length=v.getUint32(at+8,true),offset=v.getUint32(at+12,true),width=bytes[at]||256,height=bytes[at+1]||256;
   if(bytes[at+3]!==0||!length||offset<6+16*count||offset+length>n)throw new TypeError('ICO image is outside its payload');
   dimensions(width,height);const image=bytes.slice(offset,offset+length),dv=new DataView(image.buffer);
   if(image[0]===137){const png=nativePictureHeader(image);if(png.format!=='png'||png.width!==width||png.height!==height)throw new TypeError('ICO PNG dimensions disagree with its directory');}
   else if(length<40||![40,108,124].includes(dv.getUint32(0,true))||dv.getInt32(4,true)!==width||dv.getInt32(8,true)!==height*2||dv.getUint16(12,true)!==1)throw new TypeError('Invalid ICO bitmap dimensions');
   images.push({width,height,bits:v.getUint16(at+6,true),bytes:image});
  }
  // Prefer the highest-quality 32-pixel image for an application icon; retain
  // every entry when writing the PE resource group so the shell can choose DPI.
  const selected=[...images].sort((a,b)=>Math.abs(a.width-32)-Math.abs(b.width-32)||b.bits-a.bits)[0];
  return {kind:'icon',format:'ico',width:selected.width,height:selected.height,images,selected};
 }
 throw new TypeError('Native picture requires embedded PNG, JPEG, GIF, BMP or ICO data');
}
export function resolveNativePicture(project,value,module){
 let bytes;
 if(typeof value==='string'&&value.startsWith('data:'))bytes=rasterBytes(value);
 else if(value&&typeof value==='object'&&value.resource){
  const path=resolveProjectPath(Object.keys(project.assets||{}),module?.sourcePath||module?.name+'.frm',value.resource);
  if(!path)throw new TypeError('Missing native picture resource '+value.resource);
  const record=readFRXRecord(fromBase64(project.assets[path].data),value.offset,'Picture');if(record.kind!=='picture')throw new TypeError('Picture resource is not an FRX picture record');bytes=record.bytes;
 }else if(typeof value==='string'){
  const assets=project.assets||{},path=resolveProjectPath(Object.keys(assets),module?.sourcePath||module?.name+'.frm',value,{basenameFallback:true});
  if(!path||assets[path].encoding!=='base64')throw new TypeError('Missing embedded native picture asset '+value);
  bytes=fromBase64(assets[path].data);
 }else throw new TypeError('Native picture value requires a data URI or embedded asset');
 return {...nativePictureHeader(bytes),bytes};
}
export function resolveNativeResourcePicture(project,id,format=0){return resolveNativePicture(project,new ResourceStore(project.resources,project.settings?.resourceLanguage).picture(id,format));}
export function resolveNativeResourceString(project,id){return new ResourceStore(project.resources,project.settings?.resourceLanguage).string(id);}

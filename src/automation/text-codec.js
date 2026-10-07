/** Explicit text codecs used by HTTP and ADO streams. No OS-codepage guessing. */
import {VBError} from '../language/errors.js';
const aliases={unicode:'utf-16le','utf-16':'utf-16le','utf-16le':'utf-16le','utf-16be':'utf-16be',utf8:'utf-8','utf-8':'utf-8','windows-1252':'windows-1252',ascii:'us-ascii','us-ascii':'us-ascii','iso-8859-1':'iso-8859-1'};
export function charset(name){const result=aliases[String(name).toLowerCase()];if(!result)throw new VBError('Unsupported character set: '+name,3001);return result;}
export const bom=name=>name==='utf-8'?new Uint8Array([239,187,191]):name==='utf-16le'?new Uint8Array([255,254]):name==='utf-16be'?new Uint8Array([254,255]):new Uint8Array();
let western;
export function encodeText(text,name){
  name=charset(name);text=String(text);
  if(name==='utf-8')return new TextEncoder().encode(text);
  if(name.startsWith('utf-16')){const bytes=new Uint8Array(text.length*2),view=new DataView(bytes.buffer);for(let i=0;i<text.length;i++)view.setUint16(i*2,text.charCodeAt(i),name==='utf-16le');return bytes;}
  if(name==='windows-1252'&&!western){western=new Map();const decoder=new TextDecoder('windows-1252');for(let i=0;i<256;i++)western.set(decoder.decode(new Uint8Array([i])),i);}
  const bytes=new Uint8Array(text.length);let i=0;for(const c of text){const n=name==='windows-1252'?western.get(c):c.codePointAt(0);if(n===undefined||n>(name==='us-ascii'?127:255))throw new VBError('Character cannot be represented in '+name,13);bytes[i++]=n;}return bytes.subarray(0,i);
}
export function decodeText(bytes,name='utf-8',{fatal=true}={}){
  name=charset(name);
  if(name==='iso-8859-1'||name==='us-ascii'){let out='';for(const n of bytes){if(name==='us-ascii'&&n>127&&fatal)throw new VBError('Invalid ASCII byte',13);out+=String.fromCharCode(n);}return out;}
  try{return new TextDecoder(name,{fatal}).decode(bytes);}catch{throw new VBError('Invalid '+name+' text bytes',13);}
}
export function httpText(bytes,contentType=''){
  if(bytes[0]===255&&bytes[1]===254)return decodeText(bytes,'utf-16le',{fatal:false});
  if(bytes[0]===254&&bytes[1]===255)return decodeText(bytes,'utf-16be',{fatal:false});
  const encoding=/charset\s*=\s*["']?([^\s;"']+)/i.exec(contentType)?.[1]||'utf-8';return decodeText(bytes,encoding,{fatal:false});
}

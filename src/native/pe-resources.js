/** PE resource directories: named entries precede integer IDs, all offsets in
 * directories are relative to the resource root, and only data RVAs relocate.
 * A caller supplies the required-resource closure; this writer never scans or
 * includes project assets on its own.
 */
const validId=value=>Number.isInteger(value)&&value>=0&&value<=65535||typeof value==='string'&&value.length>0&&value.length<=65535&&!value.includes('\0');
const order=(a,b)=>typeof a==='string'&&typeof b!=='string'?-1:typeof a!=='string'&&typeof b==='string'?1:a<b?-1:a>b?1:0;
export function writeNativeResources(section,entries){
 if(!Array.isArray(entries)||!entries.length||entries.length>65535)throw new TypeError('Invalid native resource entry count');
 const root=new Map();let total=0;
 for(const entry of entries){
  if(!validId(entry.type)||!validId(entry.name)||!Number.isInteger(entry.language??0)||(entry.language??0)<0||(entry.language??0)>65535)throw new TypeError('Invalid native resource identifier');
  if(!(entry.bytes instanceof Uint8Array))throw new TypeError('Native resource bytes must be a Uint8Array');
  total+=entry.bytes.length;if(total>40*1024*1024)throw new TypeError('Native resources exceed 40 MiB');
  let names=root.get(entry.type);if(!names)root.set(entry.type,names=new Map());let languages=names.get(entry.name);if(!languages)names.set(entry.name,languages=new Map());
  const language=entry.language??0;if(languages.has(language))throw new TypeError('Duplicate native resource identity');
  languages.set(language,{bytes:entry.bytes,codepage:entry.codepage??0});
 }
 const r=section,base=r.length,names=[],leaves=[];
 const patch=(at,value)=>{for(let i=0;i<4;i++)r.bytes[at+i]=(value>>>(8*i))&255;};
 const offset=()=>r.length-base;
 const directory=children=>{
  r.align(4);const at=offset(),items=[...children].sort(([a],[b])=>order(a,b)),n=items.filter(([id])=>typeof id==='string').length;
  r.zero(12).u16(n).u16(items.length-n);const slots=[];
  for(const [id,value]of items){const keyAt=r.length;r.u32(typeof id==='number'?id:0);if(typeof id==='string')names.push({at:keyAt,value:id});slots.push({at:r.length,value});r.u32(0);}
  for(const {at:slot,value}of slots){if(value instanceof Map)patch(slot,0x80000000+directory(value));else leaves.push({at:slot,value});}
  return at;
 };
 r.label('resource-root');directory(root);
 for(const name of names){r.align(2);patch(name.at,0x80000000+offset());r.u16(name.value.length);for(let i=0;i<name.value.length;i++)r.u16(name.value.charCodeAt(i));}
 for(const [i,leaf]of leaves.entries()){r.align(4);patch(leaf.at,offset());r.reference('resource-data:'+i,'rva').u32(leaf.value.bytes.length).u32(leaf.value.codepage).u32(0);}
 for(const [i,leaf]of leaves.entries()){r.align(4).label('resource-data:'+i);for(const byte of leaf.value.bytes)r.emit(byte);}
 return {label:'resource-root',size:r.length-base};
}

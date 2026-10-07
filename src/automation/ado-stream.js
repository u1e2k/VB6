import {VBError} from '../language/errors.js';
import {NOTHING} from '../runtime/values.js';
import {method,property,parameter as p,int,byteArray,vbBytes,componentAdapter} from './component.js';
import {HTTP_LIMIT} from './http-transport.js';
import {charset,bom,encodeText,decodeText} from './text-codec.js';
const streams=new WeakMap();
import {STREAM_CONSTANTS} from './constants.js';
export {STREAM_CONSTANTS};
export const STREAM_METADATA=Object.freeze({name:'ADODB.Stream',members:[
  property('Type','Long',true),property('Charset','String',true),property('Mode','Long',true),property('LineSeparator','Long',true),property('Position','Long',true),property('Size','Long'),property('State','Long'),property('EOS','Boolean'),
  method('Open',[p('Source','Variant',true),p('Mode','Long',true),p('OpenOptions','Long',true),p('UserName','String',true),p('Password','String',true)]),method('Close'),method('Cancel'),method('Flush'),method('SetEOS'),method('SkipLine'),
  method('Read',[p('NumBytes','Long',true)]),method('ReadText',[p('NumChars','Long',true)],'String'),method('Write',[p('Buffer')]),method('WriteText',[p('Data','String'),p('Options','Long',true)]),method('CopyTo',[p('DestStream'),p('NumChars','Long',true)]),method('LoadFromFile',[p('FileName','String')]),method('SaveToFile',[p('FileName','String'),p('SaveOptions','Long',true)])]});
export class AdoStream {
  constructor({fs,transport,initialBytes}={}){this.fs=fs;this.transport=transport;this.state=initialBytes?1:0;this.type=initialBytes?1:2;this.encoding='unicode';this.mode=0;this.source=null;this.separator=-1;this.position=0;this.bytes=initialBytes?.slice()||new Uint8Array();this.epoch=0;}
  guard(access){if(this.state!==1)throw new VBError('Stream is not open',3704);if(access&&!((this.mode||3)&access))throw new VBError('Stream access is not permitted',70);}
  get Type(){return this.type;}set Type(value){if(this.state===2||this.state&&this.position!==0)throw new VBError('Set Position to zero before changing Type',3219);value=int(value,1,2);this.type=value;}
  get Charset(){return this.encoding;}set Charset(value){if(this.state===2||this.state&&this.position!==0)throw new VBError('Set Position to zero before changing Charset',3219);charset(value);this.encoding=String(value);}
  get Mode(){return this.mode;}set Mode(value){if(this.state)throw new VBError('Stream is already open',3705);this.mode=int(value,0,3);}
  get LineSeparator(){return this.separator;}set LineSeparator(value){value=int(value,-1,13);if(![-1,10,13].includes(value))throw new VBError('Invalid line separator',5);this.separator=value;}
  get Position(){this.guard();return this.position;}set Position(value){this.guard();this.position=int(value,0,HTTP_LIMIT);}
  get Size(){this.guard();return this.bytes.length;}get State(){return this.state;}get EOS(){this.guard();return this.position>=this.bytes.length;}
  async Open(source,mode,options=-1,user='',password=''){
    if(this.state)throw new VBError('Stream is already open',3705);if(![-1,0].includes(Number(options)))throw new VBError('Record-bound and asynchronous Stream.Open require a native provider',3251);
    if(user||password)throw new VBError('Authenticated Stream.Open requires a host-provided transport; credentials are not inferred',3251);if(mode!==undefined)this.Mode=mode;
    this.bytes=new Uint8Array();this.position=0;this.source=null;
    if(source===undefined||source===NOTHING||source===''){this.state=1;return;}
    if(typeof source!=='string')throw new VBError('Only URL or virtual-file Stream sources are supported',3251);
    if(!/^https?:/i.test(source)){this.state=1;try{this.LoadFromFile(source);this.source={kind:'file',name:source};if(this.mode===0)this.mode=1;return;}catch(error){this.Close();throw error;}}
    if(this.mode&2)throw new VBError('Writable remote streams require a native provider',3251);if(this.mode===0)this.mode=1;this.source={kind:'http',name:source};
    if(!this.transport)throw new VBError('No HTTP transport is installed',429);const epoch=++this.epoch;this.controller=new AbortController();this.state=2;
    try{const {response,bytes}=await this.transport.request(source,{signal:this.controller.signal});if(epoch!==this.epoch)throw new VBError('Stream opening was cancelled',-2147467260);if(!response.ok)throw new VBError('HTTP Stream.Open failed ('+response.status+')',-2147217900);this.bytes=bytes;this.state=1;}catch(error){if(epoch===this.epoch)this.state=0;throw error;}
  }
  Close(){if(this.state===1)this.Flush();this.Cancel();this.state=0;this.position=0;this.bytes=new Uint8Array();this.source=null;}
  Cancel(){++this.epoch;this.controller?.abort();this.controller=null;if(this.state===2)this.state=0;}
  Flush(){this.guard();if(this.source?.kind==='file'&&(this.mode&2))this.fs.writeBytes(this.source.name,this.bytes);/* Unbound/read-only streams have no pending external write. */}
  SetEOS(){this.guard(2);this.resize(this.position);}
  resize(size){if(size>HTTP_LIMIT)throw new VBError('Stream exceeds 20 MiB',7);const next=new Uint8Array(size);next.set(this.bytes.subarray(0,size));this.bytes=next;}
  writeBytes(value){this.guard(2);const end=this.position+value.length;if(end>HTTP_LIMIT)throw new VBError('Stream exceeds 20 MiB',7);if(end>this.bytes.length)this.resize(end);this.bytes.set(value,this.position);this.position=end;}
  Read(count=-1){this.guard(1);if(this.type!==1)throw new VBError('Read requires a binary stream',3219);count=int(count,-1,HTTP_LIMIT);if(this.position>=this.bytes.length)return null;const end=count===-1?this.bytes.length:Math.min(this.bytes.length,this.position+count),value=vbBytes(this.bytes.slice(this.position,end));this.position=Math.max(this.position,end);return value;}
  Write(value){this.guard(2);if(this.type!==1)throw new VBError('Write requires a binary stream',3219);this.writeBytes(byteArray(value));}
  line(){return this.separator===-1?'\r\n':String.fromCharCode(this.separator);}
  textSlice(count=-1){
    this.guard(1);if(this.type!==2)throw new VBError('ReadText requires a text stream',3219);count=int(count,-2,HTTP_LIMIT);if(count===0)return {value:'',end:this.position};
    const encoding=charset(this.encoding),prefix=bom(encoding),start=this.position===0&&prefix.length&&prefix.every((b,i)=>this.bytes[i]===b)?prefix.length:this.position;
    let end=start,after=start;
    if(count===-1)end=after=this.bytes.length;
    else if(count===-2){
      const separator=encodeText(this.line(),encoding),step=encoding.startsWith('utf-16')?2:1;
      for(end=start;end<this.bytes.length;end+=step){if(separator.every((byte,i)=>this.bytes[end+i]===byte))break;}
      end=Math.min(end,this.bytes.length);after=Math.min(this.bytes.length,end+separator.length);
    }else if(encoding==='utf-8'){
      for(let i=0;i<count&&end<this.bytes.length;i++){
        const first=this.bytes[end],size=first<128?1:first>=194&&first<=223?2:first>=224&&first<=239?3:first>=240&&first<=244?4:0;
        if(!size||end+size>this.bytes.length)throw new VBError('Invalid UTF-8 character boundary',13);end+=size;
      }
      after=end;
    }else end=after=Math.min(this.bytes.length,start+count*(encoding.startsWith('utf-16')?2:1));
    const value=decodeText(this.bytes.subarray(start,end),encoding,{ignoreBOM:true,preserveCodeUnits:true});
    return {value,end:Math.max(this.position,after)};
  }
  ReadText(count=-1){const result=this.textSlice(count);this.position=result.end;return result.value;}
  SkipLine(){this.ReadText(-2);}
  WriteText(value,options=0){
    this.guard(2);if(this.type!==2)throw new VBError('WriteText requires a text stream',3219);options=int(options,0,1);if(typeof value!=='string')throw new VBError('Expected text',13);
    const encoding=charset(this.encoding),prefix=bom(encoding),bytes=encodeText(value+(options?this.line():''),encoding);
    const start=this.position===0?prefix.length:this.position;if(start+bytes.length>HTTP_LIMIT)throw new VBError('Stream exceeds 20 MiB',7);
    if(this.position===0&&prefix.length)this.writeBytes(prefix);this.writeBytes(bytes);
  }
  CopyTo(destination,count=-1){
    this.guard(1);const target=streams.get(destination)||destination;if(!(target instanceof AdoStream)||target===this)throw new VBError('Expected a different ADODB.Stream from this provider',13);target.guard(2);count=int(count,-1,HTTP_LIMIT);
    if(count===0)return;const position=this.position,targetPosition=target.position,targetBytes=target.bytes.slice();
    try{if(this.type===1){if(target.type!==1)throw new VBError('Cannot copy binary data to a text stream',3219);const end=count===-1?this.bytes.length:Math.min(this.bytes.length,this.position+count);if(end>this.position){target.Write(this.bytes.slice(this.position,end));this.position=end;}}else{const result=this.textSlice(count);if(target.type===2)target.WriteText(result.value);else target.writeBytes(this.bytes.slice(this.position,result.end));this.position=result.end;}}
    catch(error){this.position=position;target.position=targetPosition;target.bytes=targetBytes;throw error;}
  }
  LoadFromFile(name){this.guard();if(!this.fs)throw new VBError('No virtual filesystem is installed',429);const bytes=this.fs.readBytes(String(name));if(bytes.length>HTTP_LIMIT)throw new VBError('Stream exceeds 20 MiB',7);this.bytes=bytes.slice();this.position=0;}
  SaveToFile(name,options=1){this.guard();if(!this.fs)throw new VBError('No virtual filesystem is installed',429);options=int(options,1,2);name=String(name);if(options===1&&this.fs.exists(name))throw new VBError('File already exists',58);this.fs.writeBytes(name,this.bytes);this.position=0;}
  dispose(){this.Close();}
}
export function streamAdapter(session,options){const stream=new AdoStream(options),adapter=componentAdapter(stream,STREAM_METADATA);try{const proxy=session.adopt(adapter);streams.set(proxy,stream);return {adapter,proxy,stream};}catch(error){adapter.release();throw error;}}

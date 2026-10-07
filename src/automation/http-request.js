/** Fetch-backed MSXML/WinHTTP Automation. Synchronous VB calls await I/O without
 * blocking the browser thread. Native proxy/TLS/OS authentication is not emulated. */
import {VBError} from '../language/errors.js';
import {NOTHING} from '../runtime/values.js';
import {method,property,parameter as p,int,byteArray,vbBytes,componentAdapter} from './component.js';
import {httpURL,httpHeader,aborted} from './http-transport.js';
import {httpText} from './text-codec.js';
import {streamAdapter} from './ado-stream.js';
const pendingError=()=>new VBError('The HTTP response is not available yet',-2147483638,'VB6.HTTP');
const unsupported=name=>{throw new VBError(name+' requires a separately granted native HTTP provider',3251,'VB6.HTTP');};
const methods=[method('open',[p('method','String'),p('url','String'),p('async','Boolean',true),p('user','String',true),p('password','String',true)]),method('send',[p('body','Variant',true)]),method('abort'),method('setRequestHeader',[p('header','String'),p('value','String')]),method('getResponseHeader',[p('header','String')],'String'),method('getAllResponseHeaders',[],'String')];
const responses=[property('status','Long'),property('statusText','String'),property('responseText','String'),property('responseBody'),property('responseStream','Object')];
export function httpMetadata(kind='server'){
  const server=kind!=='xml',members=[...methods,...responses];
  if(kind!=='winhttp')members.push(property('readyState','Long'),property('responseXML','Object'),property('onreadystatechange','Variant',true));
  if(server)members.push(method('setTimeouts',['resolveTimeout','connectTimeout','sendTimeout','receiveTimeout'].map(n=>p(n,'Long'))),method('waitForResponse',[p('timeoutInSeconds','Double',true)],'Boolean'),method('setProxy',[p('proxySetting','Long'),p('proxyServer','String',true),p('bypassList','String',true)]));
  if(kind==='server')members.push(method('getOption',[p('option','Long')]),method('setOption',[p('option','Long'),p('value')]),method('setProxyCredentials',[p('user','String'),p('password','String')]));
  if(kind==='winhttp')members.push(method('setCredentials',[p('user','String'),p('password','String'),p('flags','Long')]),method('setClientCertificate',[p('certificate','String')]),method('setAutoLogonPolicy',[p('policy','Long')]));
  const events=kind==='winhttp'?[{name:'OnResponseStart',params:[p('Status','Long'),p('ContentType','String')]},{name:'OnResponseDataAvailable',params:[p('Data')]},{name:'OnResponseFinished',params:[]},{name:'OnError',params:[p('ErrorNumber','Long'),p('ErrorDescription','String')]}]:[{name:'onreadystatechange',params:[]}];
  return Object.freeze({members:Object.freeze(members),events:Object.freeze(events)});
}
export class HttpRequest {
  constructor({transport,session,fs,kind='server',parseXML}={}){
    if(!transport?.request)throw new TypeError('An HTTP transport is required');
    this.transport=transport;this.session=session;this.fs=fs;this.kind=kind;this.parseXML=parseXML;
    this.epoch=0;this.disposed=false;this.state=0;this.listeners=new Set();this.eventErrors=[];this.timeouts=[0,60000,30000,30000];this.callback=null;
    this.reset();
  }
  alive(){if(this.disposed)throw new VBError('HTTP object has been released',91);}
  reset(){this.response=null;this.bytes=new Uint8Array();this.parts=[];this.stream=null;this.xml=null;this.failure=null;this.sent=false;this.pending=null;this.headers=new Headers();}
  get readyState(){this.alive();return this.state;}
  get status(){this.requireResponse(2);return this.response.status;}
  get statusText(){this.requireResponse(2);return this.response.statusText||'';}
  requireResponse(state=4){this.alive();if(this.failure)throw this.failure;if(this.state<state||!this.response)throw pendingError();}
  get responseText(){this.requireResponse(this.kind==='winhttp'?4:3);return httpText(this.currentBytes(),this.response.headers?.get('content-type')||'');}
  currentBytes(){if(this.state===4)return this.bytes;const size=this.parts.reduce((n,b)=>n+b.length,0),bytes=new Uint8Array(size);let at=0;for(const b of this.parts){bytes.set(b,at);at+=b.length;}return bytes;}
  get responseBody(){this.requireResponse();return vbBytes(this.bytes);}
  get responseStream(){this.requireResponse();if(!this.session)throw new VBError('A session is required for responseStream',429);return this.stream??=streamAdapter(this.session,{initialBytes:this.bytes,fs:this.fs,transport:this.transport}).proxy;}
  get responseXML(){this.requireResponse();if(!this.parseXML)unsupported('XML DOM parsing');return this.xml??=this.parseXML(this.responseText);}
  get onreadystatechange(){return this.callback||NOTHING;}
  set onreadystatechange(value){if(value!==NOTHING&&value!==null&&typeof value!=='function')throw new VBError('Use WithEvents or a host callback for onreadystatechange',13);this.callback=value===NOTHING?null:value;}
  subscribe(listener){this.alive();if(typeof listener!=='function'||this.listeners.size>=256)throw new TypeError('Invalid or excessive HTTP event listener');this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  async emit(name,args=[],reentrant=false){
    const tasks=[];for(const listener of [...this.listeners])if(this.listeners.has(listener))tasks.push(Promise.resolve().then(()=>listener(name,args,{reentrant})));
    if(name==='onreadystatechange'&&this.callback)tasks.push(Promise.resolve().then(()=>this.callback()));
    const report=Promise.allSettled(tasks).then(results=>{for(const r of results)if(r.status==='rejected'){if(this.eventErrors.length===16)this.eventErrors.shift();this.eventErrors.push(r.reason);}});
    if(reentrant)await report;else report.catch(()=>{});
  }
  async transition(state,epoch){if(this.disposed||epoch!==this.epoch)return;this.state=state;if(this.kind!=='winhttp')await this.emit('onreadystatechange',[],!this.async);}
  async open(method,url,async=this.kind==='xml',user='',password=''){
    this.alive();method=String(method).toUpperCase();
    if(!['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(method))throw new VBError('Unsupported HTTP method',5);
    const endpoint=httpURL(url);if(user||password)unsupported('HTTP challenge authentication');
    this.abort();this.reset();this.method=method;this.url=endpoint.href;this.async=!!async;await this.transition(1,this.epoch);
  }
  setRequestHeader(name,value){this.alive();if(this.state!==1||this.sent)throw new VBError('Set headers after open and before send',5);const [key,text]=httpHeader(name,value);this.headers.append(key,text);}
  getResponseHeader(name){this.requireResponse(2);if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name))throw new VBError('Invalid HTTP header name',5);if(/^set-cookie2?$/i.test(name))return '';return this.response.headers?.get(name)||'';}
  getAllResponseHeaders(){this.requireResponse(2);let result='';for(const [name,value]of this.response.headers||[])if(!/^set-cookie2?$/i.test(name))result+=name+': '+value+'\r\n';return result;}
  setTimeouts(...values){this.alive();if(values.length!==4)throw new VBError('Four timeout values are required',450);this.timeouts=values.map(value=>int(value,0,600000));}
  send(body){
    this.alive();if(this.state!==1||this.sent)throw new VBError('Call open before each send',5);
    if(body===NOTHING||body===null)body=undefined;
    if(body!==undefined&&typeof body!=='string')body=byteArray(body);
    if(body!==undefined&&['GET','HEAD'].includes(this.method))throw new VBError('GET and HEAD cannot carry a request body',5);
    this.sent=true;this.controller=new AbortController();const epoch=this.epoch,controller=this.controller;
    const work=this.perform(body,epoch,controller);this.pending=work;work.catch(()=>{});return this.async?undefined:work;
  }
  async perform(body,epoch,controller){
    const current=()=>!this.disposed&&epoch===this.epoch;
    const [resolve,connect,send,receive]=this.timeouts;
    try{
      const result=await this.transport.request(this.url,{method:this.method,headers:this.headers,body,signal:controller.signal,timeout:0,headersTimeout:Math.min(600000,resolve+connect+send),receiveTimeout:receive,timeoutError:new VBError('The HTTP request timed out',-2147012894,'VB6.HTTP'),
        onHeaders:async response=>{if(!current())throw aborted();this.response=response;await this.transition(2,epoch);if(this.kind==='winhttp')await this.emit('OnResponseStart',[response.status,response.headers?.get('content-type')||''],!this.async);},
        onChunk:async bytes=>{if(!current())throw aborted();this.parts.push(bytes.slice());await this.transition(3,epoch);if(this.kind==='winhttp')await this.emit('OnResponseDataAvailable',[vbBytes(bytes)],!this.async);}});
      if(!current())throw aborted();this.bytes=result.bytes;this.parts=[];await this.transition(4,epoch);if(this.kind==='winhttp')await this.emit('OnResponseFinished',[],!this.async);
    }catch(error){
      if(current()){this.failure=error;this.parts=[];this.bytes=new Uint8Array();await this.transition(4,epoch);if(this.kind==='winhttp')await this.emit('OnError',[error.number||-2147467259,error.message],!this.async);}
      throw error;
    }finally{if(current())this.controller=null;}
  }
  async waitForResponse(seconds=-1){
    this.alive();seconds=Number(seconds);if(!Number.isFinite(seconds)||seconds< -1||seconds>600)throw new VBError('Wait timeout must be -1 or 0–600 seconds',5);
    if(!this.pending)throw new VBError('No HTTP send is pending',5);if(this.failure)throw this.failure;if(this.state===4)return true;
    if(seconds===-1){await this.pending;return true;}if(seconds===0)return false;
    let timer;try{return await Promise.race([this.pending.then(()=>true),new Promise(resolve=>timer=setTimeout(()=>resolve(false),seconds*1000))]);}finally{clearTimeout(timer);}
  }
  abort(){this.alive();++this.epoch;this.controller?.abort();this.controller=null;this.state=0;this.reset();}
  getOption(option){this.alive();if(Number(option)===-1)return this.url||'';unsupported('ServerXMLHTTP option '+option);}
  setOption(){unsupported('ServerXMLHTTP option');}setProxy(){unsupported('Proxy configuration');}setProxyCredentials(){unsupported('Proxy authentication');}
  setCredentials(){unsupported('HTTP challenge authentication');}setClientCertificate(){unsupported('Client certificates');}setAutoLogonPolicy(){unsupported('Operating-system logon policy');}
  dispose(){if(this.disposed)return;this.abort();this.listeners.clear();this.callback=null;this.disposed=true;}
}
export function httpRequestAdapter(session,options){const object=new HttpRequest({...options,session});return componentAdapter(object,httpMetadata(options.kind));}

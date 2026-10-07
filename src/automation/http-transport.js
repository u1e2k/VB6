/** Shared bounded transport for COM-shaped HTTP and DataContext providers.
 * Browser CORS/CSP apply. No proxy, ambient cookies, automatic retry or redirect. */
import {VBError} from '../language/errors.js';
export const HTTP_LIMIT=20*1024*1024;
export function httpURL(value,base){
  if(typeof value!=='string'||!value.trim()||value.length>32768)throw new VBError('Invalid HTTP data-source URL',3001);
  let url;try{url=new URL(value,base);}catch{throw new VBError('Invalid HTTP data-source URL',3001);}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new VBError('Only HTTP(S) URLs without embedded credentials are supported',70);
  url.hash='';return url;
}
export function httpHeader(name,value){
  name=String(name);value=String(value);
  if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)||/[\r\n\0]/.test(value)||value.length>32768)throw new VBError('Invalid HTTP header',5);
  if(/^(?:accept-charset|accept-encoding|connection|content-length|cookie2?|date|dnt|expect|host|keep-alive|origin|referer|te|trailer|transfer-encoding|upgrade|via|proxy-.*|sec-.*)$/i.test(name))throw new VBError('This HTTP header is controlled by the browser: '+name,70);
  return [name,value];
}
export function aborted(signal){if(signal?.reason instanceof VBError)return signal.reason;return new VBError('HTTP request was cancelled or timed out',-2147467260,'VB6.HTTP');}
export function abortable(work,signal){
  if(!signal)return Promise.resolve(work);
  if(signal.aborted){Promise.resolve(work).catch(()=>{});return Promise.reject(aborted(signal));}
  return new Promise((resolve,reject)=>{const cancel=()=>{cleanup();reject(aborted(signal));},cleanup=()=>signal.removeEventListener('abort',cancel);signal.addEventListener('abort',cancel,{once:true});Promise.resolve(work).then(v=>{cleanup();resolve(v);},e=>{cleanup();reject(e);});});
}
export async function responseBytes(response,limit=HTTP_LIMIT,signal,onChunk){
  const length=Number(response.headers?.get('content-length')||0);
  if(Number.isFinite(length)&&length>limit){await response.body?.cancel?.().catch(()=>{});throw new VBError('HTTP response exceeds the data limit',7);}
  if(!response.body?.getReader){const bytes=response.arrayBuffer?new Uint8Array(await abortable(response.arrayBuffer(),signal)):new TextEncoder().encode(await abortable(response.text(),signal));if(bytes.length>limit)throw new VBError('HTTP response exceeds the data limit',7);return bytes;}
  const reader=response.body.getReader(),parts=[];let size=0;
  try{for(;;){const {done,value}=await abortable(reader.read(),signal);if(done)break;if(!(value instanceof Uint8Array))throw new VBError('Invalid response byte stream',13);size+=value.length;if(size>limit)throw new VBError('HTTP response exceeds the data limit',7);parts.push(value.slice());if(onChunk)await abortable(onChunk(value,size),signal);} }
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}
export class HttpTransport {
  constructor({fetch=globalThis.fetch?.bind(globalThis),authorize}={}){this.fetch=fetch;this.authorize=authorize;this.pending=new Set();this.closed=false;}
  async request(value,{method='GET',headers={},body,timeout=30000,signal,limit=HTTP_LIMIT,onHeaders,onChunk,headersTimeout=0,receiveTimeout=0,timeoutError}={}){
    if(this.closed)throw new VBError('HTTP transport is closed',91);
    const url=httpURL(value);method=String(method).toUpperCase();
    if(!['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(method))throw new VBError('Unsupported HTTP method',5);
    if(!Number.isInteger(limit)||limit<0||limit>HTTP_LIMIT||!Number.isFinite(timeout)||timeout<0||timeout>600000)throw new VBError('Invalid HTTP resource limit',5);
    if(body!==undefined&&body!==null){if(!(body instanceof Uint8Array)&&typeof body!=='string')throw new VBError('HTTP body must be text or bytes',13);if((typeof body==='string'?new TextEncoder().encode(body).length:body.length)>limit)throw new VBError('HTTP request exceeds the data limit',7);if(['GET','HEAD'].includes(method))throw new VBError('GET and HEAD requests cannot carry a body',5);}
    const checked=new Headers();try{for(const [name,text]of new Headers(headers))checked.append(...httpHeader(name,text));}catch(error){if(error instanceof VBError)throw error;throw new VBError('Invalid HTTP headers',5);}
    if([headersTimeout,receiveTimeout].some(n=>!Number.isFinite(n)||n<0||n>600000))throw new VBError('Invalid HTTP phase timeout',5);
    if(typeof this.fetch!=='function')throw new VBError('No HTTP transport is installed',429);
    const controller=new AbortController(),cancel=()=>controller.abort();this.pending.add(controller);signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
    const expire=()=>controller.abort(timeoutError),timer=timeout?setTimeout(expire,timeout):null;let phaseTimer=headersTimeout?setTimeout(expire,headersTimeout):null,response;
    const receive=()=>{clearTimeout(phaseTimer);phaseTimer=receiveTimeout?setTimeout(expire,receiveTimeout):null;};
    try{
      if(controller.signal.aborted)throw aborted(controller.signal);
      if(this.authorize&&await abortable(this.authorize(Object.freeze({url:url.href,method})),controller.signal)===false)throw new VBError('HTTP request denied by host policy',70);
      if(controller.signal.aborted)throw aborted(controller.signal);
      const work=Promise.resolve(this.fetch(url.href,{method,headers:checked,body:body==null?undefined:body,signal:controller.signal,redirect:'error',credentials:'omit',cache:'no-store'}));
      work.then(response=>{if(controller.signal.aborted)response.body?.cancel?.().catch(()=>{});},()=>{});
      response=await abortable(work,controller.signal);
      if(response.type==='opaque'||response.type==='opaqueredirect'||response.redirected)throw new VBError('Opaque or redirected HTTP responses are not accepted',70);
      receive();if(onHeaders)await abortable(onHeaders(response),controller.signal);
      const bytes=await responseBytes(response,limit,controller.signal,async(...args)=>{receive();if(onChunk)await onChunk(...args);});
      if(controller.signal.aborted||this.closed)throw aborted(controller.signal);return {response,bytes,url:url.href};
    }catch(error){if(response?.body&&!response.body.locked)await response.body.cancel().catch(()=>{});if(error instanceof VBError)throw error;if(controller.signal.aborted)throw aborted(controller.signal);throw new VBError('HTTP request failed. Check the connection, CORS/CSP policy and credentials.',-2147467259,'VB6.HTTP');}
    finally{clearTimeout(phaseTimer);if(timer)clearTimeout(timer);signal?.removeEventListener('abort',cancel);this.pending.delete(controller);}
  }
  cancel(){for(const pending of this.pending)pending.abort();}
  close(){this.closed=true;this.cancel();}
}

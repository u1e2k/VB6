import {UIError, boundedData, safeUrl} from './safety.js';
import {DOMRenderer} from './renderer.js';
import {UIClient} from './client.js';

export function normalizeAction(action){
  const clean=boundedData(action,32000);if(!Array.isArray(clean.args))throw new UIError('action','Invalid UI action arguments.');
  const first=clean.args[0];
  if(['message','copy','link','entity'].includes(clean.type)){if(typeof first!=='string'||!first.trim()||first.length>16000)throw new UIError('action','Action text must contain 1–16,000 characters.');if(clean.type==='link')clean.args[0]=safeUrl(first);}
  else if(clean.type==='tool'){if(typeof first!=='string'||!/^[A-Za-z0-9_.-]{1,128}$/.test(first)||!clean.args[1]||typeof clean.args[1]!=='object'||Array.isArray(clean.args[1]))throw new UIError('action','A tool action needs an exact name and argument object.');}
  else if(clean.type!=='context')throw new UIError('action','Unsupported UI action.');
  return clean;
}
export class UISurface {
  constructor(root,{workerSource='',onAction=()=>{throw new UIError('action_denied','The host has not enabled this action.');},onUpdate=()=>{},snapshot,catalog,factories={},allowResource}={}){
    this.root=root;this.doc=root.ownerDocument;this.options={workerSource,onAction,onUpdate,catalog,factories,allowResource};this.client=new UIClient({workerSource,window:this.doc.defaultView,snapshot,catalog});this.version=0;this.generation=0;this.eventQueue=Promise.resolve();
    const make=(tag,cls,text)=>{const n=this.doc.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;};
    this.toolbar=make('div','iui-surface-toolbar');this.status=make('span','iui-status');this.status.setAttribute('role','status');this.sourceButton=make('button','','Source');this.sourceButton.type='button';this.sourceButton.onclick=()=>{this.source.hidden=!this.source.hidden;this.sourceButton.setAttribute('aria-expanded',String(!this.source.hidden));};this.fallbackButton=make('button','','Text fallback');this.fallbackButton.type='button';this.fallbackButton.onclick=()=>{this.fallback.hidden=!this.fallback.hidden;this.fallbackButton.setAttribute('aria-expanded',String(!this.fallback.hidden));};
    this.restartButton=make('button','','Restart view');this.restartButton.type='button';this.restartButton.onclick=()=>this.restart();this.toolbar.append(this.status,this.sourceButton,this.fallbackButton,this.restartButton);
    this.viewport=make('div','iui-viewport');this.source=make('pre','iui-surface-source');this.source.hidden=true;this.source.tabIndex=0;this.source.setAttribute('aria-label','Intelligent UI source');this.fallback=make('pre','iui-fallback');this.fallback.hidden=true;this.fallback.tabIndex=0;this.diagnostics=make('details','iui-diagnostics');this.diagnosticTitle=make('summary','','Diagnostics');this.diagnosticText=make('pre','');this.diagnostics.append(this.diagnosticTitle,this.diagnosticText);this.diagnostics.hidden=true;root.append(this.toolbar,this.viewport,this.source,this.fallback,this.diagnostics);
    this.makeRenderer();
  }
  makeRenderer(){this.renderer=new DOMRenderer(this.viewport,{factories:this.options.factories,allowResource:this.options.allowResource,onError:e=>this.error(e),onEvent:(id,args)=>this.event(id,args),onAction:action=>this.action(action)});}
  action(action){if(this.disposed)throw new UIError('disposed','UI surface is disposed.');return this.options.onAction(normalizeAction(action),this);}
  update(source,options={}){
    if(this.disposed)return Promise.reject(new UIError('disposed','UI surface is disposed.'));this.latest={source,options};this.source.textContent=source;
    if(this.pending){this.pending.source=source;this.pending.options=options;}else {const job={source,options};job.promise=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});this.pending=job;}
    // All superseded partial updates share one completion; no per-chunk waiter growth.
    const promise=this.pending.promise;if(!options.partial){clearTimeout(this.timer);this.timer=null;this.flush();}else if(!this.timer&&!this.inflight)this.timer=setTimeout(()=>{this.timer=null;this.flush();},80);return promise;
  }
  async flush(){
    if(this.disposed||this.inflight||!this.pending)return;const job=this.pending;this.pending=null;this.inflight=true;
    try{const result=await this.client.request('update',{source:job.source,options:job.options});if(this.disposed)throw new UIError('disposed','UI surface is disposed.');this.generation++;this.apply(result);job.resolve(result);}
    catch(error){this.error(error);job.reject(error);}
    finally{this.inflight=false;if(this.pending&&!this.disposed)this.flush();}
  }
  apply(result){this.renderer.apply(result.operations);this.version=result.version;this.result=result;this.fallback.textContent=result.fallbackMarkdown||this.viewport.textContent;const diagnostics=[...result.diagnostics,...result.recoveryDiagnostics];this.diagnosticTitle.textContent=diagnostics.length+' diagnostics';this.diagnosticText.textContent=diagnostics.map(d=>d.code+': '+d.message).join('\n');this.diagnostics.hidden=!diagnostics.length;this.status.textContent=(this.latest?.options.partial?'Streaming':'Interactive')+' · '+this.client.backend;try{this.options.onUpdate(result,this);}catch{/* Observers do not roll back successful renders. */}}
  event(id,args){const generation=this.generation;const action=this.eventQueue.then(async()=>{if(this.disposed||generation!==this.generation)throw new UIError('stale_event','UI changed before this interaction.');const result=await this.client.request('event',{id,args,version:this.version});if(this.disposed)return;this.apply(result);for(const action of result.actions)await this.action(action);return result;});this.eventQueue=action.catch(error=>this.error(error));return action;}
  error(error){if(!this.disposed)this.status.textContent=error.message+' Last valid UI retained.';}
  snapshot(){return this.client.snapshot();}
  restart(){if(this.disposed)return;this.client.dispose();this.renderer.dispose();this.client=new UIClient({workerSource:this.options.workerSource,window:this.doc.defaultView,catalog:this.options.catalog});this.makeRenderer();this.generation++;this.version=0;if(this.latest)void this.update(this.latest.source,this.latest.options).catch(e=>this.error(e));}
  dispose(){if(this.disposed)return;this.disposed=true;clearTimeout(this.timer);this.client.dispose();this.renderer.dispose();this.pending?.reject(new UIError('disposed','UI surface is disposed.'));this.pending=null;this.root.replaceChildren();}
}

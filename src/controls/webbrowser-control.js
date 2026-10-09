import {BrowserControl} from './controls.js';
import {ControlAdapterRegistry} from './adapters.js';
import {WebBrowserController} from './webbrowser.js';
import {WEB_BROWSER_ALIASES,WEB_BROWSER_DEFAULTS,WEB_BROWSER_EVENTS,WEB_BROWSER_READONLY,WebBrowserError} from './webbrowser-contract.js';

const booleans = new Set('Silent Offline RegisterAsBrowser RegisterAsDropTarget AddressBar MenuBar StatusBar ToolBar FullScreen TheaterMode Resizable'.split(' '));
export const WEB_BROWSER_METADATA = Object.freeze({
  displayName:'Microsoft Web Browser — HTML5', baseName:'WebBrowser', defaultEvent:'DocumentComplete',
  description:'SHDocVw-compatible source control using an isolated modern HTML document. No Internet Explorer or native ActiveX is loaded.',
  properties:[...Object.entries(WEB_BROWSER_DEFAULTS).map(([name,value])=>({name,default:booleans.has(name)?!!value:value})),
    ...WEB_BROWSER_READONLY.map(name=>({name,readOnly:true})),{name:'NavigationStatus',readOnly:true}],
  events:WEB_BROWSER_EVENTS
});

/** The standard adapter path keeps native widgets, layout, designer selection,
 * control arrays and host disposal intact. No monkey-patching BrowserControl.
 */
export class WebBrowserControl extends BrowserControl {
  build(){this.browserWaiters=new Set();this.webBrowser=new WebBrowserController(this);}
  get(name){return this.webBrowser?.handles(name)?this.webBrowser.get(name):super.get(name);}
  set(name,value,fromDOM=false){if(this.webBrowser?.handles(name))return this.webBrowser.set(name,value);return super.set(name,value,fromDOM);}
  refresh(){super.refresh();this.webBrowser?.refresh();}
  event(name,args=[],coalesce=false,current=()=>true){
    const vm=this.vm,instance=this.instance,valid=()=>!this.design&&!this.disposed&&!this.webBrowser?.closed&&current();
    if(!vm||!valid())return Promise.resolve();
    const proc=instance?.module?.procedures.get((this.model.name+'_'+name).toLowerCase());
    if(!proc)return Promise.resolve();
    const values=this.props.Index!==undefined?[Number(this.props.Index),...args]:args;
    const enqueue=()=>vm.enqueueInput(instance,this.model.id+':webbrowser:'+name,()=>vm.callProcedure(instance,proc,values),{coalesce,valid});
    // enqueueInput intentionally rejects paused input. Browser completion is not
    // disposable pointer input: retain it until Resume, checking navigation
    // identity again before it enters the ordinary debugger-aware VM queue.
    if(vm.state!=='paused')return enqueue();
    if(this.browserWaiters.size>=128)return Promise.reject(new WebBrowserError('Paused browser event limit',7));
    return new Promise((resolve,reject)=>{
      let unsubscribe;const finish=()=>{unsubscribe?.();this.browserWaiters.delete(cancel);};
      const cancel=()=>{finish();resolve();};this.browserWaiters.add(cancel);
      unsubscribe=vm.on('state',()=>{if(vm.state==='paused')return;finish();if(valid()&&['running','idle'].includes(vm.state))enqueue().then(resolve,reject);else resolve();});
    });
  }
  dispose(){this.webBrowser?.dispose();for(const cancel of this.browserWaiters||[])cancel();this.browserWaiters?.clear();super.dispose();}
}

/** Add only missing registrations; preserve explicit trusted host overrides.
 * Aliases work in runtime Controls.Add but only one item appears in the toolbox.
 * Imported FRM aliases are normalized to WebBrowser with originalType retained.
 */
export function registerWebBrowserControls(registry=new ControlAdapterRegistry()){
  for(const type of WEB_BROWSER_ALIASES)if(!registry.has(type))registry.register(type,{
    runtime:(model,options)=>new WebBrowserControl(model,options),
    ...(type==='WebBrowser'?{designer:(model,options)=>new WebBrowserControl(model,{...options,design:true})}:{}),
    metadata:WEB_BROWSER_METADATA
  });
  return registry;
}

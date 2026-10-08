/** MSXML-shaped access to a standards XML DOM, through opaque Automation proxies.
 * No HTML insertion, DTD resolution, stylesheet execution, host paths or native activation. */
import {VBError} from '../language/errors.js';
import {NOTHING,coerce,tagScalar,unbox,VBArray} from '../runtime/values.js';
import {method,property,parameter as p,int,byteArray,vbBytes,componentAdapter} from './component.js';
import {httpText} from './text-codec.js';
const XML_LIMIT=4*1024*1024,DT='urn:schemas-microsoft-com:datatypes';
const nodes=new WeakMap();
const typeNames=['','element','attribute','text','cdatasection','entityreference','entity','processinginstruction','comment','document','documenttype','documentfragment','notation'];
const fail=(message,number=5)=>{throw new VBError(message,number,'VB6.XML');};
const nodeMethods=[method('hasChildNodes',[],'Boolean'),method('cloneNode',[p('deep','Boolean')],'MSXML2.IXMLDOMNode'),method('appendChild',[p('newChild')],'MSXML2.IXMLDOMNode'),method('removeChild',[p('childNode')],'MSXML2.IXMLDOMNode'),method('replaceChild',[p('newChild'),p('oldChild')],'MSXML2.IXMLDOMNode'),method('insertBefore',[p('newChild'),p('refChild','Variant',true)],'MSXML2.IXMLDOMNode'),method('selectSingleNode',[p('queryString','String')],'MSXML2.IXMLDOMNode'),method('selectNodes',[p('queryString','String')],'MSXML2.IXMLDOMNodeList')];
const nodeMembers=[...['nodeName','nodeTypeString','namespaceURI','prefix','baseName','xml'].map(n=>property(n,'String')),property('nodeType','Long'),property('nodeValue','Variant',true),property('text','String',true),property('nodeTypedValue','Variant',true),property('dataType','Variant',true),...['parentNode','firstChild','lastChild','previousSibling','nextSibling','ownerDocument'].map(n=>property(n,'MSXML2.IXMLDOMNode')),property('childNodes','MSXML2.IXMLDOMNodeList'),property('attributes','MSXML2.IXMLDOMNamedNodeMap'),...nodeMethods];
const elementMembers=[property('tagName','String'),method('getAttribute',[p('name','String')]),method('setAttribute',[p('name','String'),p('value')]),method('removeAttribute',[p('name','String')]),method('getAttributeNode',[p('name','String')],'MSXML2.IXMLDOMNode'),method('setAttributeNode',[p('attribute')],'MSXML2.IXMLDOMNode'),method('removeAttributeNode',[p('attribute')],'MSXML2.IXMLDOMNode'),method('getElementsByTagName',[p('tagName','String')],'MSXML2.IXMLDOMNodeList')];
export const XML_NODE_METADATA=Object.freeze({members:nodeMembers});
export const XML_ELEMENT_METADATA=Object.freeze({members:[...nodeMembers,...elementMembers]});
export const XML_LIST_METADATA=Object.freeze({defaultMember:'item',members:[property('length','Long'),method('item',[p('index','Long')],'MSXML2.IXMLDOMNode'),method('nextNode',[],'MSXML2.IXMLDOMNode'),method('reset')]});
export const XML_ATTRIBUTES_METADATA=Object.freeze({defaultMember:'item',members:[...XML_LIST_METADATA.members,method('getNamedItem',[p('name','String')],'MSXML2.IXMLDOMNode'),method('setNamedItem',[p('newItem')],'MSXML2.IXMLDOMNode'),method('removeNamedItem',[p('name','String')],'MSXML2.IXMLDOMNode'),method('getQualifiedItem',[p('baseName','String'),p('namespaceURI','String')],'MSXML2.IXMLDOMNode'),method('removeQualifiedItem',[p('baseName','String'),p('namespaceURI','String')],'MSXML2.IXMLDOMNode')]});
export const XML_ERROR_METADATA=Object.freeze({members:[...['errorCode','line','linepos','filepos'].map(n=>property(n,'Long')),...['reason','srcText','url'].map(n=>property(n,'String'))]});
export const XML_DOCUMENT_METADATA=Object.freeze({members:[...nodeMembers,{...property('documentElement','MSXML2.IXMLDOMNode'),modes:[2,8]},property('parseError','MSXML2.IXMLDOMParseError'),property('readyState','Long'),property('url','String'),...['async','preserveWhiteSpace','validateOnParse','resolveExternals'].map(n=>property(n,'Boolean',true)),method('loadXML',[p('xml','String')],'Boolean'),method('load',[p('source')],'Boolean'),method('save',[p('destination','String')]),method('abort'),method('setProperty',[p('name','String'),p('value')]),method('getProperty',[p('name','String')]),method('getElementsByTagName',[p('tagName','String')],'MSXML2.IXMLDOMNodeList'),method('createNode',[p('type'),p('name','String'),p('namespaceURI','String')],'MSXML2.IXMLDOMNode'),method('createElement',[p('tagName','String')],'MSXML2.IXMLDOMNode'),method('createAttribute',[p('name','String')],'MSXML2.IXMLDOMNode'),...['TextNode','Comment','CDATASection'].map(n=>method('create'+n,[p('data','String')],'MSXML2.IXMLDOMNode')),method('createDocumentFragment',[],'MSXML2.IXMLDOMNode'),method('createProcessingInstruction',[p('target','String'),p('data','String')],'MSXML2.IXMLDOMNode')],events:[{name:'onreadystatechange',params:[]}]});
export const COMMON_XML_CLASSES=Object.freeze(['MSXML2.DOMDocument','MSXML2.DOMDocument.3.0','MSXML2.DOMDocument.6.0','MSXML2.DOMDocument60','MSXML2.FreeThreadedDOMDocument','MSXML2.FreeThreadedDOMDocument.3.0','MSXML2.FreeThreadedDOMDocument.6.0','MSXML2.FreeThreadedDOMDocument60','Microsoft.XMLDOM']);
export function xmlObjectText(value){const item=nodes.get(value);if(!item)return null;item.state.alive();return new item.state.Serializer().serializeToString(item.node);}
function textLimit(value){value=String(value);if(value.length>XML_LIMIT||new TextEncoder().encode(value).length>XML_LIMIT)fail('XML exceeds 4 MiB',7);return value;}
function blankError(){return {errorCode:0,line:0,linepos:0,filepos:0,reason:'',srcText:'',url:''};}
function typedValue(node,value,write=false){
  const type=node.nodeType===1?node.getAttributeNS(DT,'dt'):null,text=write?value:node.textContent;
  if(!type)return write?String(text):text;
  if(type==='bin.base64'||type==='bin.hex'){
    if(write){const bytes=byteArray(value);if(bytes.length>1000000)fail('XML binary value exceeds array limit',7);let encoded='';if(type==='bin.hex'){for(const b of bytes)encoded+=b.toString(16).padStart(2,'0');}else{let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));encoded=btoa(raw);}return encoded;}
    const encoded=text.replace(/\s/g,'');let bytes;
    if(type==='bin.hex'){if(!/^(?:[\da-f]{2})*$/i.test(encoded))fail('Invalid bin.hex value',13);bytes=Uint8Array.from(encoded.match(/../g)||[],n=>parseInt(n,16));}
    else{if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))fail('Invalid bin.base64 value',13);bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));}return vbBytes(bytes);
  }
  const types={string:'String',int:'Long',i2:'Integer',i4:'Long',ui1:'Byte',r4:'Single',r8:'Double',float:'Double',boolean:'Boolean',date:'Date',dateTime:'Date','fixed.14.4':'Currency'};
  if(!Object.hasOwn(types,type))fail('Unsupported XML datatype: '+type,3251);let input=unbox(text);
  if(!write&&type==='boolean'){if(!['true','false','1','0'].includes(String(input).trim()))fail('Invalid XML Boolean',13);input=['true','1'].includes(String(input).trim());}
  if(!write&&['date','dateTime'].includes(type)){const pattern=type==='date'?/^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;if(!pattern.test(String(input)))fail('Invalid XML date',13);input=new Date(input);if(!Number.isFinite(input.getTime()))fail('Invalid XML date',13);}
  const result=coerce(input,types[type]);
  if(write){if(type==='boolean')return Number(result)?'true':'false';if(type==='date'||type==='dateTime')return type==='date'?result.toISOString().slice(0,10):result.toISOString();return String(result);}
  return tagScalar(result,types[type].toLowerCase());
}
/** XML environment is injected in Node; browsers use their built-in XML DOM/XPath. */
export function xmlDocumentAdapter(session,{transport,fs,DOMParser=globalThis.DOMParser,XMLSerializer=globalThis.XMLSerializer}={}){
  if(typeof DOMParser!=='function'||typeof XMLSerializer!=='function')fail('XML DOM requires a browser or a host-installed standards DOM implementation',429);
  const parser=new DOMParser(),document=parser.parseFromString('<root/>','application/xml');document.removeChild(document.documentElement);
  const state={document,Serializer:XMLSerializer,closed:false,epoch:0,async:true,preserve:false,ready:0,url:'',namespaces:Object.create(null),namespaceText:'',error:blankError(),listeners:new Set(),cache:new WeakMap(),alive(){if(this.closed||session.closed)fail('XML session is closed',91);}};
  const empty=()=>{while(document.firstChild)document.removeChild(document.firstChild);};
  const unwrap=value=>{const item=nodes.get(value);if(!item||item.state!==state)fail('Expected an XML node from this document',13);state.alive();return item.node;};
  let rootAdapter;const adopt=(object,metadata)=>{const adapter=componentAdapter(object,metadata),invoke=adapter.invoke;adapter.invoke=adapter.invokeScalar=(...args)=>{state.alive();return invoke(...args);};if(metadata===XML_DOCUMENT_METADATA)rootAdapter=adapter;return session.adopt(adapter);};
  function list(source,attributeOwner=null){let cursor=0;const values=()=>{state.alive();const result=Array.from(source());if(result.length>10000)fail('XML collection exceeds node limit',7);return result;};
    const api={get length(){return values().length;},item(index){return wrap(values()[int(index,-2147483648,2147483647)]);},nextNode(){return wrap(values()[cursor++]);},reset(){cursor=0;},enumerate(){return values().map(wrap);}};
    if(attributeOwner)Object.assign(api,{getNamedItem:name=>wrap(attributeOwner.getAttributeNode(name)),setNamedItem:value=>wrap(attributeOwner.setAttributeNode(unwrap(value))),removeNamedItem:name=>{const n=attributeOwner.getAttributeNode(name);return wrap(n?attributeOwner.removeAttributeNode(n):null);},getQualifiedItem:(name,ns)=>wrap(attributeOwner.getAttributeNodeNS(ns,name)),removeQualifiedItem:(name,ns)=>{const n=attributeOwner.getAttributeNodeNS(ns,name);return wrap(n?attributeOwner.removeAttributeNode(n):null);}});
    return adopt(api,attributeOwner?XML_ATTRIBUTES_METADATA:XML_LIST_METADATA);
  }
  function select(node,query){state.alive();if(typeof query!=='string'||query.length>4096)fail('Invalid XPath expression');if(typeof document.evaluate!=='function')fail('XPath requires a host-installed XPath evaluator',3251);
    let result;try{result=document.evaluate(query,node,prefix=>Object.hasOwn(state.namespaces,prefix)?state.namespaces[prefix]:null,7,null);}catch{fail('Invalid or unsupported XPath expression',5);}
    if(result.snapshotLength>10000)fail('XPath result exceeds node limit',7);return Array.from({length:result.snapshotLength},(_,i)=>result.snapshotItem(i));
  }
  function wrap(node){
    if(!node)return NOTHING;state.alive();if(state.cache.has(node))return state.cache.get(node);let children,attributes;
    const api={get nodeName(){return node.nodeName;},get nodeType(){return node.nodeType;},get nodeTypeString(){return typeNames[node.nodeType]||'';},get namespaceURI(){return node.namespaceURI||'';},get prefix(){return node.prefix||'';},get baseName(){return node.localName||'';},get xml(){return textLimit(new XMLSerializer().serializeToString(node));},get nodeValue(){return node.nodeValue;},set nodeValue(value){if(![2,3,4,7,8].includes(node.nodeType))fail('This node type has no writable nodeValue');node.nodeValue=textLimit(value);},get text(){return node.nodeType===9?node.documentElement?.textContent||'':node.textContent||'';},set text(value){if(node.nodeType===9)fail('Document text is not writable');node.textContent=textLimit(value);},get nodeTypedValue(){return typedValue(node);},set nodeTypedValue(value){node.textContent=textLimit(typedValue(node,value,true));},get dataType(){return node.nodeType===1?node.getAttributeNS(DT,'dt')||null:null;},set dataType(value){if(node.nodeType!==1)fail('Only elements support instance datatypes');if(!['string','int','i2','i4','ui1','r4','r8','float','boolean','date','dateTime','fixed.14.4','bin.base64','bin.hex'].includes(value))fail('Unsupported XML datatype',3251);node.setAttributeNS(DT,'dt:dt',value);},
      get parentNode(){return wrap(node.parentNode);},get firstChild(){return wrap(node.firstChild);},get lastChild(){return wrap(node.lastChild);},get previousSibling(){return wrap(node.previousSibling);},get nextSibling(){return wrap(node.nextSibling);},get ownerDocument(){return wrap(node.ownerDocument);},get childNodes(){return children??=list(()=>node.childNodes);},get attributes(){return node.nodeType===1?(attributes??=list(()=>node.attributes,node)):NOTHING;},
      hasChildNodes:()=>node.hasChildNodes(),cloneNode:deep=>wrap(node.cloneNode(Boolean(deep))),appendChild:value=>wrap(node.appendChild(unwrap(value))),removeChild:value=>wrap(node.removeChild(unwrap(value))),replaceChild:(value,old)=>wrap(node.replaceChild(unwrap(value),unwrap(old))),insertBefore:(value,ref)=>wrap(node.insertBefore(unwrap(value),ref===undefined||ref===null||ref===NOTHING?null:unwrap(ref))),selectNodes:query=>{const result=select(node,query);return list(()=>result);},selectSingleNode:query=>wrap(select(node,query)[0])};
    if(node.nodeType===1)Object.defineProperties(api,Object.getOwnPropertyDescriptors({get tagName(){return node.tagName;},getAttribute:name=>node.hasAttribute(name)?node.getAttribute(name):null,setAttribute:(name,value)=>node.setAttribute(name,textLimit(value)),removeAttribute:name=>node.removeAttribute(name),getAttributeNode:name=>wrap(node.getAttributeNode(name)),setAttributeNode:value=>wrap(node.setAttributeNode(unwrap(value))),removeAttributeNode:value=>wrap(node.removeAttributeNode(unwrap(value))),getElementsByTagName:name=>list(()=>node.getElementsByTagName(name))}));
    if(node===document)Object.defineProperties(api,Object.getOwnPropertyDescriptors(documentAPI));
    const proxy=adopt(api,node===document?XML_DOCUMENT_METADATA:node.nodeType===1?XML_ELEMENT_METADATA:XML_NODE_METADATA);state.cache.set(node,proxy);nodes.set(proxy,{state,node});return proxy;
  }
  async function changed(reentrant,epoch=state.epoch){for(const sink of [...state.listeners]){if(state.closed||session.closed||epoch!==state.epoch)break;try{await sink('onreadystatechange',[],{reentrant});}catch{/* A subscriber failure must not replace parseError or starve cleanup. */}}}
  function parse(xml){
    state.alive();empty();Object.assign(state.error,blankError(),{url:state.url});
    try{
      xml=textLimit(xml);if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))fail('DTDs and external entities are not enabled in the portable XML provider',70);
      const loaded=parser.parseFromString(xml,'application/xml'),error=Array.from(loaded.getElementsByTagNameNS('*','parsererror')).find(n=>['http://www.mozilla.org/newlayout/xml/parsererror.xml','http://www.w3.org/1999/xhtml'].includes(n.namespaceURI));
      if(error||!loaded.documentElement)fail(error?.textContent?.slice(0,2048)||'Invalid XML document',-1072896680);
      const pending=[{node:loaded,depth:0,preserve:state.preserve}];let count=0;
      while(pending.length){const {node,depth,preserve}=pending.pop();if(++count>10000||depth>128)fail('XML document node/depth limit exceeded',7);let keep=preserve;
        if(node.nodeType===1){const space=node.getAttributeNS('http://www.w3.org/XML/1998/namespace','space');if(space==='preserve')keep=true;else if(space==='default')keep=state.preserve;}
        for(const child of Array.from(node.childNodes)){if(!keep&&child.nodeType===3&&!child.nodeValue.trim())node.removeChild(child);else pending.push({node:child,depth:depth+1,preserve:keep});}
      }
      for(const child of Array.from(loaded.childNodes))document.appendChild(document.importNode(child,true));return true;
    }catch(error){empty();Object.assign(state.error,{errorCode:error.number||-1072896680,reason:String(error.message||error).slice(0,2048)});return false;}
  }
  let errorProxy;
  const documentAPI={
    get documentElement(){return wrap(document.documentElement);},set documentElement(value){const node=unwrap(value);if(node.nodeType!==1)fail('documentElement must be an element');if(node===document.documentElement)return;if(document.documentElement)document.replaceChild(node,document.documentElement);else document.appendChild(node);},
    get parseError(){return errorProxy??=adopt(state.error,XML_ERROR_METADATA);},get readyState(){return state.ready;},get url(){return state.url;},get async(){return state.async;},set async(value){state.async=Boolean(value);},get preserveWhiteSpace(){return state.preserve;},set preserveWhiteSpace(value){state.preserve=Boolean(value);},get validateOnParse(){return false;},set validateOnParse(value){if(value)fail('Schema validation requires a separately installed XML provider',3251);},get resolveExternals(){return false;},set resolveExternals(value){if(value)fail('External entity resolution is not permitted',70);},
    async loadXML(xml){this.abort();state.url='';const epoch=state.epoch,result=parse(xml);state.ready=4;await changed(true,epoch);return result;},
    load(source){this.abort();empty();const epoch=state.epoch;state.ready=1;state.url=typeof source==='string'?source:'';state.controller=new AbortController();const signal=state.controller.signal;
      const work=(async()=>{try{await changed(!state.async,epoch);if(signal.aborted||state.closed||epoch!==state.epoch)return false;let text;
        if(source instanceof VBArray||source instanceof Uint8Array)text=httpText(byteArray(source));
        else if(nodes.has(source))text=xmlObjectText(source);
        else if(typeof source==='string'&&/^https?:/i.test(source)){if(!transport)fail('No HTTP transport installed',429);const {response,bytes}=await transport.request(source,{signal,limit:XML_LIMIT});if(!response.ok)fail('HTTP XML load failed ('+response.status+')',-2147217900);text=httpText(bytes,response.headers?.get('content-type')||'');}
        else if(typeof source==='string'&&fs)text=httpText(fs.readBytes(source));else fail('XML load requires bytes, a document, a URL or a virtual file',3251);
        if(signal.aborted||state.closed||epoch!==state.epoch)return false;const result=parse(text);state.ready=4;await changed(!state.async,epoch);return result;
      }catch(error){if(epoch===state.epoch&&!state.closed){Object.assign(state.error,blankError(),{errorCode:error.number||5,reason:error.message,url:state.url});state.ready=4;await changed(!state.async,epoch);}return false;}})();
      state.pending=work;return state.async?true:work;
    },
    save(destination){if(!fs)fail('No virtual filesystem installed',429);fs.writeBytes(destination,new TextEncoder().encode(textLimit(new XMLSerializer().serializeToString(document))));},
    abort(){state.epoch++;state.controller?.abort();state.controller=null;state.ready=0;},
    setProperty(name,value){
      if(name==='SelectionLanguage'){if(value!=='XPath')fail('Only XPath selection is supported',3251);return;}
      if(name==='ProhibitDTD'){if(!value)fail('DTDs cannot be enabled in the portable XML provider',70);return;}
      if(name==='SelectionNamespaces'){
        value=textLimit(value);const names=Object.create(null),pattern=/\s*xmlns:([A-Za-z_][\w.-]*)\s*=\s*(['"])([^'"<>]*)\2\s*/y;let pos=0;
        while(pos<value.length){pattern.lastIndex=pos;const m=pattern.exec(value);if(!m||Object.hasOwn(names,m[1])||m[1]==='xmlns'||m[1]==='xml'&&m[3]!=='http://www.w3.org/XML/1998/namespace')fail('Invalid SelectionNamespaces');names[m[1]]=m[3];pos=pattern.lastIndex;}
        state.namespaces=names;state.namespaceText=value;return;
      }
      if(name==='ValidateOnParse'){this.validateOnParse=value;return;}if(name==='ResolveExternals'){this.resolveExternals=value;return;}fail('Unsupported XML property: '+name,3251);
    },
    getProperty(name){if(name==='SelectionLanguage')return 'XPath';if(name==='SelectionNamespaces')return state.namespaceText;if(name==='ProhibitDTD')return true;if(name==='ValidateOnParse'||name==='ResolveExternals')return false;fail('Unsupported XML property: '+name,3251);},
    getElementsByTagName:name=>list(()=>document.getElementsByTagName(name)),
    createElement:name=>wrap(document.createElement(name)),createAttribute:name=>wrap(document.createAttribute(name)),createTextNode:data=>wrap(document.createTextNode(textLimit(data))),createComment:data=>wrap(document.createComment(textLimit(data))),createCDATASection:data=>wrap(document.createCDATASection(textLimit(data))),createDocumentFragment:()=>wrap(document.createDocumentFragment()),createProcessingInstruction:(target,data)=>wrap(document.createProcessingInstruction(target,textLimit(data))),
    createNode(type,name,namespaceURI){type=typeof type==='string'?typeNames.indexOf(type.toLowerCase()):Number(type);if(type===1)return wrap(document.createElementNS(namespaceURI||null,name));if(type===2)return wrap(document.createAttributeNS(namespaceURI||null,name));if(type===3)return this.createTextNode('');if(type===4)return this.createCDATASection('');if(type===8)return this.createComment('');if(type===11)return this.createDocumentFragment();fail('Unsupported XML node creation type',3251);},
    subscribe(sink){state.listeners.add(sink);return ()=>state.listeners.delete(sink);},dispose(){state.closed=true;this.abort();state.listeners.clear();}
  };
  const proxy=wrap(document);
  // Registry factories return an adapter; the session already owns the one adopted by wrap.
  return {adapter:rootAdapter,proxy,loadXML:xml=>documentAPI.loadXML(xml),state};
}

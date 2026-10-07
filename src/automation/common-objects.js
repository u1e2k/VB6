import {xmlDocumentAdapter,COMMON_XML_CLASSES} from './xml-dom.js';
/** Built-in portable factories. An explicitly installed native registry still wins
 * in VirtualMachine.createObject; these factories never activate native code. */
import {AutomationRegistry} from '../runtime/automation.js';
import {httpRequestAdapter} from './http-request.js';
import {streamAdapter} from './ado-stream.js';
export const COMMON_HTTP_CLASSES=Object.freeze({
  'Microsoft.XMLHTTP':'xml','MSXML2.XMLHTTP':'xml','MSXML2.XMLHTTP.3.0':'xml','MSXML2.XMLHTTP.6.0':'xml','MSXML2.XMLHTTP60':'xml',
  'MSXML2.ServerXMLHTTP':'server','MSXML2.ServerXMLHTTP.3.0':'server','MSXML2.ServerXMLHTTP.6.0':'server','MSXML2.ServerXMLHTTP60':'server',
  'WinHttp.WinHttpRequest.5.1':'winhttp','WinHttp.WinHttpRequest':'winhttp'
});
export function createCommonAutomationRegistry({transport,fs,parseXML,xmlEnvironment={}}={}){
  if(!transport?.request)throw new TypeError('A host HTTP transport is required');
  const registry=new AutomationRegistry();
  for(const [name,kind]of Object.entries(COMMON_HTTP_CLASSES))registry.register(name,session=>httpRequestAdapter(session,{transport,fs,kind,parseXML:parseXML|| (async text=>{const xml=xmlDocumentAdapter(session,{transport,fs,...xmlEnvironment});await xml.loadXML(text);return xml.proxy;})}));
  for(const name of COMMON_XML_CLASSES)registry.register(name,session=>xmlDocumentAdapter(session,{transport,fs,...xmlEnvironment}).adapter);
  registry.register('ADODB.Stream',session=>streamAdapter(session,{transport,fs}).adapter);return registry;
}

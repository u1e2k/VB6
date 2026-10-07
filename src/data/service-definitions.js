/** Canonical HTTP connection/command contract shared by IDE, MCP and execution.
 * Aliases accepted from existing projects are normalized, never silently ignored. */
import {VBError} from '../language/errors.js';
const fail=(message,number=3001)=>{throw new VBError(message,number,'VB6.Data');};
const NETWORK=new Set(['rest','odata','graphql','gateway']);
const TYPES=Object.freeze({byte:17,integer:3,long:3,number:5,double:5,single:4,string:202,text:202,boolean:11,date:7,decimal:14,currency:6,variant:12,binary:204});
export const HTTP_COMMAND_KEYS=Object.freeze(['method','rowsPath','fields','pagination','query','body','response','valueField']);
function alias(value,canonical,alternate){
  if(value[alternate]===undefined)return;
  if(value[canonical]!==undefined&&value[canonical]!==value[alternate])fail(`Conflicting ${canonical} and ${alternate}`);
  value[canonical]=value[alternate];delete value[alternate];
}
function endpoint(value,base){
  let url;try{url=new URL(value,base);}catch{fail('Invalid HTTP data-source URL');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)fail('Only HTTP(S) URLs without embedded credentials are supported',70);
  if(base&&url.origin!==new URL(base).origin)fail('Cross-origin command URLs are rejected',70);
  return url;
}
function mapping(config){
  if(config.response!==undefined&&config.response!=='json')fail('HTTP data commands return JSON recordsets; response must be json');
  if(config.method!==undefined){config.method=String(config.method).toUpperCase();if(!['GET','POST'].includes(config.method))fail('Read commands support GET or POST');}
  if(config.valueField!==undefined&&(typeof config.valueField!=='string'||!config.valueField.length||['__proto__','prototype','constructor'].includes(config.valueField)))fail('Invalid scalar value column');
  if(config.fields!==undefined){
    if(!Array.isArray(config.fields)||config.fields.length>1024)fail('Invalid field mapping');const seen=new Set();
    for(const field of config.fields){if(!field||typeof field.name!=='string'||!field.name||seen.has(field.name.toLowerCase()))fail('Duplicate or empty field mapping');seen.add(field.name.toLowerCase());
      const parts=String(field.path||field.name).replace(/^\$\.?/,'').split('.');if(parts.some(p=>!p||['__proto__','prototype','constructor'].includes(p)))fail('Invalid JSON field path');
      if(typeof field.type==='string'){const type=TYPES[field.type.toLowerCase()];if(type===undefined)fail('Unknown field type: '+field.type);field.type=type;}
    }
  }
}
export function normalizeServiceDefinitions(data){
  for(const connection of data.connections){
    if(!NETWORK.has(String(connection.provider).toLowerCase()))continue;
    alias(connection,'url','baseUrl');if(typeof connection.url!=='string'||!connection.url.trim())fail('An absolute HTTP data-source URL is required');endpoint(connection.url);
    mapping(connection);
  }
  for(const command of data.commands){
    const connection=data.connections.find(c=>c.name.toLowerCase()===String(command.connection).toLowerCase());
    if(!connection)continue;
    if(NETWORK.has(String(connection.provider).toLowerCase())){
      alias(command,'text','path');if(command.text!==undefined&&typeof command.text!=='string')fail('Command text must be a string');
      mapping(command);
      if(['rest','odata'].includes(connection.provider.toLowerCase())&&command.text)endpoint(command.text.replace(/\{[A-Za-z0-9_]+\}/g,'parameter'),connection.url);
      if(connection.provider.toLowerCase()==='graphql'&&command.method&&command.method!=='POST')fail('GraphQL commands require POST');
    }
    for(const parameter of command.parameters||[]){
      if(typeof parameter.type==='string'){const type=TYPES[parameter.type.toLowerCase()];if(type===undefined)fail('Unknown parameter type: '+parameter.type);parameter.type=type;}
      if(parameter.required!==undefined&&typeof parameter.required!=='boolean')fail('Parameter required must be Boolean');
    }
  }
  return data;
}
export function httpCommandOptions(definition){return Object.fromEntries(HTTP_COMMAND_KEYS.filter(k=>Object.hasOwn(definition,k)).map(k=>[k,structuredClone(definition[k])]));}

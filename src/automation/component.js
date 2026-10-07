/** Explicit metadata adapters: no host prototype or arbitrary property access. */
import {VBError} from '../language/errors.js';
import {MISSING,unbox,tagScalar,VBArray,coerce} from '../runtime/values.js';
export const parameter=(name,type='Variant',optional=false)=>Object.freeze({name,type,optional});
export const method=(name,params=[],type='Variant')=>Object.freeze({name,params,modes:[1],type});
export const property=(name,type='Variant',writable=false)=>Object.freeze({name,params:[],modes:writable?[2,4]:[2],type});
export function int(value,min=0,max=2147483647){value=Number(unbox(value));if(!Number.isInteger(value)||value<min||value>max)throw new VBError('Invalid procedure call or argument',5);return value;}
export function byteArray(value){
  if(value instanceof VBArray){if(value.bounds.length!==1||value.type.toLowerCase()!=='byte')throw new VBError('Expected a one-dimensional Byte array',13);const values=value.data.map(unbox);if(values.some(v=>!Number.isInteger(v)||v<0||v>255))throw new VBError('Invalid Byte array element',13);value=Uint8Array.from(values);}
  if(!(value instanceof Uint8Array))throw new VBError('Expected binary byte data',13);return value.slice();
}
export function vbBytes(bytes){if(!(bytes instanceof Uint8Array))throw new VBError('Expected bytes',13);if(bytes.length>1000000)throw new VBError('Byte array exceeds the runtime element limit',7);const array=new VBArray([],'Byte');array.bounds=[[0,bytes.length-1]];array.data=Array.from(bytes);return array;}
export function componentAdapter(object,metadata){
  let released=false;
  const adapter={metadata,async invoke(name,mode,args){
    if(released)throw new VBError('Automation object has been released',91);
    const definition=metadata.members.find(m=>m.name===name);if(!definition||!definition.modes.includes(mode))throw new VBError('Member is not supported',438);
    const values=args.map((v,i)=>{if(v===MISSING)return undefined;const type=mode===4||mode===8?definition.type:definition.params[i]?.type;return type&&type!=='Variant'&&!type.includes('.')?coerce(unbox(v),type):unbox(v);});let value;
    if(mode===1)value=await object[name](...values);else if(mode===2)value=object[name];else {object[name]=values.at(-1);value=undefined;}
    value=await value;
    if(value!==null&&value!==undefined&&mode!==4&&mode!==8&&['Byte','Integer','Long','Single','Double','Boolean','String','Date'].includes(definition.type))value=tagScalar(value,definition.type.toLowerCase());
    return {value,args};
  },release(){if(released)return;released=true;return object.dispose?.();}};
  adapter.invokeScalar=adapter.invoke;if(object.subscribe)adapter.subscribe=handler=>object.subscribe(handler);
  if(object.enumerate)adapter.enumerate=()=>object.enumerate();return adapter;
}

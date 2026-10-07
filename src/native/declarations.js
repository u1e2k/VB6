import {compileModule} from '../language/compiler.js';
import {logicalLines} from '../language/lexer.js';
import {preprocess} from '../language/conditional.js';
import {REAL_TYPES,nativeParameterBytes} from './numeric.js';

const lower=value=>String(value).toLowerCase();
const scalar=type=>['byte','integer','long','boolean','currency','string'].includes(lower(type))||REAL_TYPES.has(lower(type));
export class NativeCompileError extends Error {
  constructor(message,source='',line=0){super(`${source?source+':'+line+': ':''}${message}`);this.name='NativeCompileError';this.diagnostics=[{severity:'error',source,line,message}];}
}

/** Lower already bound language metadata, never a second native-only grammar.
 * A valid language declaration does not imply a supported ABI or DLL import.
 * Validate before generating any machine code, including unused declarations. */
export function lowerNativeDeclarations(module){
  const declarations=new Map();
  for(const proc of module.procedures.values()){
    if(!proc.external)continue;
    const fail=message=>{throw new NativeCompileError(message,module.name,proc.line);};
    const library=proc.external.library,dll=/\.dll$/i.test(library)?library:library+'.dll';
    const entry=proc.external.entry,symbol=/^#\d+$/.test(entry)?Number(entry.slice(1)):entry;
    if(!/^[A-Za-z0-9_.-]+\.dll$/i.test(dll)||!(typeof symbol==='string'&&/^[A-Za-z_?@$][\w?@$]*$/.test(symbol)||Number.isInteger(symbol)&&symbol>0&&symbol<65536))
      fail('Unsupported native DLL import: use a DLL basename and an ASCII entry name or ordinal 1 through 65535');
    const params=proc.params.map(p=>({...p,type:p.storageType||p.type})),returnType=proc.storageReturnType||proc.returnType;
    if(params.reduce((sum,p)=>sum+nativeParameterBytes(p),0)>65532)fail('Native Declare argument area exceeds the x86 stdcall return limit');
    if(params.some(p=>(!scalar(p.type)&&(!p.byRef||['object','variant','decimal'].includes(lower(p.type))))||p.bounds!==null||p.optional||p.paramArray)||proc.kind==='function'&&!scalar(returnType))
      fail('Native Declare supports scalar Byte/Integer/Long/Boolean/Single/Double/Currency/Date/String parameters and returns; ByRef POD records and As Any are supported; arrays and managed records require separate ABI support');
    declarations.set(lower(proc.name),{name:proc.name,kind:proc.kind,scope:proc.scope,params,returnType,dll,symbol,line:proc.line});
  }
  return declarations;
}

/** Compatibility extraction API. The compiler itself consumes the original
 * compiled project, without stripping and recompiling user code. This helper
 * keeps physical line count/locations, including continued and colon headers. */
export function extractNativeDeclarations(input){
  try{
    const module=compileModule(input),declarations=lowerNativeDeclarations(module);
    const active=preprocess(input.code||'',input.conditionalConstants||{},input.name);
    const lines=active.split('\n').map(()=>'');
    for(const item of logicalLines(active)){
      if(/^(?:(?:Public|Private)\s+)?Declare\b/i.test(item.text))continue;
      const part=item.label?item.text+':':item.text;
      const line=item.line-1;
      lines[line]+=(lines[line]&&!lines[line].endsWith(':')?': ':'')+part;
    }
    return {declarations,code:lines.join('\n')};
  }catch(error){if(error instanceof NativeCompileError)throw error;throw new NativeCompileError(error.message,input.name,error.line||1);}
}

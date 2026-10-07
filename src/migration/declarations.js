import {key, identifier, qualified, vbString} from './names.js';
import {expression, defaultValue} from './expressions.js';

export function declarationType(decl,context) {
  if(decl.paramArray)return 'Object()';
  const type=context.netType(decl.type);
  return decl.bounds!==null&&decl.bounds!==undefined?'VbArray(Of '+type+')':type;
}
export function parameter(decl,context,{name=decl.name}={}) {
  const type=declarationType(decl,context);
  if(decl.paramArray)return 'ParamArray '+identifier(name)+' As Object()';
  let result=(decl.optional?'Optional ':'')+(decl.byRef?'ByRef ':'ByVal ')+identifier(name)+' As '+type;
  if(decl.optional){
    if(key(decl.type)==='currency')context.add('MIG_OPTIONAL_CURRENCY','Optional Currency requires an overload adapter because CLR parameter defaults cannot be user-defined value types.');
    result+=' = '+(decl.initial?expression(decl.initial,context):['variant','object'].includes(key(decl.type))?'VbMissing.Value':key(decl.type)==='string'?'""':'Nothing');
  }
  return result;
}
export function variable(decl,context,{local=false,staticLocal=false,field=false}={}) {
  const name=context.name(decl.name),type=declarationType(decl,context);
  if(decl.fixedLengthExpression)context.add('MIG_FIXED_LENGTH','Fixed-length string expression was not bound to a constant.');
  if(decl.withEvents&&key(decl.type)==='object')context.add('MIG_WITH_EVENTS_OBJECT','WithEvents requires a statically known .NET event source; Object event binding needs an adapter.');
  let prefix=local?(staticLocal?'Static ':'Dim '):(decl.scope==='public'?'Public ':decl.scope==='friend'?'Friend ':'Private ');
  if(decl.constant){
    if(key(decl.type)==='currency'){
      // A VB.NET Const cannot have a structure type. Keep the member read-only;
      // its use in any other constant context receives a migration diagnostic.
      return (local?'Dim ':prefix+(context.module.kind==='module'?'':'Shared ')+'ReadOnly ')+name+' As '+type+' = '+defaultValue(decl,context);
    }
    const scalar=context.constants?.get(key(decl.name));
    const value=scalar!==undefined?(typeof scalar==='string'?vbString(scalar):typeof scalar==='boolean'?(scalar?'True':'False'):String(scalar)):expression(decl.initial,context);
    return (local?'Const ':prefix+'Const ')+name+' As '+type+' = '+value;
  }
  if(decl.withEvents)prefix+='WithEvents ';
  if(field)return 'Public '+name+' As '+type;
  return prefix+name+' As '+type+' = '+defaultValue(decl,context);
}
export function emitRecords(writer,context) {
  for(const [name,fields] of Object.entries(context.module.types)){
    writer.open('Public Structure '+identifier(name));
    writer.line('Implements IVbValue');
    for(const field of fields)writer.line(variable(field,context,{field:true}));
    writer.open('Public Shared Function Create() As '+identifier(name));
    writer.line('Dim result As New '+identifier(name)+'()');
    for(const field of fields){
      const initial=defaultValue(field,context);
      if(initial!=='Nothing')writer.line('result.'+identifier(field.name)+' = '+initial);
    }
    writer.line('Return result');writer.close('End Function');
    writer.open('Public Function CopyValue() As Object Implements IVbValue.CopyValue');
    writer.line('Dim result As '+identifier(name)+' = Me');
    for(const field of fields)writer.line('result.'+identifier(field.name)+' = CType(VbRuntime.CopyValue(result.'+identifier(field.name)+'), '+declarationType(field,context)+')');
    writer.line('Return result');writer.close('End Function');writer.close('End Structure');writer.line();
  }
}
export function emitEnums(writer,context) {
  for(const definition of Object.values(context.module.enums)){
    writer.open((definition.scope==='public'?'Public ':'Private ')+'Enum '+identifier(definition.name)+' As Integer');
    for(const name of definition.members){
      const decl=context.module.declarations.find(d=>key(d.name)===key(name));
      const value=context.constants?.get(key(name));
      writer.line(identifier(name)+' = '+(value===undefined?expression(decl.initial,context):String(value)),{source:context.source,line:decl.line});
    }
    writer.close('End Enum');writer.line();
  }
}
export function emitDeclare(writer,proc,context) {
  const library=proc.external.library,params=proc.params.map(p=>parameter(p,context)).join(', ');
  context.add('MIG_DECLARE_ABI','Native Declare retained as ANSI P/Invoke; validate ABI, deployment, ownership and error handling for '+library+'.','warning');
  if(context.options.platform!=='x86')context.add('MIG_POINTER_WIDTH','VB6 Declare defaults to a 32-bit ABI; non-x86 export requires explicit pointer-width and structure-layout mappings.');
  if(proc.params.some(p=>key(p.type)==='any'||p.bounds!==null||!['byte','integer','long','single','double','string'].includes(key(p.type))))context.add('MIG_DECLARE_MARSHAL','Declare contains Any, array, Boolean, Currency, Variant, or record parameters that require an explicit marshaling adapter.');
  writer.line((proc.scope==='public'?'Public ':'Private ')+'Declare Ansi '+(proc.kind==='sub'?'Sub ':'Function ')+identifier(proc.name)+' Lib '+vbString(library)+' Alias '+vbString(proc.external.entry||proc.name)+' ('+params+')'+(proc.kind==='function'?' As '+context.netType(proc.returnType):''),context);
}

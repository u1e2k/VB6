import {identifier, keyOf, vbString} from './contracts.js';
import {createEmitContext, typeName, declarationType} from './types.js';
import {emitExpression} from './expressions.js';
import {emitDeclaration, initialValue, parameter, procedureScope} from './declarations.js';
import {emitProcedureBody} from './statements.js';

function propertyGroups(procedures) {
  const result = new Map();
  for (const p of procedures) if (p.kind === 'property') { const key = keyOf(p.name), group = result.get(key) || []; group.push(p); result.set(key,group); }
  return [...result.values()];
}
function format(entries) {
  const output=[],map=[]; let indent = 0;
  for (const item of entries) {
    const entry = typeof item === 'string' ? {text:item} : item;
    for (const raw of entry.text.split('\n')) {
      const text=raw.trim();
      const dedent=/^(?:End\b|Else(?:If)?\b|Case\b|Next\b|Loop\b|Catch\b|Finally\b)/i.test(text);
      if (dedent) indent=Math.max(0,indent-1);
      output.push('    '.repeat(indent)+text);
      if (entry.source) map.push({generatedLine:output.length,source:entry.source,line:entry.line,procedure:entry.procedure});
      if (/^(?:(?:Public|Private|Friend|Partial|Shared|Default|ReadOnly|WriteOnly|NotInheritable|MustInherit)\s+)*(?:Module|Class|Structure|Interface|Enum|Sub|Function|Property)\b/i.test(text) && !/\bDeclare\b/i.test(text) || /^(?:If\b.*\bThen|Else|ElseIf\b.*\bThen|For\b.*|While\b.*|Do(?:\s.*)?|Select Case\b.*|Case\b.*|With\b.*|Get|Set\s*\(.*\))$/i.test(text)) indent++;
      // Select Case has one level for Case and a second for case bodies.
      if (/^Select Case\b/i.test(text)) indent++;
      if (/^End Select\b/i.test(text)) indent=Math.max(0,indent-1);
    }
  }
  return {code:output.join('\n')+'\n',sourceMap:map};
}
function externalDeclaration(p,c) {
  const allowed = new Set(['byte','integer','long','single','double']);
  if (c.options.platform !== 'x86') c.error('VBM3301','Native Declare defaults require x86 to retain VB6 pointer widths; supply an ABI plugin for x64.');
  for (const d of [...p.params,...(p.kind === 'sub' ? [] : [{type:p.returnType||'Long'}])]) if (!allowed.has(keyOf(d.type))) c.error('VBM3302','Native Declare type needs an explicit marshalling/ownership adapter: '+d.type);
  for (const d of p.params) if (d.bounds !== null) c.error('VBM3302','Native array marshalling requires an ABI adapter.');
  c.nativeLibraries.add(p.external.library);
  return `${procedureScope(p)} Declare Ansi ${p.kind==='sub'?'Sub':'Function'} ${identifier(p.name)} Lib ${vbString(p.external.library)} Alias ${vbString(p.external.entry)}(${p.params.map(d=>parameter(d,c)).join(', ')})${p.kind==='sub'?'':' As '+typeName(p.returnType,c)}`;
}
function eventHandles(procedure, module, root, context) {
  const targets = [];
  for (const field of module.declarations.filter(d => d.withEvents)) {
    const owner = root.modules.find(m => keyOf(m.name) === keyOf(field.type));
    if (!owner) continue;
    for (const event of owner.events) {
      if (keyOf(procedure.name) !== keyOf(field.name + '_' + event.name)) continue;
      if (procedure.kind !== 'sub' || procedure.params.length !== event.params.length || procedure.params.some((p, i) => keyOf(p.type) !== keyOf(event.params[i].type) || p.byRef !== event.params[i].byRef)) context.error('VBM3410', 'Event handler signature does not match ' + field.name + '.' + event.name);
      targets.push(identifier(field.name) + '.' + identifier(event.name));
    }
  }
  return targets.length ? ' Handles ' + targets.join(', ') : '';
}
export function emitModule(module,root) {
  const c=createEmitContext(root,module),entries=[];
  const push=value=>entries.push(...[].concat(value));
  const emitBody=(p,context)=>emitProcedureBody(p,context).map(e=>({...e,source:module.sourcePath,procedure:p.name}));
  push(["' Generated from "+module.sourcePath.replace(/[\r\n]/g,' '),"' Original sources, diagnostics and source maps are in the migration package.", 'Option Explicit On', 'Option Strict '+(root.options.optionStrict?'On':'Off'), 'Option Infer On', 'Option Compare '+module.optionCompare,'']);
  for (const comment of module.comments) push(comment.text);
  const kind=module.kind==='module'?'Module':'Class';
  push(`${module.privateModule?'Friend':'Public'} ${module.kind==='form'?'Partial ':''}${kind} ${identifier(module.name)}`);
  if (module.kind==='form') push('Inherits Global.System.Windows.Forms.Form');
  for (const contract of module.interfaces) c.error('VBM3401','Implements '+contract.name+' requires a source-interface/COM contract adapter; the original declaration is preserved.');
  if (module.procedures.some(p=>keyOf(p.name)==='class_terminate')) { push('Implements Global.System.IDisposable'); c.error('VBM3402','Class_Terminate used deterministic COM reference-counting. IDisposable is emitted, but callers require a lifetime-ownership migration.'); }
  if (module.predeclared) {
    if (module.kind==='module') c.error('VBM3403','A standard module cannot be predeclared.');
    else push([`<Global.System.ThreadStatic> Private Shared __defaultInstance As ${identifier(module.name)}`,`Public Shared ReadOnly Property DefaultInstance As ${identifier(module.name)}`,'Get',`If __defaultInstance Is Nothing${module.kind==='form'?' OrElse __defaultInstance.IsDisposed':''} Then`, `__defaultInstance = New ${identifier(module.name)}()`, 'End If','Return __defaultInstance','End Get','End Property','']);
  }
  for (const enumeration of module.enums) {
    c.line=enumeration.line; push(`${procedureScope(enumeration)} Enum ${identifier(enumeration.name)} As Integer`);
    for (const d of enumeration.members) push(`${identifier(d.name)} = ${emitExpression(d.initial,c)}`);
    push('End Enum');
  }
  for (const structure of module.types) {
    c.line=structure.line;push(`${procedureScope(structure)} Structure ${identifier(structure.name)}`);
    for (const field of structure.members) push(`Public ${identifier(field.name)} As ${declarationType(field,c)}`);
    push([`Public Shared Function __Create() As ${identifier(structure.name)}`,`Dim result As New ${identifier(structure.name)}()`]);
    for (const field of structure.members) push(`result.${identifier(field.name)} = ${initialValue(field,c)}`);
    push(['Return result','End Function','End Structure']);
  }
  for (const d of module.declarations) { c.line=d.line;push(emitDeclaration(d,c,procedureScope(d))); }
  for (const event of module.events) push(`${procedureScope(event)} Event ${identifier(event.name)}(${event.params.map(p=>parameter(p,c)).join(', ')})`);
  if (module.kind!=='module') {
    push(['Public Sub New()',...(module.kind==='form'?['InitializeComponent()']:[])]);
    if (module.procedures.some(p=>keyOf(p.name)==='class_initialize')) push('[Class_Initialize]()');
    if (module.procedures.some(p=>keyOf(p.name)==='form_initialize')) push('[Form_Initialize]()');
    push('End Sub');
    if (module.procedures.some(p=>keyOf(p.name)==='class_terminate')) push(['Private __disposed As Boolean','Public Sub Dispose() Implements Global.System.IDisposable.Dispose','If Not __disposed Then','__disposed = True','[Class_Terminate]()','End If','End Sub']);
  }
  for (const p of module.procedures.filter(p=>p.kind!=='property')) {
    const context=createEmitContext(root,module,p);context.line=p.line;
    const custom=root.registry.dispatch('declaration',p,context);
    if (custom!==undefined) {push(custom);continue;}
    if (p.external) {push(externalDeclaration(p,context));continue;}
    const signature=`${procedureScope(p)} ${p.kind==='sub'?'Sub':'Function'} ${identifier(p.name)}(${p.params.map(d=>parameter(d,context)).join(', ')})${p.kind==='sub'?'':' As '+typeName(p.returnType,context)}`;
    push(signature + eventHandles(p,module,root,context));push(emitBody(p,context));push('End '+(p.kind==='sub'?'Sub':'Function'));push('');
  }
  for (const group of propertyGroups(module.procedures)) {
    const getter=group.find(p=>p.accessor==='get'),setters=group.filter(p=>p.accessor!=='get'),setter=setters[0],p=getter||setter,context=createEmitContext(root,module,p);
    if (setters.length>1) context.error('VBM3404','Separate Property Let and Set require a value/object-dispatch adapter.');
    const indices=getter?getter.params:setter.params.slice(0,-1),value=setter?.params.at(-1),returnType=getter?.returnType||value?.type||'Variant';
    if (setter && !value) context.error('VBM3405','Property setter is missing its value parameter.');
    if (value?.byRef) context.error('VBM3405','ByRef Property setter values require a method adapter to preserve copy-back.');
    const defaultMember=keyOf(module.defaultMember||'')===keyOf(p.name) && indices.length>0;
    push(`${procedureScope(p)} ${defaultMember?'Default ':''}${!getter?'WriteOnly ':!setter?'ReadOnly ':''}Property ${identifier(p.name)}(${indices.map(d=>parameter(d,context,{property:true})).join(', ')}) As ${typeName(returnType,context)}`);
    if (getter) {push('Get');push(emitBody(getter,createEmitContext(root,module,getter)));push('End Get');}
    if (setter) {push(`Set(ByVal ${identifier(value?.name||'value')} As ${typeName(returnType,context)})`);push(emitBody(setter,createEmitContext(root,module,setter)));push('End Set');}
    push('End Property');
  }
  if (module.kind==='form') push(root.formEventAdapters?.get(keyOf(module.name))||[]);
  push('End '+kind);
  return format(entries);
}

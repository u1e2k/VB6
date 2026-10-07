import {identifier, keyOf, vbString} from './contracts.js';
import {typeName, declarationType} from './types.js';
import {emitExpression, convertValue} from './expressions.js';
import {explicitOptionalArguments, optionalDefault} from './calls.js';

const R = 'Global.Vb6Migration.Runtime.';
export function initialValue(d, c) {
  const emit = node => emitExpression(node, c);
  if (d.bounds !== null && d.bounds !== undefined && !d.paramArray) {
    c.use('arrays');
    const lows = d.bounds.map(b => b[0] ? emit(b[0]) : String(c.module.optionBase));
    const highs = d.bounds.map(b => emit(b[1]));
    return `New ${R}VbArray(Of ${typeName(d.type, c)})(New Integer() {${lows.join(', ')}}, New Integer() {${highs.join(', ')}}, ${d.bounds.length ? 'True' : 'False'})`;
  }
  if (d.autoNew) return `New ${R}VbAutoNew(Of ${typeName(d.type, c)})()`;
  if (d.initial) return d.constant ? emit(d.initial) : convertValue(emit(d.initial), d.type, c);
  if (d.fixedLength || d.fixedLengthExpression) return `New String(" "c, ${d.fixedLength || emit(d.fixedLengthExpression)})`;
  const type = keyOf(d.type);
  if (type === 'string') return 'String.Empty';
  if (type === 'date') return 'Global.System.DateTime.FromOADate(0)';
  if (c.types.get(type)?.kind === 'type') return `${typeName(d.type, c)}.__Create()`;
  return 'Nothing';
}
export function emitDeclaration(d, c, scope = 'Dim') {
  const custom = c.registry.dispatch('declaration', d, {...c, scope});
  if (custom !== undefined) return custom;
  let type = declarationType(d, c);
  if (d.autoNew) type = `${R}VbAutoNew(Of ${typeName(d.type, c)})`;
  if (d.withEvents && d.autoNew) c.error('VBM3010', 'WithEvents As New cannot be combined.');
  if (d.constant) return (scope === 'Dim' || scope === 'Static' ? '' : scope + ' ') + `Const ${identifier(d.name)} As ${type} = ${initialValue(d, c)}`;
  return `${scope}${d.withEvents ? ' WithEvents' : ''} ${identifier(d.name)} As ${type} = ${initialValue(d, c)}`;
}
export function parameter(d, c, {property = false} = {}) {
  if (property && d.byRef) c.error('VBM3011', 'VB.NET property index parameters are ByVal. A ByRef index requires a reviewed accessor-method rule.');
  let prefix = d.paramArray ? 'ParamArray ' : d.byRef && !property ? 'ByRef ' : 'ByVal ';
  if (d.optional && explicitOptionalArguments(c.procedure)) {
    const attributes = ['Global.System.Runtime.InteropServices.Optional'];
    if (d.initial) attributes.push('Global.System.Runtime.InteropServices.DefaultParameterValue(' + emitExpression(d.initial, c) + ')');
    return '<' + attributes.join(', ') + '> ' + prefix + identifier(d.name) + ' As ' + declarationType(d, c);
  }
  if (d.optional) prefix = 'Optional ' + prefix;
  return prefix + identifier(d.name) + ' As ' + declarationType(d, c) + (d.optional ? ' = ' + optionalDefault(d, node => emitExpression(node, c)) : '');
}
export function procedureScope(p) { return {private:'Private',friend:'Friend',public:'Public'}[String(p.scope || 'public').toLowerCase()] || 'Public'; }
export function unsupportedStatement(text, c, code = 'VBM2100') {
  c.error(code, 'No safe migration rule for statement: ' + text, {original: text});
  return `Throw New Global.System.NotSupportedException(${vbString(code + ': ' + text)})`;
}

import {key, identifier, qualified, CodeWriter} from './names.js';
import {optionalDefault} from './optional-parameters.js';
import {accessorReference} from './property-plan.js';
import {findRecord} from './record-types.js';

function parameterType(parameter, procedure, context) {
  const record = findRecord(context.compiled, procedure.owner || context.module, parameter.type);
  const type = record ? qualified(record.owner.name + '.' + record.name) : context.netType(parameter.type);
  return parameter.bounds == null ? type : context.runtime('VbArray') + '(Of ' + type + ')';
}

/** .NET VB binds/evaluates named arguments in parameter order. Passing them
 * through a typed positional permutation keeps the frontend's lexical order,
 * including inside nested expressions, loop tests and resumable statements.
 * No lambda captures, eagerly hoisted statements or boxed argument vectors. */
export function orderedCall(node, procedure, context, emitArgument, emitExpression) {
  if (!procedure?.params || !node.args.some(arg => arg.kind === 'named')) return null;
  const supplied = [], positions = new Set();
  for (const [index, argument] of node.args.entries()) {
    const position = argument.kind === 'named'
      ? procedure.params.findIndex(p => key(p.name) === key(argument.name)) : index;
    if (position < 0 || position >= procedure.params.length || positions.has(position)) return null;
    positions.add(position);
    if (argument.kind !== 'missing') supplied.push({position, argument:argument.kind === 'named' ? argument.expr : argument});
  }
  if (supplied.every((item, index) => !index || supplied[index - 1].position < item.position)) return null;
  if (procedure.kind === 'event' || procedure.params.some(p => p.paramArray) || !procedure.owner) {
    context.add('MIG_ARGUMENT_ORDER', 'Reordered named arguments require a statically bound, fixed-arity Sub, Function or property getter.');
    return null;
  }
  const missing = procedure.params.map((p, index) => index).filter(index => !supplied.some(item => item.position === index));
  if (missing.some(index => !procedure.params[index].optional)) return null;

  const callee = node.callee;
  const memberName = accessorReference(procedure, context) || identifier(procedure.name);
  let target = procedure.owner.kind === 'module' ? qualified(procedure.owner.name) + '.' + memberName : memberName;
  let receiver = null, receiverType = null;
  if (callee.kind === 'member' && procedure.owner.kind !== 'module') {
    receiver = emitExpression(callee.object, {receiver:true, reference:true});
    receiverType = callee.object.kind === 'id' && key(callee.object.name) === 'me'
      ? qualified(context.module.name) : context.netType(context.type(callee.object));
    target = '__vbReceiver.' + memberName;
  }
  const types = procedure.params.map(p => parameterType(p, procedure, context));
  const returns = procedure.kind === 'function' || procedure.kind === 'property';
  const returnType = returns ? parameterType({type:procedure.returnType || procedure.type}, procedure, context) : null;
  const signature = JSON.stringify([target, receiverType, types, supplied.map(item => item.position), procedure.params.map(p => p.byRef), returnType]);
  let adapter = context.callAdapters.get(signature);
  if (!adapter) {
    const name = '__vbCallOrder' + context.callAdapters.size;
    const writer = new CodeWriter('');
    const parameters = supplied.map(({position}) => (procedure.params[position].byRef ? 'ByRef ' : 'ByVal ') +
      '__vbArg' + position + ' As ' + types[position]);
    if (receiverType) parameters.unshift('ByVal __vbReceiver As ' + receiverType);
    writer.open('Private ' + (returns ? 'Function ' : 'Sub ') + name + '(' + parameters.join(', ') + ')' + (returns ? ' As ' + returnType : ''));
    for (const position of missing) writer.line('Dim __vbArg' + position + ' As ' + types[position] + ' = ' + optionalDefault(procedure, procedure.params[position], context));
    writer.line((returns ? 'Return ' : '') + target + '(' + procedure.params.map((p, i) => '__vbArg' + i).join(', ') + ')');
    writer.close(returns ? 'End Function' : 'End Sub');
    adapter = {name, source:writer.toString()};
    context.callAdapters.set(signature, adapter);
  }
  const argumentsInOrder = supplied.map(({argument, position}) => emitArgument(argument, procedure.params[position]));
  if (receiver) argumentsInOrder.unshift(receiver);
  return identifier(adapter.name) + '(' + argumentsInOrder.join(', ') + ')';
}

export function emitCallAdapters(writer, context) {
  for (const adapter of context.callAdapters.values()) { writer.line(); writer.line(adapter.source.trimEnd()); }
}

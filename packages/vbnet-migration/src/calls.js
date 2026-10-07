import {identifier, keyOf} from './contracts.js';

/** VB's source binder does not treat OptionalAttribute as the Optional keyword.
 * A Missing-valued parameter therefore uses optional metadata and explicit
 * source call arguments. This avoids conflating an omitted Variant with Empty. */
export function explicitOptionalArguments(procedure) {
  return !!procedure?.params?.some(p => p.optional && !p.initial && keyOf(p.type) === 'variant');
}
export function optionalDefault(parameter, emit) {
  if (parameter.initial) return emit(parameter.initial);
  if (keyOf(parameter.type) === 'variant') return 'Global.System.Type.Missing';
  if (keyOf(parameter.type) === 'string') return '""';
  if (keyOf(parameter.type) === 'date') return '#12/30/1899#';
  return 'Nothing';
}
export function callArguments(args, symbol, context, emit) {
  const parameters = symbol?.params;
  if (!parameters) return args.map(arg => emit(arg));
  const explicit = explicitOptionalArguments(symbol), supplied = new Set();
  let positional = 0;
  const result = args.map(arg => {
    const index = arg.kind === 'named' ? parameters.findIndex(p => keyOf(p.name) === keyOf(arg.name)) : positional++;
    const parameter = parameters[index] || parameters.at(-1)?.paramArray && parameters.at(-1);
    if (index < 0 || !parameter) context.error('VBM2010', 'No matching parameter for call argument of ' + symbol.name);
    if (supplied.has(index) && !parameter?.paramArray) context.error('VBM2010', 'Parameter supplied more than once: ' + parameter?.name);
    supplied.add(index);
    if (arg.kind === 'missing') {
      if (!parameter?.optional) context.error('VBM2011', 'Required call argument was omitted: ' + parameter?.name);
      return explicit && parameter ? optionalDefault(parameter, emit) : '';
    }
    return emit(arg, {object: !!parameter && ['object', 'variant'].includes(keyOf(parameter.type))});
  });
  parameters.forEach((parameter,index) => {
    if (supplied.has(index) || parameter.paramArray) return;
    if (!parameter.optional) context.error('VBM2011', 'Required call argument was omitted: ' + parameter.name);
    else if (explicit) result.push(identifier(parameter.name) + ':=' + optionalDefault(parameter,emit));
  });
  return result;
}

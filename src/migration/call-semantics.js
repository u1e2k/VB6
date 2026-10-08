import {key} from './names.js';

/** Do not mistake VB.NET property copy-back for a live VB6 array-element reference. */
export function validateCallSemantics(node, symbol, context) {
  const indexed = symbol && !symbol.procedure && !symbol.module && !symbol.control &&
    !symbol.paramArray && symbol.bounds == null && ['variant', 'object'].includes(key(symbol.type));
  if (indexed && node.args.some(arg => arg.kind === 'named' || arg.kind === 'missing')) {
    context.add('MIG_INDEX_ARGUMENT', 'Named or omitted late-bound index arguments require a default-member binding adapter.');
  }
  if (!symbol?.params) return;
  for (const [index, argument] of node.args.entries()) {
    const parameter = argument.kind === 'named'
      ? symbol.params.find(param => key(param.name) === key(argument.name))
      : symbol.params[index];
    const value = argument.kind === 'named' ? argument.expr : argument;
    if (!parameter?.byRef || value.kind === 'group' || value.kind === 'byval') continue;
    const source = context.resolve(value);
    if (source?.arrayElement && !source.paramArray && !(value.kind==='call'&&context.arrayPlan(context.resolve(value.callee))&&key(parameter.type)===key(source.type))) {
      context.add('MIG_ARRAY_ELEMENT_BYREF', 'A VB6 array element passed ByRef requires a live value-cell adapter; managed property copy-back cannot preserve aliasing or writes before an exception.');
    }
  }
}

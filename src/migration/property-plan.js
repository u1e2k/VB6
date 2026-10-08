import {key, identifier} from './names.js';

/** A CLR property cannot express independent Let/Set dispatch or mutable index
 * arguments. Keep ordinary properties native; lower only those contracts to
 * accessor methods and use the same plan for declarations and bound call sites. */
export function propertyPlan(module, name) {
  if (!module) return null;
  const group = [...module.procedures.values()].filter(p => p.kind === 'property' && key(p.name) === key(name));
  if (!group.length) return null;
  const get = group.find(p => p.accessor === 'get');
  const letAccessor = group.find(p => p.accessor === 'let');
  const set = group.find(p => p.accessor === 'set');
  const indexes = p => p.accessor === 'get' ? p.params : p.params.slice(0, -1);
  const methods = !!(letAccessor && set) || group.some(p => indexes(p).some(param => param.byRef));
  return {group, get, let:letAccessor, set, methods};
}

export function accessorName(name, accessor) {
  return '__vb' + ({get:'Get', let:'Let', set:'Set'}[accessor]) + '_' + name;
}

export function accessorReference(symbol, context, accessor = 'get') {
  const plan = symbol?.kind === 'property' ? propertyPlan(symbol.owner || context.module, symbol.name) : null;
  if (!plan?.methods) return null;
  if (!plan[accessor]) context.add('MIG_PROPERTY_ACCESSOR', 'Property ' + symbol.name + ' has no Property ' + accessor + ' accessor.');
  return identifier(accessorName(symbol.name, accessor));
}

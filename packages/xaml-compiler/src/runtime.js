import {safeMember} from './schema.js';

/** An explicit object writer, not a WinUI UI implementation. Hosts own controls,
 * dependency properties, binding observation, events, templates and disposal. */
export function instantiateXaml(program, host, options = {}) {
  if (program?.version !== 1 || program.root?.kind !== 'Object') throw new TypeError('Unsupported XAML construction program.');
  if (typeof host?.create !== 'function' || typeof host?.set !== 'function') throw new TypeError('A host with create and set methods is required.');
  const objects = new Map(), constructing = new Set(), names = new Map(), scopes = new Map(), created = [], subscriptions = [], pending = [];
  let root, disposed = false, count = 0;
  const dispose = () => {
    if (disposed) return; disposed = true;
    const errors = [];
    for (const release of subscriptions.reverse()) try { release(); } catch (error) { errors.push(error); }
    for (const value of created.reverse()) try { host.dispose?.(value); } catch (error) { errors.push(error); }
    objects.clear(); names.clear(); scopes.clear();
    if (errors.length) throw new AggregateError(errors,'Errors disposing XAML objects.');
  };
  const members = node => new Map(node.properties.map(p => [p.member.name,p.value]));
  function entries(value) {
    if (value?.kind === 'Dictionary') return value.entries;
    if (value?.kind !== 'Object' || !value.dictionary) return [];
    const props = members(value), merged = props.get('MergedDictionaries');
    const result = merged?.kind === 'Collection' ? merged.items.flatMap(entries) : [];
    if (props.has('Source')) throw new Error('External resource dictionaries require host preprocessing.');
    return [...result,...entries(props.get('Items'))];
  }
  const readResource = (key, resources, theme) => {
    if (theme) {
      if (!host.resource) throw new Error('ThemeResource requires host.resource.');
      return host.resource(key,{theme:true,resources,root,names});
    }
    for (const scope of resources) if (scope.has(key)) {
      const item = scope.get(key);
      if (item.external) return item.value;
      return value(item.value,item.resources);
    }
    if (host.resource) return host.resource(key,{theme:false,resources,root,names});
    throw new Error('Missing XAML resource ' + key + '.');
  };
  function value(node, resources, depth = 0) {
    if (++count > (options.maxOperations ?? 200000) || depth > 256) throw new RangeError('XAML object writer budget exceeded.');
    options.signal?.throwIfAborted();
    if (node?.kind === 'Literal') return node.value;
    if (node?.kind === 'Resource') return readResource(node.key,resources,node.theme);
    if (node?.kind === 'Collection') return node.items.map(n => value(n,resources,depth + 1));
    if (node?.kind === 'Dictionary') return new Map(node.entries.map(e => [e.key,value(e.value,resources,depth + 1)]));
    if (node?.kind === 'RelativeSource') return node;
    if (node?.kind !== 'Object') throw new TypeError('Unsupported construction value ' + node?.kind + '.');
    if (objects.has(node)) return objects.get(node);
    if (constructing.has(node)) throw new Error('Cyclic resource construction.');
    if (node.directives?.Load || node.directives?.DeferLoadStrategy) throw new Error('Deferred x:Load and x:DeferLoadStrategy require host preprocessing.');
    if (node.template) {
      if (!host.template) throw new Error('Templates require host.template.');
      const create = instanceOptions => {
        const content = node.properties.find(p => p.member.name === 'Content')?.value;
        if (content?.kind !== 'Object') throw new Error('Template content must be an object.');
        return instantiateXaml({version:1,root:content},host,{...options,...instanceOptions,resources:new Map(resources.flatMap(s => [...s].map(([k]) => [k,readResource(k,resources,false)])))});
      };
      const result = host.template(node,create); objects.set(node,result); return result;
    }
    constructing.add(node);
    const local = new Map(), resourceScopes = [local,...resources];
    for (const property of node.properties) if (property.member.name === 'Resources' || node.dictionary && property.member.name === 'Items') for (const e of entries(property.value)) local.set(e.key,{value:e.value,resources:resourceScopes});
    const instance = host.create(node.type,{node,names,resources:resourceScopes});
    created.push(instance);
    const scope = scopes.get(node.scope) ?? new Map(); scopes.set(node.scope,scope);
    if (node.name) { if (scope.has(node.name)) throw new Error('Duplicate runtime name ' + node.name + '.'); scope.set(node.name,instance); if (node.scope === program.root.scope) names.set(node.name,instance); }
    // Do not cache an instance before its properties finish: resource cycles
    // must not be mistaken for legal references to half-initialized objects.
    for (const property of node.properties) {
      const {member} = property, expression = property.value;
      safeMember(member.name);
      if (expression.kind === 'Binding' || member.kind === 'event') { pending.push({instance,member,expression,node,resources:resourceScopes,scope}); continue; }
      const result = value(expression,resourceScopes,depth + 1);
      if (expression.kind === 'Collection') {
        if (!host.add) throw new Error('Collections require host.add.');
        for (const item of result) host.add(instance,member,item);
      } else host.set(instance,member,result);
    }
    constructing.delete(node); objects.set(node,instance); return instance;
  }
  try {
    host.begin?.(program);
    const resources = options.resources instanceof Map ? options.resources : new Map(Object.entries(options.resources ?? {}));
    root = value(program.root,[new Map([...resources].map(([key,value]) => [key,{value,external:true}]))]);
    for (const item of pending) {
      const context = {root,names:item.scope,resources:item.resources,node:item.node,readResource:(key,theme=false) => readResource(key,item.resources,theme)};
      let release;
      if (item.member.kind === 'event') {
        if (!host.listen) throw new Error('Event connections require host.listen.');
        release = host.listen(item.instance,item.member,item.expression,context);
      } else {
        if (!host.bind) throw new Error('Bindings require host.bind.');
        release = host.bind(item.instance,item.member,item.expression,context);
      }
      if (typeof release === 'function') subscriptions.push(release);
    }
    host.commit?.(root);
    return {root,names,scopes,dispose};
  } catch (error) {
    const failures = [error];
    try { dispose(); } catch (cleanup) { failures.push(cleanup); }
    try { host.rollback?.(error); } catch (cleanup) { failures.push(cleanup); }
    if (failures.length > 1) throw new AggregateError(failures,'XAML construction and rollback failed.',{cause:error});
    throw error;
  }
}

/** Useful for tooling/tests: constructs inert data, never HTML or native widgets. */
export function createObjectHost() {
  return {
    create(type) { return {type:{...type},properties:Object.create(null)}; },
    set(target, member, value) { target.properties[safeMember(member.attached ? member.owner + '.' + member.name : member.name)] = value; },
    add(target, member, value) { const key = safeMember(member.name); (target.properties[key] ??= []).push(value); }
  };
}

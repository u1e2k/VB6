import {safeMember} from './schema.js';

/** XAML binding paths are parsed data, never JavaScript passed to eval/Function. */
export function parseBindingPath(text, options = {}) {
  const source = String(text ?? '').trim();
  if (source.length > (options.maxLength ?? 16384)) throw new RangeError('Binding path exceeds the size limit.');
  let index = 0, depth = 0;
  const fail = message => { const error = new SyntaxError(message + ' at binding offset ' + index + '.'); error.offset = index; throw error; };
  const space = () => { while (/\s/.test(source[index] ?? '') && index < source.length) index++; };
  const name = () => {
    space(); const start = index;
    const found = /^[A-Za-z_][\w]*(?::[A-Za-z_]\w*)?/.exec(source.slice(index));
    if (!found) fail('Expected an identifier'); index += found[0].length;
    if (!safeMember(found[0]) || found[0].split(':').some(part => !safeMember(part))) fail('Unsafe member');
    return {name: found[0], start, end: index};
  };
  function primary() {
    space(); if (++depth > 64) fail('Binding expression nesting limit exceeded'); const start = index;
    let node;
    if (source[index] === '!' && options.functions !== false) { index++; node = {kind: 'Not', operand: primary(), start, end: index}; }
    else if (source[index] === "'" || source[index] === '"') {
      const quote = source[index++]; let value = '', closed = false;
      while (index < source.length) { const c = source[index++]; if (c === quote) { if (source[index] === quote) { value += quote; index++; } else { closed = true; break; } } else if (c === '^' && index < source.length) value += source[index++]; else value += c; }
      if (!closed) fail('Unterminated string literal'); node = {kind: 'Constant', value, start, end: index};
    } else if (/[-+\d]/.test(source[index] ?? '') && index < source.length) {
      const number = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(index));
      if (!number || !Number.isFinite(Number(number[0]))) fail('Invalid numeric literal'); index += number[0].length;
      node = {kind: 'Constant', value: Number(number[0]), start, end: index};
    } else if (source[index] === '(') {
      index++; space(); const saved = index;
      // WinUI cast syntax: ((prefix:Type)expression). Cast semantics belong to the host schema.
      const cast = /^[A-Za-z_]\w*:[A-Za-z_]\w*\s*\)/.exec(source.slice(index));
      if (cast) { index += cast[0].length; node = {kind: 'Cast', type: cast[0].slice(0, -1).trim(), operand: primary(), start, end: index}; }
      else { index = saved; node = primary(); space(); if (source[index++] !== ')') fail('Expected closing parenthesis'); }
    } else {
      const id = name();
      node = ['true', 'false', 'null'].includes(id.name) ? {kind: 'Constant', value: id.name === 'null' ? null : id.name === 'true', start, end: index} : {kind: id.name.includes(':') ? 'Static' : 'Member', name: id.name, target: {kind: 'Root', start, end: start}, start, end: index};
    }
    while (index < source.length) {
      space();
      if (source[index] === '.') { index++; const id = name(); if (id.name.includes(':')) fail('Unexpected namespace qualifier'); node = {kind: 'Member', target: node, name: id.name, start, end: index}; }
      else if (source[index] === '[') { index++; const key = primary(); if (key.kind !== 'Constant' || !['string', 'number'].includes(typeof key.value)) fail('Indexers require a string or numeric literal'); space(); if (source[index++] !== ']') fail('Expected closing bracket'); if (!safeMember(String(key.value))) fail('Unsafe indexer'); node = {kind: 'Index', target: node, key: key.value, start, end: index}; }
      else if (source[index] === '(' && options.functions !== false) {
        index++; const args = []; space();
        while (source[index] !== ')') { args.push(primary()); space(); if (source[index] === ',') { index++; space(); } else break; }
        if (source[index++] !== ')') fail('Expected closing function parenthesis'); node = {kind: 'Call', target: node, arguments: args, start, end: index};
      } else break;
    }
    depth--; return node;
  }
  if (!source || source === '.') return {kind: 'Root', start: 0, end: source.length};
  const expression = primary(); space(); if (index !== source.length) fail('Unexpected binding token');
  if (options.functions === false && !['Member', 'Index', 'Root'].includes(expression.kind)) fail('Binding requires a property path');
  return expression;
}

export function evaluateBindingPath(expression, root, options = {}) {
  const read = (target, key) => { if (!safeMember(String(key))) throw new TypeError('Unsafe binding member.'); return target == null ? undefined : options.read ? options.read(target, key) : target[key]; };
  const evaluate = node => {
    switch (node.kind) {
      case 'Root': return root;
      case 'Constant': return node.value;
      case 'Member': return read(evaluate(node.target), node.name);
      case 'Index': return read(evaluate(node.target), node.key);
      case 'Static': if (!options.resolveStatic) throw new Error('Static type resolution requires a host.'); return options.resolveStatic(node.name);
      case 'Cast': if (!options.cast) throw new Error('Binding casts require a host.'); return options.cast(node.type, evaluate(node.operand));
      case 'Not': return !evaluate(node.operand);
      case 'Call': {
        const target = node.target, owner = target.kind === 'Member' || target.kind === 'Index' ? evaluate(target.target) : undefined;
        const fn = target.kind === 'Member' ? read(owner, target.name) : target.kind === 'Index' ? read(owner, target.key) : evaluate(target);
        if (typeof fn !== 'function') throw new TypeError('Binding function is not callable.');
        if (!options.invoke) throw new Error('Function bindings require an explicit host invoke callback.');
        return options.invoke(fn, owner, node.arguments.map(evaluate));
      }
      default: throw new TypeError('Unknown binding expression ' + node.kind);
    }
  };
  return evaluate(expression);
}
export function assignBindingPath(expression, root, value, options = {}) {
  if (!['Member', 'Index'].includes(expression.kind)) throw new TypeError('TwoWay bindings require an assignable member path or BindBack function.');
  const target = evaluateBindingPath(expression.target, root, options), key = expression.kind === 'Member' ? expression.name : expression.key;
  if (target == null || !safeMember(String(key))) throw new TypeError('Binding source is not writable.');
  if (options.write) options.write(target, key, value); else target[key] = value;
}
export function bindingDependencies(expression) {
  const paths = [];
  function visit(node) { if (node.kind === 'Member' || node.kind === 'Index') { paths.push(node); visit(node.target); } else if (node.kind === 'Call') { visit(node.target); node.arguments.forEach(visit); } else if (node.operand) visit(node.operand); }
  visit(expression); return paths;
}

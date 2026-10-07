import {keyOf, identifier, qualifiedName} from './contracts.js';

export const TYPE_MAP = Object.freeze({byte: 'Byte', boolean: 'Boolean', integer: 'Short', long: 'Integer', single: 'Single', double: 'Double', currency: 'Decimal', date: 'Date', string: 'String', variant: 'Object', object: 'Object', collection: 'Global.Microsoft.VisualBasic.Collection'});
export const CONVERSIONS = Object.freeze({byte: 'CByte', boolean: 'CBool', integer: 'CShort', long: 'CInt', single: 'CSng', double: 'CDbl', date: 'CDate'});
export const NUMERIC_TYPES = new Set(['byte', 'integer', 'long', 'single', 'double', 'currency']);
export function typeName(type, context) {
  const custom = context.registry.dispatch('type', {name: type}, context);
  if (custom !== undefined) return custom;
  const key = keyOf(type || 'Variant');
  if (TYPE_MAP[key]) return TYPE_MAP[key];
  if (key === 'any') { context.error('VBM3001', 'Declare As Any requires a concrete reviewed P/Invoke signature.'); return 'Object'; }
  const symbol = context.types.get(key);
  if (symbol) return symbol.owner && symbol.owner !== context.module.name ? qualifiedName(symbol.owner) + '.' + identifier(symbol.name) : identifier(symbol.name);
  const model = context.modules.find(m => keyOf(m.name) === key);
  if (model) return identifier(model.name);
  context.error('VBM3002', 'Unresolved type: ' + type + '. Supply a type/reference plugin or the source defining it.');
  return qualifiedName(type);
}
export function declarationType(decl, context) {
  const element = typeName(decl.type, context);
  return decl.paramArray ? element + '()' : decl.bounds !== null && decl.bounds !== undefined ? 'Global.Vb6Migration.Runtime.VbArray(Of ' + element + ')' : element;
}
export function symbolTables(modules) {
  const types = new Map(), globals = new Map(), moduleSymbols = new Map();
  for (const module of modules) {
    const own = new Map(); moduleSymbols.set(keyOf(module.name), own);
    for (const member of [...module.declarations, ...module.procedures, ...module.events]) {
      const key = keyOf(member.name), old = own.get(key);
      if (!old || member.accessor === 'get') own.set(key, {...member, owner: module.name, category: member.params ? 'procedure' : 'variable', type: member.returnType || member.type});
    }
    for (const enumeration of module.enums) {
      types.set(keyOf(enumeration.name), {...enumeration, owner: module.name});
      for (const value of enumeration.members) own.set(keyOf(value.name), {...value, type: 'Long', category: 'enum', owner: module.name, enumName: enumeration.name, constant: true});
    }
    for (const type of module.types) types.set(keyOf(type.name), {...type, owner: module.name});
    for (const c of [...(module.input.form?.controls || []), ...(module.input.form?.menus || [])]) {
      const key = keyOf(c.name), old = own.get(key);
      if (old?.category === 'control') { old.controls.push(c); continue; }
      own.set(key, {name: c.name, type: c.type, category: 'control', owner: module.name, controls: [c], controlArray: c.properties?.Index !== undefined});
    }
    if (module.kind === 'module') for (const [key, symbol] of own) if (String(symbol.scope).toLowerCase() !== 'private') {
      const list = globals.get(key) || []; list.push(symbol); globals.set(key, list);
    }
  }
  return {types, globals, moduleSymbols};
}

export function createEmitContext(root, module, procedure = null) {
  const own = root.moduleSymbols.get(keyOf(module.name)) || new Map();
  const locals = new Map();
  const context = {...root, module, procedure, locals, line: procedure?.line || 1, uses: new Set(), generated: [], sourceMap: [], withStack: [], implicit: [], tempCounter: 0,
    location() { return {project: root.project.name, source: module.sourcePath, module: module.name, procedure: procedure?.name, line: this.line}; },
    error(code, message, detail) { return root.diagnostics.error(code, message, this.location(), detail); },
    warning(code, message, detail) { return root.diagnostics.warning(code, message, this.location(), detail); },
    use(name) { this.uses.add(name); root.runtimeFeatures.add(name); },
    temp(prefix = 'value') { let name; do { name = '__vb6_' + prefix + '_' + (++this.tempCounter); } while (locals.has(keyOf(name)) || own.has(keyOf(name))); locals.set(keyOf(name), {name, generated: true}); return identifier(name); },
    resolve(name) {
      const key = keyOf(name); if (locals.has(key)) return locals.get(key); if (own.has(key)) return own.get(key);
      const candidates = root.globals.get(key) || [];
      if (candidates.length === 1) return candidates[0];
      if (candidates.length > 1) this.error('VBM2001', 'Ambiguous global name: ' + name);
      return null;
    },
    declare(decl) {
      const key = keyOf(decl.name);
      if (locals.has(key) && !locals.get(key).implicit) this.error('VBM2002', 'Duplicate local declaration: ' + decl.name);
      const symbol = {...decl, category: 'variable'}; locals.set(key, symbol); return symbol;
    },
    implicitSymbol(name) {
      if (!procedure || module.optionExplicit) { this.error('VBM2003', 'Unresolved identifier: ' + name); return null; }
      const symbol = {name, type: root.frontend.defaultIdentifierType(name, module.defaultTypes), bounds: null, implicit: true, category: 'variable'};
      locals.set(keyOf(name), symbol); this.implicit.push(symbol); return symbol;
    }
  };
  for (const p of procedure?.params || []) context.declare(p);
  return context;
}

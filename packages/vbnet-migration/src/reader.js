import {keyOf} from './contracts.js';

/** Source-oriented IR: unlike the VM instruction stream, structured statements,
 * declaration ownership, physical locations and original source remain available. */
export function readModule(input, context) {
  const {frontend: f, diagnostics, options} = context;
  const module = {name: input.name, kind: input.kind || 'module', input, sourcePath: input.sourcePath || input.name + (input.kind === 'form' ? '.frm' : input.kind === 'class' ? '.cls' : '.bas'),
    source: String(input.code || ''), defaultTypes: {}, declarations: [], procedures: [], types: [], enums: [], events: [], interfaces: [],
    optionExplicit: false, optionBase: 0, optionCompare: 'Binary', attributes: [...(input.attributes || [])], comments: [], invalid: false};
  const location = line => ({project: context.project.name, source: module.sourcePath, module: module.name, line});
  let lines;
  try { lines = f.logicalLines(f.preprocess(module.source, options.conditionalConstants, module.name)); }
  catch (error) { diagnostics.error('VBM1001', error.message, location(error.line || 1)); module.invalid = true; return module; }
  if (/^\s*#(?:If|Const)\b/im.test(module.source)) diagnostics.add('VBM0001', 'info', 'Conditional compilation selected using the constants recorded in migration.json; all original branches remain in the source snapshot.', location(1), {constants: options.conditionalConstants});
  for (const [index, raw] of module.source.replace(/\r\n?/g, '\n').split('\n').entries()) {
    if (/^\s*(?:'|Rem\b)/i.test(raw)) module.comments.push({line: index + 1, text: raw.trim().replace(/^Rem\b/i, "'")});
  }
  let current = null, aggregate = null;
  for (const entry of lines) {
    const {text, line} = entry;
    try {
      if (/^Attribute\s+/i.test(text)) { module.attributes.push(text); continue; }
      if (current) {
        if (new RegExp('^End\\s+' + (current.kind === 'property' ? 'Property' : current.kind) + '$', 'i').test(text)) { current.endLine = line; module.procedures.push(current); current = null; }
        else current.body.push({...entry});
        continue;
      }
      if (aggregate) {
        if (new RegExp('^End\\s+' + (aggregate.kind === 'type' ? 'Type' : 'Enum') + '$', 'i').test(text)) { aggregate.endLine = line; aggregate = null; continue; }
        if (aggregate.kind === 'type') aggregate.members.push(...f.parseTypeFields(text).map(d => ({...d, line})));
        else aggregate.members.push({...f.parseEnumMember(text, aggregate.members.at(-1)?.name), line});
        continue;
      }
      let match;
      if (/^Def\w+\b/i.test(text)) { f.addDefaultTypes(module.defaultTypes, text); continue; }
      if (/^Option\s+Explicit$/i.test(text)) { module.optionExplicit = true; continue; }
      if ((match = /^Option\s+Base\s+([01])$/i.exec(text))) { module.optionBase = Number(match[1]); continue; }
      if ((match = /^Option\s+Compare\s+(Text|Binary)$/i.exec(text))) { module.optionCompare = /^text$/i.test(match[1]) ? 'Text' : 'Binary'; continue; }
      if (/^Option\s+Private\s+Module$/i.test(text)) { module.privateModule = true; continue; }
      const header = f.parseProcedureHeader(text, module.defaultTypes);
      if (header) { current = {...header, line, body: [], source: text}; continue; }
      const definition = f.parseModuleHeader(text, module.defaultTypes);
      if (definition) {
        const item = {...definition, line};
        if (['type', 'enum'].includes(item.kind)) { item.members = []; aggregate = item; module[item.kind === 'type' ? 'types' : 'enums'].push(item); }
        else if (item.kind === 'declare') module.procedures.push({...item, kind: item.procedureKind, body: [], external: item.external});
        else if (item.kind === 'event') module.events.push(item);
        else if (item.kind === 'implements') module.interfaces.push(item);
        continue;
      }
      if ((match = /^(?:(Public|Private|Global|Friend)\s+)?Const\s+(.+)$/i.exec(text))) { module.declarations.push(...f.parseDeclarations(match[2], true, module.defaultTypes).map(d => ({...d, scope: match[1] || 'Private', line}))); continue; }
      if ((match = /^(Public|Private|Global|Dim|Friend)\s+(.+)$/i.exec(text))) { module.declarations.push(...f.parseDeclarations(match[2], false, module.defaultTypes).map(d => ({...d, scope: /^(Dim|Private)$/i.test(match[1]) ? 'Private' : 'Public', line}))); continue; }
      if (/^(?:VERSION\b|BEGIN$|END$|MultiUse\s*=|Persistable\s*=|DataBindingBehavior\s*=|DataSourceBehavior\s*=|MTSTransactionMode\s*=)/i.test(text)) continue;
      diagnostics.error('VBM1002', 'Unsupported module declaration: ' + text, location(line), {original: text}); module.invalid = true;
    } catch (error) { diagnostics.error('VBM1001', error.message, location(line), {original: text}); module.invalid = true; }
  }
  if (current || aggregate) { diagnostics.error('VBM1003', 'Unterminated ' + (current?.kind || aggregate.kind), location(current?.line || aggregate.line)); module.invalid = true; }
  const names = new Set();
  for (const member of [...module.declarations, ...module.types, ...module.enums, ...module.events, ...module.procedures]) {
    const key = keyOf(member.name) + (member.kind === 'property' ? ':' + member.accessor : '');
    if (names.has(key)) { diagnostics.error('VBM1004', 'Ambiguous member name: ' + member.name, location(member.line)); module.invalid = true; }
    names.add(key);
  }
  const defaults = module.attributes.map(line => /^Attribute\s+(\w+)\.VB_UserMemId\s*=\s*0\s*$/i.exec(line)).filter(Boolean);
  module.defaultMember = defaults[0]?.[1] || null;
  module.predeclared = input.kind === 'form' || module.attributes.some(line => /^Attribute\s+VB_PredeclaredId\s*=\s*True\s*$/i.test(line));
  return module;
}

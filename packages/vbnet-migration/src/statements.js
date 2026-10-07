import {identifier, keyOf, vbString} from './contracts.js';
import {declarationType, typeName} from './types.js';
import {emitExpression, expressionType, expressionSymbol, emitAssignment, condition, convertValue} from './expressions.js';
import {emitDeclaration, unsupportedStatement} from './declarations.js';
const R = 'Global.Vb6Migration.Runtime.VbRuntime.';
const F = 'Global.Microsoft.VisualBasic.FileSystem.';
function labelName(text, c) {
  const label = c.frontend.parseLabel(text), key = keyOf(label);
  c.labelReferences.add(key);
  return /^\d+$/.test(label) ? label : identifier(label);
}
function assignmentParts(text, f) {
  let depth = 0, delimiter;
  f.scanSyntax(text, token => {
    if (token.kind === 'op' && token.value === '(') depth++;
    else if (token.kind === 'op' && token.value === ')') depth--;
    else if (token.kind === 'op' && token.value === '=' && depth === 0) { delimiter = token; return false; }
  });
  return delimiter ? [text.slice(0, delimiter.start).trim(), text.slice(delimiter.end).trim()] : null;
}
function printArguments(text, c) {
  const entries = []; let depth = 0, start = 0;
  c.frontend.scanSyntax(text, token => {
    if (token.kind === 'op' && token.value === '(') depth++;
    else if (token.kind === 'op' && token.value === ')') depth--;
    else if (token.kind === 'op' && depth === 0 && [',', ';'].includes(token.value)) {
      const part = text.slice(start, token.start).trim(); if (part) entries.push(emitExpression(c.frontend.parseExpression(part), c));
      if (token.value === ',') entries.push(R + 'PrintZone');
      start = token.end;
    }
  });
  const tail = text.slice(start).trim(); if (tail) entries.push(emitExpression(c.frontend.parseExpression(tail), c));
  return {entries, newline: !/[;,]\s*$/.test(text)};
}
function emitFile(file, c) {
  const e = n => emitExpression(n, c), number = n => 'CInt(' + e(n) + ')', handle = number(file.handle);
  c.use('files');
  switch (file.op) {
    case 'fileOpen': {
      const mode = {input:'Input',output:'Output',append:'Append',binary:'Binary',random:'Random'}[file.mode];
      const access = {'read':'Read','write':'Write','read write':'ReadWrite'}[file.access] || 'Default';
      const share = {'shared':'Shared','lock read':'LockRead','lock write':'LockWrite','lock read write':'LockReadWrite'}[file.sharing] || 'Default';
      return `${F}FileOpen(${handle}, CStr(${e(file.path)}), Global.Microsoft.VisualBasic.OpenMode.${mode}, Global.Microsoft.VisualBasic.OpenAccess.${access}, Global.Microsoft.VisualBasic.OpenShare.${share}, ${file.recordLength ? number(file.recordLength) : '-1'})`;
    }
    case 'fileSeek': return `${F}Seek(${handle}, CLng(${e(file.position)}))`;
    case 'fileLock': return `${F}${file.unlock ? 'Unlock' : 'Lock'}(${handle}${file.start ? ', CLng(' + e(file.start) + ')' : ''}${file.end ? ', CLng(' + e(file.end) + ')' : ''})`;
    case 'fileInput': return file.targets.map(target => {
      const lhs = e(target);
      return file.whole ? `${lhs} = ${F}LineInput(${handle})` : `${F}Input(${handle}, ${lhs})`;
    });
    case 'fileRecord':
      // .NET's UDT/array serialization layout is not VB6's binary-record ABI.
      return unsupportedStatement(file.action + ' file record (binary layout requires a codec plugin)', c, 'VBM3101');
    case 'filePrint': return `${F}${file.csv ? 'WriteLine' : file.newline ? 'PrintLine' : 'Print'}(${handle}${file.exprs.length ? ', ' + file.exprs.map(e).join(', ') : ''})`;
  }
  return undefined;
}

/** Emits source-oriented control flow; no regex substitution is applied to strings
 * or expressions. Every expression is parsed by the shared frontend. */
export function emitProcedureBody(p, c) {
  const f = c.frontend, E = text => f.parseExpression(text), emit = n => emitExpression(n, c), lines = [], scopes = [];
  c.labelReferences = new Set(); c.labels = new Set(); c.returnSites = [];
  c.hasGoSub = p.body.some(s => /\bGoSub\b/i.test(s.text));
  c.returnStack = c.hasGoSub ? c.temp('returns') : null;
  c.dispatchLabel = c.hasGoSub ? c.temp('dispatch') : null;
  c.exitLabel = c.hasGoSub ? c.temp('exit') : null;
  const declarations = [];
  // VB6 Dim has procedure lifetime even when syntactically inside a block.
  for (const statement of p.body) {
    const m = /^(Dim|Static|Const)\s+(.+)$/i.exec(statement.text);
    if (m) try {
      const items = f.parseDeclarations(m[2], /^const$/i.test(m[1]), c.module.defaultTypes);
      for (const d of items) { c.line = statement.line; c.declare(d); declarations.push({d, static: p.static || /^static$/i.test(m[1]), line: statement.line}); }
    } catch (error) { c.error('VBM2101', error.message, {original: statement.text}); }
  }
  const returnsValue = p.kind === 'function' || p.kind === 'property' && p.accessor === 'get';
  if (returnsValue) c.resultName = c.temp('result');
  const append = (value, sourceLine = c.line) => {
    for (const text of Array.isArray(value) ? value : String(value).split('\n')) lines.push({text, line: sourceLine});
  };
  function close(expected) {
    const current = scopes.pop();
    if (!current || current.kind !== expected) c.error('VBM2102', 'Mismatched block terminator: expected ' + expected + ', found ' + (current?.kind || 'procedure'));
    return current;
  }
  function branch(label, gosub) {
    const target = labelName(label, c);
    if (!gosub) return 'GoTo ' + target;
    const returnLabel = c.temp('return'); const number = c.returnSites.length + 1;
    c.returnSites.push({number, label: returnLabel});
    return [`${c.returnStack}.Push(${number})`, 'GoTo ' + target, returnLabel + ':'];
  }
  function statement(text) {
    const custom = c.registry.dispatch('statement', {text, line:c.line}, {...c, emitExpression:emit, parseExpression:E});
    if (custom !== undefined) return custom;
    const inline = f.parseIfHeader(text);
    if (inline) {
      const test = condition(E(inline.condition), c), otherwise = inline.body && f.inlineElse(inline.body);
      if (inline.body) {
        const yes = otherwise ? inline.body.slice(0, otherwise.start) : inline.body;
        const no = otherwise ? inline.body.slice(otherwise.end) : null;
        return ['If ' + test + ' Then', ...f.statementParts(yes).flatMap(part => statement(part.text ?? part)), ...(no === null ? [] : ['Else', ...f.statementParts(no).flatMap(part => statement(part.text ?? part))]), 'End If'];
      }
      if (/^ElseIf\b/i.test(text)) {
        if (scopes.at(-1)?.kind !== 'if') c.error('VBM2102', 'ElseIf outside If');
        return 'ElseIf ' + test + ' Then';
      }
      scopes.push({kind:'if'}); return 'If ' + test + ' Then';
    }
    if (/^Else$/i.test(text)) { if (scopes.at(-1)?.kind !== 'if') c.error('VBM2102', 'Else outside If'); return 'Else'; }
    if (/^End\s+If$/i.test(text)) { close('if'); return 'End If'; }
    const loop = f.parseForHeader(text);
    if (loop) {
      scopes.push({kind:'for'});
      return loop.kind === 'each' ? `For Each ${emit(E(loop.name))} In ${emit(loop.expr)}` : `For ${emit(E(loop.name))} = ${emit(loop.start)} To ${emit(loop.end)} Step ${emit(loop.step)}`;
    }
    let m;
    if ((m = /^Next(?:\s+(.+))?$/i.exec(text))) {
      const variables = m[1] ? f.splitTop(m[1]) : [''];
      return variables.map(name => { close('for'); return 'Next' + (name ? ' ' + emit(E(name)) : ''); });
    }
    if ((m = /^While\s+(.+)$/i.exec(text))) { scopes.push({kind:'while'}); return 'While ' + condition(E(m[1]), c); }
    if (/^Wend$/i.test(text)) { close('while'); return 'End While'; }
    if ((m = /^Do(?:\s+(While|Until)\s+(.+))?$/i.exec(text))) { scopes.push({kind:'do', tested:!!m[1]}); return 'Do' + (m[1] ? ' ' + m[1] + ' ' + condition(E(m[2]), c) : ''); }
    if ((m = /^Loop(?:\s+(While|Until)\s+(.+))?$/i.exec(text))) { const block = close('do'); if (block?.tested && m[1]) c.error('VBM2102','Do cannot have both entry and exit conditions'); return 'Loop' + (m[1] ? ' ' + m[1] + ' ' + condition(E(m[2]), c) : ''); }
    if ((m = /^Select\s+Case\s+(.+)$/i.exec(text))) { scopes.push({kind:'select'}); return 'Select Case ' + emit(E(m[1])); }
    if ((m = /^Case\s+(.+)$/i.exec(text))) {
      if (scopes.at(-1)?.kind !== 'select') c.error('VBM2102', 'Case outside Select Case');
      if (/^Else$/i.test(m[1])) return 'Case Else';
      return 'Case ' + f.splitTop(m[1]).map(part => {
        const comparison = /^Is\s*(<=|>=|<>|=|<|>)\s*(.+)$/i.exec(part);
        if (comparison) return 'Is ' + comparison[1] + ' ' + emit(E(comparison[2]));
        const to = f.findKeyword(part,'to'); return to ? emit(E(part.slice(0,to.start))) + ' To ' + emit(E(part.slice(to.end))) : emit(E(part));
      }).join(', ');
    }
    if (/^End\s+Select$/i.test(text)) { close('select'); return 'End Select'; }
    if ((m = /^With\s+(.+)$/i.exec(text))) {
      // Native With retains mutable structure receivers and captures object receivers once.
      c.withStack.push(''); scopes.push({kind:'with'}); return 'With ' + emitExpression(E(m[1]), c, {object:true});
    }
    if (/^End\s+With$/i.test(text)) { close('with'); c.withStack.pop(); return 'End With'; }
    if (/^(Dim|Static|Const)\s+/i.test(text)) return [];
    if ((m = /^Exit\s+(Sub|Function|Property|Do|For|While)$/i.exec(text))) {
      if (/^(Sub|Function|Property)$/i.test(m[1])) return returnsValue ? 'Return ' + c.resultName : 'Return';
      return 'Exit ' + m[1];
    }
    if ((m = /^(GoTo|GoSub)\s+(.+)$/i.exec(text))) return branch(m[2], /^gosub$/i.test(m[1]));
    if (/^Return$/i.test(text)) return c.hasGoSub ? 'GoTo ' + c.dispatchLabel : unsupportedStatement('Return without GoSub', c, 'VBM2103');
    if ((m = /^On\s+Error\s+(.+)$/i.exec(text))) {
      if (/^Resume\s+Next$/i.test(m[1])) return 'On Error Resume Next';
      const go = /^GoTo\s+(.+)$/i.exec(m[1]);
      if (go) return 'On Error GoTo ' + (/^0$/.test(go[1]) ? '0' : labelName(go[1], c));
      return unsupportedStatement(text, c);
    }
    if ((m = /^Resume(?:\s+(.+))?$/i.exec(text))) return 'Resume' + (!m[1] ? '' : /^Next$/i.test(m[1]) ? ' Next' : ' ' + labelName(m[1], c));
    if (/^On\s+/i.test(text)) {
      const selected = f.parseComputedBranch(text);
      return [`Select Case ${R}ToInt16(${emit(selected.expr)})`, ...selected.labels.flatMap((label,index) => ['Case ' + (index+1), ...[].concat(branch(label,selected.gosub))]), 'Case Is < 0, Is > 255', 'Global.Microsoft.VisualBasic.Information.Err().Raise(5)', 'End Select'];
    }
    if ((m = /^Error\s+(.+)$/i.exec(text))) return `Global.Microsoft.VisualBasic.Information.Err().Raise(${R}ToInt32(${emit(E(m[1]))}))`;
    if (/^Stop$/i.test(text)) return 'Global.System.Diagnostics.Debugger.Break()';
    if (/^End$/i.test(text)) { c.warning('VBM0100','End maps to process termination and bypasses managed cleanup, as VB6 End does.'); return 'Global.System.Environment.Exit(0)'; }
    if (/^DoEvents(?:\(\))?$/i.test(text)) return c.target === 'windows' ? 'Global.System.Windows.Forms.Application.DoEvents()' : unsupportedStatement(text, c);
    if ((m = /^(Load|Unload)\s+(.+)$/i.exec(text))) {
      const node = E(m[2]), form = node.kind === 'id' && c.modules.find(item => item.kind === 'form' && keyOf(item.name) === keyOf(node.name));
      if (form || node.kind === 'id' && keyOf(node.name) === 'me') return /^unload$/i.test(m[1]) ? emitExpression(node,c,{object:true}) + '.Close()' : 'Global.Vb6Migration.Runtime.VbForms.LoadForm(' + emitExpression(node,c,{object:true}) + ')';
      return unsupportedStatement(text,c,'VBM4100');
    }
    if ((m = /^Erase\s+(.+)$/i.exec(text))) return f.splitTop(m[1]).map(part => `${R}EraseArray(${emitExpression(E(part),c,{object:true})})`);
    if ((m = /^ReDim\s+(Preserve\s+)?(.+)$/i.exec(text))) {
      const declarations = f.parseDeclarations(m[2], false, c.module.defaultTypes);
      return declarations.map(d => {
        let symbol = c.resolve(d.name);
        if (!symbol) { symbol = {...d, bounds:[]}; c.declare(symbol); declarationsForRedim.push(symbol); }
        if (d.explicitType && keyOf(d.type) !== keyOf(symbol.type)) c.error('VBM3201','ReDim cannot change the declared element type without a Variant-array adapter.');
        if (!d.bounds?.length) return unsupportedStatement(text,c);
        const lows = d.bounds.map(b => b[0] ? emit(b[0]) : c.module.optionBase), highs = d.bounds.map(b => emit(b[1]));
        return `${emitExpression(E(d.name),c,{object:true})}.Resize(New Integer() {${lows.join(', ')}}, New Integer() {${highs.join(', ')}}, ${m[1]?'True':'False'})`;
      });
    }
    if ((m = /^(Debug\.)?Print(?:\s+(.+))?$/i.exec(text))) {
      const output = printArguments(m[2] || '',c);
      if (!m[1]) return unsupportedStatement('Form/Printer Print requires a graphics-text backend',c,'VBM4101');
      return `${R}DebugPrint(${output.newline ? 'True' : 'False'}, New Object() {${output.entries.join(', ')}})`;
    }
    if ((m = /^Close(?:\s+(.+))?$/i.exec(text))) return `${F}FileClose(${m[1] ? f.splitTop(m[1]).map(v => 'CInt(' + emit(E(v.replace(/^#\s*/,''))) + ')').join(', ') : ''})`;
    const file = f.parseFileStatement(text); if (file) return emitFile(file,c);
    if ((m = /^RaiseEvent\s+(.+)$/i.exec(text))) return 'RaiseEvent ' + emit(f.parseCall(m[1], {explicit: true}));
    const assignment = assignmentParts(text.replace(/^(?:Let|Set)\s+/i,''), f);
    if (assignment) {
      if ((m = /^(LSet|RSet)\s+(.+)$/i.exec(assignment[0]))) {
        const target = emit(E(m[2])); return `${target} = ${R}AlignString(${emit(E(assignment[1]))}, Len(${target}), ${/^rset$/i.test(m[1])?'True':'False'})`;
      }
      let target;
      try { target = E(assignment[0]); } catch { /* A bare call may contain a comparison argument. */ }
      if (target?.kind === 'call' && target.callee.kind === 'id' && keyOf(target.callee.name) === 'mid') {
        if (target.args.length < 2 || target.args.length > 3) return unsupportedStatement(text,c);
        return `${R}MidAssign(${emit(target.args[0])}, CInt(${emit(target.args[1])}), ${target.args[2] ? 'CInt(' + emit(target.args[2]) + ')' : '-1'}, ${emit(E(assignment[1]))})`;
      }
      if (target && ['id','member','call'].includes(target.kind)) return emitAssignment(target,E(assignment[1]),c,{objectSet:/^Set\b/i.test(text)});
    }
    const call = f.parseCall(text.replace(/^Call\s+/i,''), {explicit: /^Call\s+/i.test(text)});
    if (call?.kind === 'call') return emit(call);
    return unsupportedStatement(text,c);
  }
  const declarationsForRedim = [];
  for (const entry of p.body) {
    c.line = entry.line;
    try {
      if (entry.label) {
        const name = f.parseLabel(entry.text.replace(/:$/,''));
        if (c.labels.has(keyOf(name))) c.error('VBM2104','Duplicate label: ' + name);
        c.labels.add(keyOf(name)); append(/^\d+$/.test(name) ? name + ':' : identifier(name) + ':');
      } else append(statement(entry.text));
    } catch (error) { append(unsupportedStatement(entry.text,c,'VBM2101')); c.error('VBM2101',error.message,{original:entry.text}); }
  }
  if (scopes.length) c.error('VBM2102','Unterminated blocks: ' + scopes.map(s=>s.kind).join(', '));
  for (const label of c.labelReferences) if (!c.labels.has(label)) c.error('VBM2105','Missing label: ' + label);
  const prefix = [];
  if (returnsValue) prefix.push(`Dim ${c.resultName} As ${typeName(p.returnType,c)} = ${keyOf(p.returnType)==='string'?'String.Empty':'Nothing'}`);
  for (const item of declarations) { c.line = item.line; prefix.push(emitDeclaration(item.d,c,item.static?'Static':'Dim')); }
  for (const d of [...declarationsForRedim,...c.implicit]) prefix.push(emitDeclaration(d,c));
  if (c.hasGoSub) prefix.push(`Dim ${c.returnStack} As New Global.System.Collections.Generic.Stack(Of Integer)()`);
  if (c.hasGoSub) {
    append(['GoTo ' + c.exitLabel, c.dispatchLabel + ':', `If ${c.returnStack}.Count = 0 Then Global.Microsoft.VisualBasic.Information.Err().Raise(3)`, 'Select Case ' + c.returnStack + '.Pop()', ...c.returnSites.flatMap(site=>['Case ' + site.number,'GoTo ' + site.label]), 'End Select', c.exitLabel + ':']);
  }
  if (returnsValue) append('Return ' + c.resultName);
  return [...prefix.map(text=>({text,line:p.line})),...lines];
}

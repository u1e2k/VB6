import {keyOf, identifier, qualifiedName, vbString} from './contracts.js';
import {typeName, NUMERIC_TYPES} from './types.js';
import {INTRINSICS, CONSTANTS, PROPERTY_INTRINSICS} from './intrinsics.js';
import {controlSymbol, controlMember, controlCall, controlDefault} from './control-expressions.js';
import {callArguments, explicitOptionalArguments} from './calls.js';

const runtime = 'Global.Vb6Migration.Runtime.VbRuntime.';
const binaryMethods = Object.freeze({'+': 'Add', '-': 'Subtract', '*': 'Multiply', '/': 'Divide', '\\': 'IntegerDivide', mod: 'Modulo', '^': 'Power', '&': 'Concatenate', '=': 'Equal', '<>': 'NotEqual', '<': 'Less', '>': 'Greater', '<=': 'LessEqual', '>=': 'GreaterEqual', and: 'BitAnd', or: 'BitOr', xor: 'BitXor', eqv: 'Eqv', imp: 'Imp', like: 'Like'});
const memberTypes = {caption: 'String', text: 'String', name: 'String', tag: 'Variant', enabled: 'Boolean', visible: 'Boolean', value: 'Variant', left: 'Single', top: 'Single', width: 'Single', height: 'Single', scalewidth: 'Single', scaleheight: 'Single', listindex: 'Integer', listcount: 'Integer', hwnd: 'Long'};

export function expressionSymbol(node, context) {
  if (node?.kind === 'id') return context.resolve(node.name);
  if (node?.kind === 'group') return expressionSymbol(node.expr, context);
  if (node?.kind === 'member') {
    const owner = node.object.kind === 'id' && context.moduleSymbols.get(keyOf(node.object.name));
    if (owner) return owner.get(keyOf(node.name));
    const objectType = expressionType(node.object, context), module = context.moduleSymbols.get(keyOf(objectType));
    if (module) return module.get(keyOf(node.name));
    const structure = context.types.get(keyOf(objectType));
    if (structure?.kind === 'type') return structure.members.find(m => keyOf(m.name) === keyOf(node.name));
  }
  if (node?.kind === 'call') return expressionSymbol(node.callee, context);
  return null;
}
export function expressionType(node, context) {
  if (!node) return 'Variant';
  switch (node.kind) {
    case 'literal': return node.valueType || (node.value === null ? 'Null' : typeof node.value === 'string' ? 'String' : 'Double');
    case 'currency': return 'Currency'; case 'date': return 'Date'; case 'empty': return 'Empty'; case 'nothing': return 'Object';
    case 'group': case 'named': case 'byval': return expressionType(node.expr, context);
    case 'new': return node.name;
    case 'typeof': return 'Boolean';
    case 'unary': return expressionType(node.expr, context);
    case 'id': {
      if (keyOf(node.name) === 'me') return context.module.name;
      const symbol = context.resolve(node.name);
      return symbol?.type || PROPERTY_INTRINSICS[keyOf(node.name)]?.type || INTRINSICS.get(keyOf(node.name))?.type || (CONSTANTS[keyOf(node.name)] ? 'Long' : 'Variant');
    }
    case 'member': return expressionSymbol(node, context)?.type || (controlSymbol(node.object, context) ? memberTypes[keyOf(node.name)] : null) || 'Variant';
    case 'call': {
      const symbol = expressionSymbol(node.callee, context);
      if (symbol?.bounds !== null && symbol?.bounds !== undefined) return symbol.type;
      return symbol?.type || (node.callee.kind === 'id' ? INTRINSICS.get(keyOf(node.callee.name))?.type : null) || 'Variant';
    }
    case 'binary': {
      const a = keyOf(expressionType(node.left, context)), b = keyOf(expressionType(node.right, context));
      if (['variant', 'object', 'null', 'empty'].includes(a) || ['variant', 'object', 'null', 'empty'].includes(b)) return 'Variant';
      if (['=', '<>', '<', '>', '<=', '>=', 'is', 'like'].includes(node.op)) return 'Boolean';
      if (node.op === '&' || node.op === '+' && a === 'string' && b === 'string') return 'String';
      if (node.op === '^' || node.op === '/') return a === 'currency' && b === 'currency' && node.op === '/' ? 'Currency' : 'Double';
      if (['and', 'or', 'xor', 'eqv', 'imp'].includes(node.op) && a === 'boolean' && b === 'boolean') return 'Boolean';
      const order = ['byte', 'integer', 'long', 'currency', 'single', 'double']; return order[Math.max(order.indexOf(a), order.indexOf(b), 0)];
    }
  }
  return 'Variant';
}
function numericLiteral(node) {
  if (node.valueType === 'boolean') return node.value ? 'True' : 'False';
  if (node.value === null) return 'Global.System.DBNull.Value';
  if (typeof node.value === 'string') return vbString(node.value);
  if (!Number.isFinite(node.value)) throw new Error('Non-finite numeric literal');
  const type = keyOf(node.valueType || 'Double'), suffix = {integer: 'S', long: 'I', single: 'F', double: 'R'}[type] || 'R';
  return String(node.value) + suffix;
}
function symbolName(symbol, context) {
  const name = identifier(symbol.name);
  const prefix = symbol.owner && symbol.owner !== context.module.name ? identifier(symbol.owner) + '.' : '';
  if (symbol.category === 'enum') return prefix + identifier(symbol.enumName) + '.' + name;
  return prefix + name + (symbol.autoNew ? '.Value' : '');
}

export function emitExpression(node, context, mode = {}) {
  if (!node) return 'Nothing';
  const custom = context.registry.dispatch('expression', node, {...context, mode, emit: (n, m) => emitExpression(n, context, m)});
  if (custom !== undefined) return custom;
  const emit = (n, m = {}) => emitExpression(n, context, m);
  switch (node.kind) {
    case 'literal': return numericLiteral(node);
    case 'currency': return node.value.replace(/[dD]/, 'E') + 'D';
    case 'date': return `Global.Vb6Migration.Runtime.VbRuntime.DateLiteral(${vbString(node.value)})`;
    case 'empty': return 'Nothing';
    case 'nothing': return 'Nothing';
    case 'missing': return '';
    case 'named': return identifier(node.name) + ':=' + emit(node.expr, mode);
    case 'group': case 'byval': return '(' + emit(node.expr, mode) + ')';
    case 'with': return context.withStack.length ? context.withStack.at(-1) : (context.error('VBM2004', 'Member access outside With'), 'Me');
    case 'new': return `New ${typeName(node.name, context)}()`;
    case 'addressOf': return 'AddressOf ' + qualifiedName(node.name);
    case 'typeof': return `TypeOf ${emit(node.expr, {object: true})} Is ${typeName(node.name, context)}`;
    case 'id': {
      const key = keyOf(node.name);
      if (key === 'me') return 'Me';
      if (context.resultName && context.procedure && key === keyOf(context.procedure.name) && !mode.callee) return context.resultName;
      let symbol = context.resolve(node.name);
      if (symbol) {
        if (symbol.category === 'control' && !mode.object && !mode.callee && !mode.lvalue) {
          const value = controlDefault(node, context, emit); if (value !== undefined) return value;
        }
        return symbolName(symbol, context) + (symbol.category === 'procedure' && (symbol.kind !== 'property' || explicitOptionalArguments(symbol)) && !mode.callee ? '(' + callArguments([], symbol, context, emit).join(', ') + ')' : '');
      }
      const module = context.modules.find(m => keyOf(m.name) === key);
      if (module) return identifier(module.name) + (module.predeclared && !mode.type ? '.DefaultInstance' : '');
      if (Object.hasOwn(CONSTANTS, key)) return CONSTANTS[key];
      if (Object.hasOwn(PROPERTY_INTRINSICS, key)) return PROPERTY_INTRINSICS[key].target;
      const intrinsic = INTRINSICS.get(key);
      if (intrinsic) { if (intrinsic.runtime) context.use('values'); return intrinsic.target + (mode.callee ? '' : '()'); }
      if (key === 'app') { context.use('application'); return 'Global.Vb6Migration.Runtime.VbApplication'; }
      symbol = context.implicitSymbol(node.name); return symbol ? symbolName(symbol, context) : identifier(node.name);
    }
    case 'member': {
      const special = controlMember(node, context, emit); if (special !== undefined) return special;
      const owner = node.object.kind === 'id' ? keyOf(node.object.name) : '';
      if (owner === 'debug') return 'Global.System.Diagnostics.Debug.' + identifier(node.name);
      if (owner === 'app') { context.use('application'); return 'Global.Vb6Migration.Runtime.VbApplication.' + identifier(node.name); }
      const symbol = expressionSymbol(node, context);
      return `${emit(node.object, {object: true})}.${identifier(node.name)}` + (symbol?.category === 'procedure' && (symbol.kind !== 'property' || explicitOptionalArguments(symbol)) && !mode.callee ? '(' + callArguments([], symbol, context, emit).join(', ') + ')' : '');
    }
    case 'call': {
      const special = controlCall(node, context, emit); if (special !== undefined) return special;
      const symbol = expressionSymbol(node.callee, context);
      if (symbol?.bounds !== null && symbol?.bounds !== undefined && node.args.length === 0) return emit(node.callee, {object:true});
      const args = callArguments(node.args, symbol, context, emit);
      if (node.callee.kind === 'id' && !symbol && keyOf(node.callee.name) === 'callbyname') {
        context.use('values'); return 'Global.Microsoft.VisualBasic.Interaction.CallByName(' + args.join(', ') + ')';
      }
      return `${emit(node.callee, {callee: true, object: true})}(${args.join(', ')})`;
    }
    case 'unary': {
      const value = emit(node.expr), type = keyOf(expressionType(node.expr, context));
      if (['variant', 'object', 'null', 'empty'].includes(type)) { context.use('values'); return `${runtime}${node.op === 'not' ? 'BitNot' : node.op === '-' ? 'Negate' : 'Positive'}(${value})`; }
      return '(' + (node.op === 'not' ? 'Not ' : node.op) + value + ')';
    }
    case 'binary': {
      if (node.op === 'is') return `(${emit(node.left, {object: true})} Is ${emit(node.right, {object: true})})`;
      const a = keyOf(expressionType(node.left, context)), b = keyOf(expressionType(node.right, context));
      const left = emit(node.left), right = emit(node.right);
      if (['variant', 'object', 'null', 'empty'].includes(a) || ['variant', 'object', 'null', 'empty'].includes(b) || ['imp', 'eqv'].includes(node.op)) {
        context.use('values'); const method = binaryMethods[node.op];
        if (!method) { context.error('VBM2005', 'Unmapped operator: ' + node.op); return 'Nothing'; }
        const compare = ['=', '<>', '<', '>', '<=', '>=', 'like'].includes(node.op) ? ', ' + (context.module.optionCompare === 'Text' ? 'True' : 'False') : '';
        return `${runtime}${method}(${left}, ${right}${compare})`;
      }
      const expression = `(${left} ${node.op === 'mod' ? 'Mod' : node.op === 'like' ? 'Like' : node.op === 'and' ? 'And' : node.op === 'or' ? 'Or' : node.op === 'xor' ? 'Xor' : node.op} ${right})`;
      if (keyOf(expressionType(node, context)) === 'currency') { context.use('currency'); return `${runtime}Currency(${expression})`; }
      if (['+', '-', '*', '\\', 'mod'].includes(node.op)) { const t = keyOf(expressionType(node, context)); if (t === 'integer') return 'CShort(' + expression + ')'; if (t === 'long') return 'CInt(' + expression + ')'; }
      return expression;
    }
  }
  context.error('VBM2006', 'No expression rule for ' + node.kind); return 'Nothing';
}
export function condition(node, context) {
  const type = keyOf(expressionType(node, context));
  return type === 'boolean' ? emitExpression(node, context) : `${runtime}IsTrue(${emitExpression(node, context)})`;
}
export function convertValue(value, type, context) {
  const target = keyOf(type || 'Variant');
  const method = {byte: 'ToByte', boolean: 'ToBoolean', integer: 'ToInt16', long: 'ToInt32', single: 'ToSingle', double: 'ToDouble', currency: 'Currency', date: 'ToDate', string: 'ToText'}[target];
  if (method) { context.use('values'); return runtime + method + '(' + value + ')'; }
  if (['object', 'variant'].includes(target)) return value;
  return `CType(${value}, ${typeName(type, context)})`;
}
export function emitAssignment(target, value, context, {objectSet = false} = {}) {
  const emit = (n, m) => emitExpression(n, context, m);
  const result = emit(value, {object: objectSet}), symbol = expressionSymbol(target, context);
  if (target.kind === 'member') { const mapped = controlMember(target, context, emit, result); if (mapped !== undefined) return mapped; }
  const control = controlSymbol(target, context);
  if (control && !objectSet) {
    const defaults = {Label: 'Caption', TextBox: 'Text', CommandButton: 'Value', CheckBox: 'Value', OptionButton: 'Value', ComboBox: 'Text', ListBox: 'Text', HScrollBar: 'Value', VScrollBar: 'Value', ProgressBar: 'Value', Slider: 'Value', RichTextBox: 'Text', UpDown: 'Value'};
    if (defaults[control.type]) return controlMember({kind: 'member', object: target, name: defaults[control.type]}, context, emit, result);
  }
  const left = emit(target, {lvalue: true, object: objectSet});
  let expression = objectSet ? result : convertValue(result, symbol?.type || expressionType(target, context), context);
  if (symbol?.fixedLength || symbol?.fixedLengthExpression) expression = `${runtime}FixedString(${expression}, ${symbol.fixedLength || emit(symbol.fixedLengthExpression)})`;
  if (symbol?.bounds !== null && symbol?.bounds !== undefined && target.kind !== 'call') { context.use('arrays'); expression = `${runtime}CloneArray(${result})`; }
  return left + ' = ' + expression;
}

import {parseExpression} from '../language/expression.js';
import {findKeyword} from '../language/source-scanner.js';
import {splitTop} from '../language/lexer.js';
import {key, vbString} from './names.js';
import {expression} from './expressions.js';

export function caseClauses(text) {
  return splitTop(text).map(part => {
    const to = findKeyword(part, 'to');
    const compare = /^Is\s*(<=|>=|<>|=|<|>)\s*(.+)$/i.exec(part);
    if (to) return {kind: 'range', lower: parseExpression(part.slice(0, to.start)), upper: parseExpression(part.slice(to.end))};
    return {kind: 'compare', operator: compare?.[1] || '=', value: parseExpression(compare ? compare[2] : part)};
  });
}

// Constant numeric endpoints have no observable evaluation effects. Dynamic
// endpoints retain eager compatibility comparisons even when the selector is typed.
function numericConstant(node, context) {
  if (node?.kind === 'group' || node?.kind === 'unary' && ['+', '-'].includes(node.op)) return numericConstant(node.expr, context);
  if (node?.kind === 'literal') return typeof node.value === 'number' && Number.isFinite(node.value);
  if (node?.kind === 'id' && context.find(node.name)?.constant) return typeof context.constants.get(key(node.name)) === 'number';
  return false;
}

/** Decide per Select block, including Variant Case operands and eager VB6 range endpoints. */
export function planSelections(context) {
  const plans = new Map(), stack = [];
  const dynamic = node => ['variant', 'object'].includes(key(context.type(node)));
  for (const statement of context.proc.statements || []) {
    if (statement.label) continue;
    const text = statement.text.trim();
    let match;
    try {
      if ((match = /^Select\s+Case\s+(.+)$/i.exec(text))) {
        const selector = parseExpression(match[1]);
        const plan = {selector, variant: dynamic(selector)};
        stack.push(plan); plans.set(statement, plan);
      } else if ((match = /^Case\s+(.+)$/i.exec(text)) && !/^Else$/i.test(match[1]) && stack.length) {
        const plan = stack.at(-1);
        const nativeRange = clause => context.options.codeStyle === 'native' &&
          ['byte','integer','long','single','double'].includes(key(context.type(plan.selector))) &&
          numericConstant(clause.lower, context) && numericConstant(clause.upper, context);
        plan.variant ||= caseClauses(match[1]).some(clause => clause.kind === 'range' ? !nativeRange(clause) : dynamic(clause.value));
      } else if (/^End\s+Select$/i.test(text)) stack.pop();
    } catch {
      // The actual emitter reports malformed source with its physical location.
    }
  }
  return plans;
}

export function emitCaseClause(text, selection, context) {
  if (/^Else$/i.test(text)) return 'Else';
  const emit = node => expression(node, context);
  const compare = (operator, value) => context.runtime('VbVariant.Truth')+'('+context.runtime('VbVariant.Binary')+'(' + vbString(operator) + ', ' + selection.name + ', ' + emit(value) + ', ' + (context.module.optionCompare === 'text' ? 'True' : 'False') + '))';
  return caseClauses(text).map(clause => {
    if (selection.variant) {
      return clause.kind === 'range' ? '(' + compare('>=', clause.lower) + ' And ' + compare('<=', clause.upper) + ')' : compare(clause.operator, clause.value);
    }
    return clause.kind === 'range' ? emit(clause.lower) + ' To ' + emit(clause.upper) : (clause.operator === '=' ? '' : 'Is ' + clause.operator + ' ') + emit(clause.value);
  }).join(', ');
}

export function emitForHeader(header, context) {
  const emit = node => expression(node, context);
  const name = emit(parseExpression(header.name));
  if (header.kind === 'each') return 'For Each ' + name + ' In ' + emit(header.expr);
  const currency = key(context.type(parseExpression(header.name))) === 'currency';
  const bound = node => currency ? (context.decimalCurrency?'CDec':context.runtime('VbCurrency.FromObject'))+'(' + emit(node) + ')' : emit(node);
  // VbCurrency implements +, -, >= and <=, so the VB compiler handles cached bounds,
  // descending/zero steps, counter mutation, nested Next and Exit For natively.
  return 'For ' + name + ' = ' + bound(header.start) + ' To ' + bound(header.end) + ' Step ' + bound(header.step);
}

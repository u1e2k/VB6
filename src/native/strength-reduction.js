/** Exact signed IA-32 division/remainder by a constant power of two.
 * EAX is the dividend/result; EDX is scratch. No memory or stack is touched.
 * Rounding is towards zero, not SAR's rounding towards minus infinity.
 * Only division by -1 can overflow; Mod -1 must return zero even for LONG_MIN.
 */
export function nativePowerOfTwoDivisor(value) {
  if (!Number.isInteger(value) || value === 0 || value < -2147483648 || value > 2147483647) return null;
  const magnitude = Math.abs(value), shift = Math.log2(magnitude);
  return Number.isInteger(shift) ? {shift, negative:value < 0, mask:magnitude - 1} : null;
}

/** Return false without emitting anything when the operation is not supported. */
export function emitNativePowerOfTwoDivision(x, operation, divisor) {
  const plan = nativePowerOfTwoDivisor(divisor);
  if (!plan || !['\\', 'mod'].includes(operation)) return false;
  if (!plan.shift) {
    if (operation === 'mod') x.mov('eax', 0);
    else if (plan.negative) x.neg('eax').branch('o', 'error:6');
    return true;
  }
  // bias = dividend < 0 ? abs(divisor) - 1 : 0. This addition cannot overflow.
  x.mov('edx', 'eax').shift('sar', 'edx', 31).shift('shr', 'edx', 32 - plan.shift).add('eax', 'edx');
  if (operation === 'mod') x.and('eax', plan.mask).sub('eax', 'edx');
  else {
    x.shift('sar', 'eax', plan.shift);
    if (plan.negative) x.neg('eax');
  }
  return true;
}

/** Pure right operands may simplify the operation, never evaluation of its left
 * operand. The caller has already emitted the left expression (and its errors).
 */
export function emitNativeIntegerIdentity(x, operation, value) {
  if ((['+', '-', 'or', 'xor'].includes(operation) && value === 0) ||
      (operation === '*' && value === 1) || (operation === 'and' && value === -1)) return true;
  if ((['*', 'and'].includes(operation) && value === 0) || (operation === 'or' && value === -1)) {
    x.mov('eax', operation === 'or' ? -1 : 0); return true;
  }
  return false;
}

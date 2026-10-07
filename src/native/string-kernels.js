/** Counted binary equality over ESI/EDI pointers and ECX elements. Returns 0/1
 * in EAX, advances both pointers, consumes ECX, and leaves DF clear. Empty
 * ranges are equal and never dereferenced. Caller owns valid bounded memory.
 */
export function emitNativeCountedEqual(x,width=16) {
  if(![8,16,32].includes(width))throw new Error('Counted comparison width must be 8, 16 or 32');
  const empty=x.unique('counted-empty'),done=x.unique('counted-done');
  x.cld().testOperand('ecx','ecx').branch('e',empty).repCompare(width).setcc('e','al').movzx('eax','al').jump(done);
  x.label(empty).mov('eax',1).label(done);
}

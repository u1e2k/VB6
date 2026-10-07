const TYPES = Object.freeze({byte: 'Byte', boolean: 'Boolean', integer: 'Short', long: 'Integer',
  single: 'Single', double: 'Double', currency: 'VbCurrency', date: 'Date', string: 'String',
  variant: 'Object', object: 'Object', any: 'IntPtr'});
export const key = value => String(value).replace(/[$%&!#@]$/, '').toLowerCase();
export function identifier(value) {
  const name = String(value).replace(/^\[|\]$/g, '').replace(/[$%&!#@]$/, '');
  if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name)) throw new TypeError('Identifier cannot be represented safely in VB.NET: ' + value);
  return '[' + name + ']';
}
export const qualified = value => String(value).split('.').map(identifier).join('.');
export function typeName(type = 'Variant', interfaces = new Set()) {
  const name = TYPES[key(type)];
  return name || (interfaces.has(key(type)) ? identifier('I' + type) : qualified(type));
}
export function vbString(value) {
  // VB strings do not allow physical newlines or embedded NUL in source literals.
  const parts = String(value).split(/([\x00-\x1f\u2028\u2029])/);
  return parts.filter(Boolean).map(p => p.length === 1 && /[\x00-\x1f\u2028\u2029]/.test(p)
    ? 'Global.Microsoft.VisualBasic.ChrW(' + p.charCodeAt(0) + ')' : '"' + p.replace(/"/g, '""') + '"').join(' & ') || '""';
}
export function xml(value) { return String(value).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c])); }
export function safeFileName(value) {
  const name = String(value).normalize('NFC').replace(/[^\p{L}\p{N}_.-]/gu, '_').replace(/[. ]+$/, '');
  if (!name || name === '.' || name === '..' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new TypeError('Unsafe project/file name: ' + value);
  return name;
}
export class CodeWriter {
  constructor(path) { this.path = path; this.lines = []; this.indent = 0; this.mappings = []; }
  line(text = '', location) {
    for (const value of String(text).split('\n')) {
      this.lines.push(value ? '    '.repeat(this.indent) + value : '');
      if (location) this.mappings.push({generatedFile: this.path, generatedLine: this.lines.length, source: location.source, sourceLine: location.line || 1});
    }
  }
  open(text, location) { this.line(text, location); this.indent++; }
  close(text, location) { this.indent = Math.max(0, this.indent - 1); this.line(text, location); }
  toString() { return this.lines.join('\n') + '\n'; }
}

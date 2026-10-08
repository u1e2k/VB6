/** XAML syntax uses UTF-16 offsets, like JavaScript strings and LSP positions.
 * Parsing never creates DOM objects, resolves URLs, executes code or expands DTDs.
 */
export const XAML_NS = 'http://schemas.microsoft.com/winfx/2006/xaml';
export const PRESENTATION_NS = 'http://schemas.microsoft.com/winfx/2006/xaml/presentation';
export const XML_NS = 'http://www.w3.org/XML/1998/namespace';
export const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
export const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
export const DESIGN_NS = 'http://schemas.microsoft.com/expression/blend/2008';
const startChar = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}]/u;
const nameChar = /[:_A-Za-z0-9.\-\u00B7\u0300-\u036F\u203F-\u2040\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}]/u;
export const xmlSpace = value => /^[\x20\t\r\n]*$/.test(value);
export const qualifiedName = name => { const parts = String(name).split(':'); return {prefix: parts.length > 1 ? parts[0] : '', localName: parts.at(-1)}; };
export const validXmlChar = cp => cp === 9 || cp === 10 || cp === 13 || cp >= 32 && cp <= 0xD7FF || cp >= 0xE000 && cp <= 0xFFFD || cp >= 0x10000 && cp <= 0x10FFFF;
export function isXmlName(name) {
  const chars = Array.from(String(name));
  return !!chars.length && startChar.test(chars[0]) && chars.slice(1).every(c => nameChar.test(c)) && !/^:|:$/.test(name) && name.split(':').length <= 2;
}
export class SourceText {
  constructor(text, uri = '') {
    this.text = String(text); this.uri = uri; this.lineStarts = [0];
    for (let i = 0; i < this.text.length; i++) {
      if (this.text[i] === '\r') { if (this.text[i + 1] === '\n') i++; this.lineStarts.push(i + 1); }
      else if (this.text[i] === '\n') this.lineStarts.push(i + 1);
    }
  }
  positionAt(offset) {
    offset = Math.max(0, Math.min(this.text.length, offset));
    let lo = 0, hi = this.lineStarts.length;
    while (lo + 1 < hi) { const m = (lo + hi) >>> 1; if (this.lineStarts[m] <= offset) lo = m; else hi = m; }
    return {line: lo, character: offset - this.lineStarts[lo]};
  }
  offsetAt(position) {
    const line = Math.max(0, Math.min(this.lineStarts.length - 1, position.line));
    let end = this.lineStarts[line + 1] ?? this.text.length;
    while (end > this.lineStarts[line] && /[\r\n]/.test(this.text[end - 1])) end--;
    return Math.min(end, this.lineStarts[line] + Math.max(0, position.character));
  }
  range(start, end = start) { return {start: this.positionAt(start), end: this.positionAt(end)}; }
}
export function diagnostic(source, code, message, start = 0, end = start + 1, severity = 'error') {
  start = Math.max(0, Math.min(source.text.length, start)); end = Math.max(start, Math.min(source.text.length, end));
  const range = source.range(start, end);
  return {code, message, severity, start, end, range, line: range.start.line + 1, column: range.start.character + 1, uri: source.uri};
}
export function decodeXml(value, report = () => {}, offset = 0, attribute = false) {
  const entities = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"};
  return String(value).replace(/&(?:[^;&\s<]*;?)|\r\n|[\r\n\t]|[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, (token, index) => {
    if (token[0] !== '&') {
      if (!validXmlChar(token.codePointAt(0))) { report('XAML0002', 'Invalid XML character.', offset + index, offset + index + token.length); return '\uFFFD'; }
      return attribute ? ' ' : token[0] === '\r' ? '\n' : token;
    }
    const name = token.slice(1, -1);
    if (token.endsWith(';') && Object.hasOwn(entities, name)) return entities[name];
    const match = token.endsWith(';') && /^(?:#([0-9]+)|#x([0-9a-fA-F]+))$/.exec(name);
    if (match) { const cp = Number.parseInt(match[1] ?? match[2], match[1] ? 10 : 16); if (validXmlChar(cp)) return String.fromCodePoint(cp); }
    report('XAML0003', 'Invalid or undeclared XML entity ' + token + '.', offset + index, offset + index + token.length); return token;
  });
}
export function escapeXml(value, attribute = true) {
  return String(value).replace(attribute ? /[&<>"\r\n\t]/g : /[&<>\r]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\r': '&#13;', '\n': '&#10;', '\t': '&#9;'}[c]));
}
export function parseXaml(text, options = {}) {
  const source = new SourceText(text, options.uri), diagnostics = [], tokens = [], elements = [];
  const document = {kind: 'Document', source, children: [], elements, tokens, diagnostics, start: 0, end: source.text.length, root: null};
  const input = source.text, maxLength = options.maxLength ?? 2_000_000, maxNodes = options.maxNodes ?? 50_000, maxDepth = options.maxDepth ?? 256;
  const report = (code, message, start, end) => { if (diagnostics.length < 200) diagnostics.push(diagnostic(source, code, message, start, end)); };
  if (input.length > maxLength) { report('XAML0004', 'XAML source exceeds the configured size limit.', 0, input.length); return document; }
  let pos = input.charCodeAt(0) === 0xFEFF ? 1 : 0, count = 0;
  const stack = [], initialNamespaces = Object.assign(Object.create(null), {xml: XML_NS});
  const add = node => { (stack.at(-1)?.children ?? document.children).push(node); if (++count > maxNodes) { report('XAML0004', 'XAML node limit exceeded.', pos); pos = input.length; } return node; };
  const token = (kind, start, end) => { if (end > start) tokens.push({kind, start, end}); };
  const space = () => { while (pos < input.length && /[\x20\t\r\n]/.test(input[pos])) pos++; };
  const name = () => {
    const start = pos; if (!startChar.test(String.fromCodePoint(input.codePointAt(pos) ?? 0))) return '';
    pos += input.codePointAt(pos) > 0xFFFF ? 2 : 1;
    while (pos < input.length && nameChar.test(String.fromCodePoint(input.codePointAt(pos)))) pos += input.codePointAt(pos) > 0xFFFF ? 2 : 1;
    const value = input.slice(start, pos); if (!isXmlName(value)) report('XAML0005', 'Invalid qualified XML name.', start, pos); return value;
  };
  const delimited = (kind, open, close) => {
    const start = pos, contentStart = pos + open.length, index = input.indexOf(close, contentStart), end = index < 0 ? input.length : index + close.length;
    if (index < 0) report('XAML0006', 'Unterminated ' + kind + '.', start, end);
    const value = input.slice(contentStart, index < 0 ? end : index);
    if (kind === 'Comment' && (value.includes('--') || value.endsWith('-'))) report('XAML0007', 'XML comments cannot contain -- or end in -.', start, end);
    pos = end; token(kind, start, end); add({kind, start, end, value, contentStart});
  };
  while (pos < input.length) {
    options.signal?.throwIfAborted();
    const start = pos;
    if (input[pos] !== '<') {
      const end = input.indexOf('<', pos); pos = end < 0 ? input.length : end;
      const raw = input.slice(start, pos), value = decodeXml(raw, report, start);
      if (raw.includes(']]>')) report('XAML0007', ']]> is not allowed in XML text.', start, pos);
      token('Text', start, pos); add({kind: 'Text', start, end: pos, value}); continue;
    }
    if (input.startsWith('<!--', pos)) { delimited('Comment', '<!--', '-->'); continue; }
    if (input.startsWith('<![CDATA[', pos)) { delimited('CData', '<![CDATA[', ']]>'); continue; }
    if (input.startsWith('<?', pos)) { delimited('ProcessingInstruction', '<?', '?>'); continue; }
    if (input.startsWith('<!', pos)) {
      // Skip declarations without entity expansion, including quoted/internal subsets.
      let quote = '', depth = 0; pos += 2;
      while (pos < input.length) { const c = input[pos++]; if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c; else if (c === '[') depth++; else if (c === ']') depth--; else if (c === '>' && depth <= 0) break; }
      report('XAML0008', 'DTD and entity declarations are not supported.', start, pos); token('Invalid', start, pos); continue;
    }
    if (input.startsWith('</', pos)) {
      pos += 2; token('Delimiter', start, pos); const nameStart = pos, closeName = name(); token('Type', nameStart, pos); space();
      if (input[pos] === '>') pos++; else { report('XAML0009', 'Expected > after closing tag.', pos); while (pos < input.length && input[pos] !== '<' && input[pos] !== '>') pos++; if (input[pos] === '>') pos++; }
      let match = stack.length - 1; while (match >= 0 && stack[match].name !== closeName) match--;
      if (match < 0) report('XAML0010', 'Unexpected closing element ' + closeName + '.', start, pos);
      else { while (stack.length - 1 > match) { const missing = stack.pop(); missing.end = start; report('XAML0011', 'Missing closing tag for ' + missing.name + '.', missing.start, missing.openEnd); }
        const node = stack.pop(); node.closeStart = start; node.closeNameStart = nameStart; node.closeNameEnd = nameStart + closeName.length; node.end = pos; }
      continue;
    }
    pos++; token('Delimiter', start, pos); const nameStart = pos, nodeName = name();
    if (!nodeName) { report('XAML0005', 'Expected an element name.', start, pos); continue; }
    token('Type', nameStart, pos);
    const node = {kind: 'Element', name: nodeName, ...qualifiedName(nodeName), start, nameStart, nameEnd: pos, openEnd: pos, closeStart: pos, end: pos, selfClosing: false, attributes: [], children: [], namespaces: Object.assign(Object.create(null), stack.at(-1)?.namespaces ?? initialNamespaces)};
    add(node); elements.push(node);
    while (pos < input.length) {
      const beforeSpace = pos; space();
      if (input.startsWith('/>', pos)) { pos += 2; node.selfClosing = true; break; }
      if (input[pos] === '>') { pos++; break; }
      if (input[pos] === '<') { report('XAML0012', 'Unterminated opening tag.', start, pos); break; }
      if (beforeSpace === pos) report('XAML0013', 'Attributes must be separated by whitespace.', pos);
      const attrStart = pos, attrName = name();
      if (!attrName) { report('XAML0005', 'Expected an attribute name.', pos); pos++; continue; }
      const nameEnd = pos; token('Property', attrStart, pos); space();
      if (input[pos] !== '=') report('XAML0014', 'Expected = after attribute name.', pos); else pos++;
      space(); const quote = input[pos]; let valueStart = pos, valueEnd = pos;
      if (quote === '"' || quote === "'") { pos++; valueStart = pos; while (pos < input.length && input[pos] !== quote && input[pos] !== '<') pos++; valueEnd = pos;
        if (input[pos] === quote) pos++; else report('XAML0015', 'Unterminated attribute value.', valueStart, pos);
      } else { report('XAML0015', 'Attribute values must be quoted.', pos); while (pos < input.length && !/[\s<>]/.test(input[pos]) && !input.startsWith('/>', pos)) pos++; valueEnd = pos; }
      const rawValue = input.slice(valueStart, valueEnd), value = decodeXml(rawValue, report, valueStart, true);
      const attr = {kind: 'Attribute', name: attrName, ...qualifiedName(attrName), start: attrStart, end: pos, nameStart: attrStart, nameEnd, valueStart, valueEnd, quote, rawValue, value};
      node.attributes.push(attr); token('String', valueStart, valueEnd);
      if (attrName === 'xmlns' || attr.prefix === 'xmlns') {
        const prefix = attrName === 'xmlns' ? '' : attr.localName;
        if (prefix === 'xmlns' || value === XMLNS_NS || prefix === 'xml' && value !== XML_NS || prefix !== 'xml' && value === XML_NS || prefix && !value) report('XAML0016', 'Invalid namespace declaration.', attrStart, pos);
        else node.namespaces[prefix] = value;
      }
      if (++count > maxNodes) { report('XAML0004', 'XAML node limit exceeded.', pos); pos = input.length; }
    }
    node.openEnd = pos; node.closeStart = pos; node.end = pos; node.namespaceURI = node.namespaces[node.prefix] ?? '';
    if (node.prefix && !node.namespaceURI) report('XAML0017', 'Undeclared namespace prefix ' + node.prefix + '.', nameStart, node.nameEnd);
    const seen = new Set();
    for (const attr of node.attributes) {
      attr.namespaceURI = attr.name === 'xmlns' || attr.prefix === 'xmlns' ? XMLNS_NS : attr.prefix ? node.namespaces[attr.prefix] ?? '' : '';
      if (attr.prefix && !attr.namespaceURI) report('XAML0017', 'Undeclared namespace prefix ' + attr.prefix + '.', attr.start, attr.nameEnd);
      const key = attr.namespaceURI + '#' + attr.localName;
      if (seen.has(key)) report('XAML0018', 'Duplicate attribute ' + attr.name + '.', attr.start, attr.end); seen.add(key);
    }
    if (!node.selfClosing) {
      if (stack.length >= maxDepth) { report('XAML0004', 'XAML nesting limit exceeded.', start, pos); pos = input.length; }
      else stack.push(node);
    }
  }
  for (const node of stack) { node.end = input.length; node.closeStart = input.length; report('XAML0011', 'Missing closing tag for ' + node.name + '.', node.start, node.openEnd); }
  const roots = document.children.filter(node => node.kind === 'Element'); document.root = roots[0] ?? null;
  if (roots.length !== 1) report('XAML0019', 'A XAML document must have exactly one root element.', roots[1]?.start ?? 0, roots[1]?.openEnd ?? input.length);
  for (const node of document.children) if ((node.kind === 'Text' || node.kind === 'CData') && !xmlSpace(node.value)) report('XAML0019', 'Text is not allowed outside the root element.', node.start, node.end);
  return document;
}
/** Nested markup extensions are syntax nodes, not strings split at every comma. */
export function parseMarkupExtension(text, offset = 0) {
  text = String(text);
  const diagnostics = [], source = new SourceText(text), fail = (message, start, end) => diagnostics.push({...diagnostic(source, 'XAML0020', message, start, end), start: offset + start, end: offset + end});
  if (text.startsWith('{}')) return {kind: 'Literal', value: text.slice(2), start: offset, end: offset + text.length, diagnostics};
  if (!text.startsWith('{')) return {kind: 'Literal', value: text, start: offset, end: offset + text.length, diagnostics};
  let pos = 0;
  const skip = () => { while (/\s/.test(text[pos] ?? '') && pos < text.length) pos++; };
  const read = depth => {
    const start = pos++;
    if (depth > 64) { fail('Markup extension nesting limit exceeded.', start, text.length); pos = text.length; return {kind: 'Invalid'}; }
    skip(); const typeStart = pos; while (pos < text.length && !/[\s{},=]/.test(text[pos])) pos++;
    const name = text.slice(typeStart, pos), args = []; if (!isXmlName(name)) fail('Expected markup extension name.', typeStart, pos);
    skip();
    while (pos < text.length && text[pos] !== '}') {
      const argStart = pos; let key = null;
      // A named argument's equals sign must occur before any nested value/quote/comma.
      let look = pos; while (look < text.length && !/[=,{}'"]/.test(text[look])) look++;
      if (text[look] === '=') { key = text.slice(pos, look).trim(); if (!key || !isXmlName(key)) fail('Invalid markup argument name.', pos, look); pos = look + 1; skip(); }
      const valueStart = pos; let value;
      if (text[pos] === '{') value = read(depth + 1);
      else if (text[pos] === '"' || text[pos] === "'") {
        const quote = text[pos++], begin = pos; while (pos < text.length && text[pos] !== quote) pos++;
        value = {kind: 'Literal', value: text.slice(begin, pos), start: offset + begin, end: offset + pos};
        if (text[pos] === quote) pos++; else fail('Unterminated quoted markup argument.', begin, pos);
      } else { while (pos < text.length && text[pos] !== ',' && text[pos] !== '}') pos++; value = {kind: 'Literal', value: text.slice(valueStart, pos).trim(), start: offset + valueStart, end: offset + pos}; }
      if (key && args.some(a => a.name === key)) fail('Duplicate markup argument ' + key + '.', argStart, pos);
      args.push({name: key, value, start: offset + argStart, end: offset + pos}); skip();
      if (text[pos] === ',') { pos++; skip(); if (text[pos] === '}') fail('Expected an argument after comma.', pos - 1, pos); }
      else if (text[pos] !== '}') { fail('Expected comma or closing brace.', pos, pos + 1); if (pos < text.length) pos++; }
    }
    if (text[pos] === '}') pos++; else fail('Unterminated markup extension.', start, pos);
    return {kind: 'MarkupExtension', name, ...qualifiedName(name), arguments: args, start: offset + start, end: offset + pos};
  };
  const result = read(0); skip(); if (pos < text.length) fail('Unexpected text after markup extension.', pos, text.length);
  result.diagnostics = diagnostics; return result;
}
export function walkElements(document, callback) { for (const element of document.elements) callback(element); }
export function applyTextEdits(text, edits) {
  const ordered = [...edits].sort((a, b) => a.start - b.start || a.end - b.end); let end = 0;
  for (const edit of ordered) { if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end) || edit.start < end || edit.end < edit.start || edit.end > text.length) throw new RangeError('Invalid or overlapping text edits.'); end = edit.end; }
  for (const edit of ordered.reverse()) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return text;
}

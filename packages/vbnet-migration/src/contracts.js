/** Public, host-independent migration contracts. No source text is evaluated. */
export const MIGRATION_VERSION = '0.1.0';
export const MIGRATION_SCHEMA = 1;
export const TARGET_FRAMEWORKS = Object.freeze({portable: 'net10.0', windows: 'net10.0-windows'});

export class MigrationError extends Error {
  constructor(message, diagnostics = []) {
    super(message); this.name = 'MigrationError'; this.diagnostics = diagnostics;
  }
}

export function migrationOptions(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Migration options must be an object');
  const options = {target: 'auto', outputType: 'auto', platform: 'auto', optionStrict: false,
    allowIncomplete: false, includeOriginals: true, maxSourceBytes: 50 * 1024 * 1024,
    maxOutputBytes: 100 * 1024 * 1024, ...input};
  for (const [key, values] of Object.entries({target: ['auto', 'portable', 'windows'], outputType: ['auto', 'library', 'exe'], platform: ['auto', 'x86', 'x64', 'AnyCPU']})) {
    if (!values.includes(options[key])) throw new TypeError('Invalid migration ' + key + ': ' + options[key]);
  }
  for (const key of ['optionStrict', 'allowIncomplete', 'includeOriginals']) if (typeof options[key] !== 'boolean') throw new TypeError(key + ' must be Boolean');
  for (const key of ['maxSourceBytes', 'maxOutputBytes']) if (!Number.isSafeInteger(options[key]) || options[key] < 1 || options[key] > 512 * 1024 * 1024) throw new RangeError('Invalid ' + key);
  const constants = {VBWEB: 0, VBA7: 0, Win32: -1, Win64: options.platform === 'x64' ? -1 : 0, Mac: 0};
  for (const [name, value] of Object.entries(options.conditionalConstants || {})) {
    if (!/^[A-Za-z_]\w*$/.test(name) || !['number', 'boolean', 'string'].includes(typeof value) || typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Invalid conditional constant: ' + name);
    constants[name] = value;
  }
  return Object.freeze({...options, conditionalConstants: Object.freeze(constants)});
}

export function keyOf(name) { return String(name).replace(/^\[|\]$/g, '').replace(/[$%&!#@]$/, '').toLowerCase(); }
export function identifier(name) {
  const value = String(name).replace(/^\[|\]$/g, '').replace(/[$%&!#@]$/, '');
  if (!/^[A-Za-z_\u0080-\uffff][\w\u0080-\uffff]*$/.test(value)) throw new MigrationError('Identifier cannot be represented in VB.NET: ' + name);
  return '[' + value + ']';
}
export function qualifiedName(name) { return String(name).split('.').map(identifier).join('.'); }
export function vbString(value) {
  const parts = String(value).split(/(\r\n|\r|\n|\0)/);
  return parts.map(part => part === '\r\n' ? 'Global.Microsoft.VisualBasic.Constants.vbCrLf' : part === '\r' ? 'Global.Microsoft.VisualBasic.Constants.vbCr' : part === '\n' ? 'Global.Microsoft.VisualBasic.Constants.vbLf' : part === '\0' ? 'Global.Microsoft.VisualBasic.Constants.vbNullChar' : '"' + part.replace(/"/g, '""') + '"').join(' & ');
}
export function xml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
/** MSBuild expands properties/items before XML values are consumed. Escape those too. */
export function msbuild(value) { return xml(String(value).replace(/[%$@;?*()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())); }
export function outputName(name) {
  const value = String(name).normalize('NFC').replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 100) || 'MigratedProject';
  return /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(value) ? '_' + value : value;
}
export function checkedPath(path) {
  if (typeof path !== 'string' || !path || path.length > 512 || /[\x00-\x1f\x7f<>:"|?*]/.test(path) || /^(?:\/|\\|[A-Za-z]:)/.test(path)) throw new MigrationError('Unsafe migration output path: ' + path);
  const parts = path.replace(/\\/g, '/').split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p))) throw new MigrationError('Unsafe migration output path: ' + path);
  return parts.join('/');
}

export class DiagnosticBag {
  constructor() { this.items = []; this.keys = new Set(); }
  add(code, severity, message, location = {}, detail = {}) {
    const entry = {code, severity, message, ...location, ...detail};
    const key = JSON.stringify(entry);
    if (!this.keys.has(key)) { this.keys.add(key); this.items.push(Object.freeze(entry)); }
    return entry;
  }
  error(code, message, location, detail) { return this.add(code, 'error', message, location, detail); }
  warning(code, message, location, detail) { return this.add(code, 'warning', message, location, detail); }
  get hasErrors() { return this.items.some(d => d.severity === 'error'); }
  snapshot() { return this.items.slice().sort((a, b) => String(a.project || '').localeCompare(String(b.project || '')) || String(a.source || '').localeCompare(String(b.source || '')) || (a.line || 0) - (b.line || 0) || a.code.localeCompare(b.code)); }
}

/** Explicit extension points. A handler returns undefined to decline; false/null are results. */
export class MigrationRegistry {
  constructor(plugins = []) {
    this.handlers = new Map(); this.names = new Set();
    for (const plugin of plugins) this.register(plugin);
  }
  register(plugin) {
    if (!plugin || typeof plugin.id !== 'string' || !plugin.id || this.names.has(plugin.id)) throw new TypeError('Migration plugins need unique nonempty ids');
    this.names.add(plugin.id);
    for (const hook of ['type', 'expression', 'statement', 'declaration', 'control', 'reference', 'project', 'runtime']) {
      if (plugin[hook] === undefined) continue;
      if (typeof plugin[hook] !== 'function') throw new TypeError('Invalid plugin hook: ' + hook);
      const list = this.handlers.get(hook) || [];
      list.push({id: plugin.id, priority: Number.isFinite(plugin.priority) ? plugin.priority : 0, handle: plugin[hook]});
      list.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)); this.handlers.set(hook, list);
    }
    return this;
  }
  dispatch(hook, node, context) {
    for (const item of this.handlers.get(hook) || []) {
      const value = item.handle(node, context);
      if (value && typeof value.then === 'function') throw new TypeError('Migration hooks are synchronous: ' + item.id);
      if (value !== undefined) return value;
    }
    return undefined;
  }
}

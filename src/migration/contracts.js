/** Public, versioned migration contracts. No host, network, or filesystem access. */
export const MIGRATION_VERSION = '0.1.0';
export const MIGRATION_SCHEMA = 1;
export class MigrationError extends Error {
  constructor(message, diagnostics = []) {
    super(message); this.name = 'MigrationError'; this.diagnostics = diagnostics;
  }
}
export function diagnostic(code, message, location = {}, severity = 'error', details = {}) {
  return Object.freeze({code, severity, message, source: location.source || '',
    line: location.line || 1, column: location.column || 1, ...details});
}
export function checkAbort(signal) {
  if (signal?.aborted) throw new MigrationError('Migration cancelled.', [diagnostic('MIG_CANCELLED', 'Migration cancelled.')]);
}
export function normalizeOptions(options = {}) {
  const target = options.target || 'auto';
  if (!['auto', 'console', 'library', 'winforms'].includes(target)) throw new TypeError('target must be auto, console, library, or winforms');
  const platform = options.platform || 'x86';
  if (!['x86', 'x64', 'AnyCPU', 'arm64'].includes(platform)) throw new TypeError('Invalid target platform');
  const maxSourceBytes = options.maxSourceBytes ?? 32 * 1024 * 1024;
  if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes < 1) throw new TypeError('Invalid maxSourceBytes');
  return Object.freeze({target, platform, includeOriginals: options.includeOriginals !== false,
    includeUnresolved: options.includeUnresolved === true, maxSourceBytes,
    strict: options.strict === true, signal: options.signal,
    assemblyName: options.assemblyName, rootNamespace: options.rootNamespace ?? '',
    plugins: options.plugins || []});
}
export function validatePlugins(plugins) {
  if (!Array.isArray(plugins)) throw new TypeError('plugins must be an array');
  const ids = new Set();
  for (const plugin of plugins) {
    if (!plugin || typeof plugin.id !== 'string' || !/^[\w.-]+$/.test(plugin.id) || ids.has(plugin.id)) throw new TypeError('Plugin ids must be unique nonempty identifiers');
    ids.add(plugin.id);
    for (const hook of ['analyze', 'expression', 'statement', 'control', 'finalize']) {
      if (plugin[hook] !== undefined && typeof plugin[hook] !== 'function') throw new TypeError('Invalid plugin hook: ' + hook);
    }
  }
  return [...plugins];
}
export function invokePlugins(plugins, hook, input, context) {
  for (const plugin of plugins) {
    if (!plugin[hook]) continue;
    const result = plugin[hook](input, context);
    if (result && typeof result.then === 'function') throw new TypeError('Migration hooks are synchronous: ' + plugin.id);
    if (result !== undefined && result !== null) {
      if (['expression','statement'].includes(hook) && typeof result !== 'string') throw new TypeError('Code hooks must return strings: ' + plugin.id);
      if (hook === 'control' && (typeof result !== 'object' || typeof result.type !== 'string')) throw new TypeError('Control hooks must return a type mapping: ' + plugin.id);
      return result;
    }
  }
  return undefined;
}

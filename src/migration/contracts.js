import {runtimeFeature} from './runtime-catalog.js';
/** Public, versioned migration contracts. No host, network, or filesystem access. */
export const MIGRATION_VERSION = '0.2.0';
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
  const codeStyle = options.codeStyle ?? 'native';
  if (!['native', 'compatibility'].includes(codeStyle)) throw new TypeError('codeStyle must be native or compatibility');
  const runtime = options.runtime ?? (codeStyle === 'native' ? 'minimal' : 'project');
  if (!['none', 'minimal', 'project', 'package'].includes(runtime)) throw new TypeError('runtime must be none, minimal, project, or package');
  const semanticPolicy = options.semanticPolicy ?? 'preserve';
  if (!['preserve', 'modernize'].includes(semanticPolicy)) throw new TypeError('semanticPolicy must be preserve or modernize');
  const acceptedRules = options.acceptedRules ?? [];
  if (!Array.isArray(acceptedRules) || acceptedRules.some(rule => rule !== 'currency-decimal') || new Set(acceptedRules).size !== acceptedRules.length) throw new TypeError('acceptedRules must contain unique supported rule ids: currency-decimal');
  if (semanticPolicy === 'modernize' && !acceptedRules.length) throw new TypeError('Modernization requires at least one explicitly accepted rule');
  if (semanticPolicy === 'preserve' && acceptedRules.length) throw new TypeError('Accepted modernization rules require semanticPolicy modernize');
  const packageSpec = (value, name) => {
    if (value === undefined) return undefined;
    if (!value || typeof value !== 'object' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value.id) ||
        typeof value.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/.test(value.version)) throw new TypeError(name + ' requires a package id and explicit semantic version');
    return Object.freeze({id: value.id, version: value.version});
  };
  return Object.freeze({target, platform, codeStyle, runtime, semanticPolicy, acceptedRules: Object.freeze([...acceptedRules]),
    runtimePackage: packageSpec(options.runtimePackage, 'runtimePackage'), windowsRuntimePackage: packageSpec(options.windowsRuntimePackage, 'windowsRuntimePackage'), includeOriginals: options.includeOriginals !== false,
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
    if (plugin.representationSafe !== undefined && typeof plugin.representationSafe !== 'boolean') throw new TypeError('representationSafe must be boolean');
    if (plugin.requires !== undefined) validateRequirements(plugin.requires);
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
      const codeHook = ['expression', 'statement'].includes(hook);
      if (codeHook && typeof result !== 'string' && !(result && typeof result.code === 'string' && Array.isArray(result.requires))) throw new TypeError('Code hooks must return a string or {code, requires}: ' + plugin.id);
      const requirements = typeof result === 'object' && result.requires !== undefined ? result.requires : plugin.requires;
      if (requirements !== undefined) {
        validateRequirements(requirements);
        for (const feature of requirements) context.runtimePlan?.require(feature, context, 'Extension: ' + plugin.id);
      } else if (['expression', 'statement', 'control'].includes(hook)) context.runtimePlan?.opaque(context, plugin.id);
      if (hook === 'control' && (typeof result !== 'object' || typeof result.type !== 'string')) throw new TypeError('Control hooks must return a type mapping: ' + plugin.id);
      return codeHook && typeof result === 'object' ? result.code : result;
    }
  }
  return undefined;
}

export function validateRequirements(requirements) {
  if (!Array.isArray(requirements) || requirements.some(value => typeof value !== 'string')) throw new TypeError('Runtime requirements must be a string array');
  for (const value of requirements) runtimeFeature(value);
}

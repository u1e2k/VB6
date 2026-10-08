/** The browser may select compiler options, never host paths, tools or signing keys. */
import {macOSOptions} from './target.js';
export const MACOS_PROTOCOL = 1;
export const MACOS_LIMITS = Object.freeze({projectBytes: 20 * 1024 * 1024, archiveBytes: 256 * 1024 * 1024, expandedBytes: 512 * 1024 * 1024, files: 10000});
const compilerKeys = new Set(['name', 'arch', 'optimization', 'minimumVersion', 'bundleIdentifier', 'maxArrayElements', 'maxCallDepth']);
export function macOSBridgeURL(endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/macos') {
    throw new Error('Use the local compiler URL http://127.0.0.1:PORT/macos.');
  }
  return url.href;
}
export function normalizeMacOSBuildRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.method !== 'build' ||
      Object.keys(value).some(key => !['method', 'project', 'options'].includes(key))) throw new Error('Invalid macOS build request.');
  if (!value.project || typeof value.project !== 'object' || Array.isArray(value.project)) throw new Error('A VB6 project is required.');
  const input = value.options ?? {};
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !compilerKeys.has(key))) {
    throw new Error('Only compiler target options are accepted; host paths, signing identities and commands are not project data.');
  }
  const serialized = JSON.stringify(value.project);
  if (new TextEncoder().encode(serialized).length > MACOS_LIMITS.projectBytes) throw new Error('Project exceeds the 20 MiB compiler request limit.');
  const project = JSON.parse(serialized);
  return {project, options: macOSOptions({name: project.name, ...input})};
}

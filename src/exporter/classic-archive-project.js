import {normalizeProject} from '../project/model.js';
import {sourceFiles} from '../project/formats.js';
import {bytesOf} from '../project/native-text.js';
import {cleanProjectPath} from '../project/frx.js';
import {CLASSIC_TARGET, CLASSIC_LIMITS, normalizeClassicOptions} from './classic-options.js';
import {prepareClassicProject} from './classic-project.js';

function diagnostic(error, fallback) {
  return {severity: 'error', code: String(error.diagnostics?.[0]?.code || fallback), message: String(error.message || error)};
}
function checkedSources(input) {
  const files = Object.create(null), names = Object.keys(input);
  if (names.length > CLASSIC_LIMITS.files) throw new Error('Too many native source files for this archive.');
  let size = 0;
  for (const name of names) {
    cleanProjectPath(name);
    for (const part of name.replace(/\\/g, '/').split('/')) {
      if (/[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) throw new Error('Unsafe Windows source path: ' + name);
    }
    const bytes = bytesOf(input[name]);
    size += bytes.length;
    if (size > CLASSIC_LIMITS.executableBytes) throw new Error('Native source exceeds the 64 MiB archive limit.');
    files[name] = bytes;
  }
  return files;
}

/** Saving a project is not permission to compile it. Keep the exact project JSON
 * even when native lowering fails, and never silently delete incompatible state.
 * Only strict preflight success produces a buildable native source archive.
 */
export function prepareClassicArchiveProject(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.modules)) throw new Error('Select a valid project before downloading a build archive.');
  const snapshot = JSON.stringify(input);
  if (new TextEncoder().encode(snapshot).length > CLASSIC_LIMITS.projectBytes) throw new Error('Classic project exceeds 20 MiB.');
  const project = normalizeProject(JSON.parse(snapshot));
  const selected = normalizeClassicOptions(options, project.name);
  let files, manifest;
  try {
    const prepared = prepareClassicProject(project, selected);
    files = checkedSources(prepared.files);
    manifest = {...prepared.manifest, buildable: true, sourceStatus: 'ready', diagnostics: []};
  } catch (error) {
    manifest = {version: 1, target: CLASSIC_TARGET, arch: 'x86', runtime: 'MSVBVM60.DLL', ...selected,
      compiled: false, buildable: false, sourceStatus: 'unavailable', projectPath: null,
      diagnostics: [diagnostic(error, 'CLASSIC_PREFLIGHT')], references: [], warnings: []};
    files = Object.create(null);
    // Best-effort source is for review, never sent to the compiler. The exact
    // snapshot retains browser-only designer/data/OCX state the native writer
    // cannot encode. Do not coerce code pages or remove unsupported properties.
    try {
      files = checkedSources(sourceFiles(normalizeProject(JSON.parse(snapshot))));
      const projects = Object.keys(files).filter(name => /\.vbp$/i.test(name));
      manifest.projectPath = projects.length === 1 ? projects[0] : null;
      manifest.sourceStatus = 'requires-review';
    } catch (sourceError) {
      manifest.diagnostics.push(diagnostic(sourceError, 'CLASSIC_SOURCE_EXPORT'));
    }
    manifest.warnings.push('Compilation is blocked. Open project.vb6web in the web IDE, resolve the reported compatibility issues, then export again.');
  }
  manifest.projectSnapshot = 'project.vb6web';
  manifest.warnings.push('The archive includes the original project and its data. Review it for sensitive information before sharing.');
  return {files, manifest, snapshot};
}

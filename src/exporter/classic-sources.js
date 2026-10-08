import {decodeNativeText, bytesOf, unquote} from '../project/native-text.js';
import {parseNativeProject} from '../project/native-project.js';
import {resolveProjectPath} from '../project/frx.js';
import {classicField} from './classic-vbp.js';

function problem(code, message) {
  throw Object.assign(new Error(message), {diagnostics: [{severity: 'error', code, message}]});
}
/** VB6 reads ANSI source using the build machine's system code page. Keep the
 * imported project encoding explicit instead of guessing it again from bytes.
 */
export function classicProjectEncoding(project) {
  const document = project.nativeProject?.document;
  const encoding = new TextDecoder(document?.encoding || 'windows-1252').encoding;
  if (document?.bom || /^utf-/i.test(encoding)) {
    problem('CLASSIC_ENCODING', 'Microsoft VB6 needs an ANSI project code page, not ' + encoding + '. Re-save the project using its original Windows code page.');
  }
  return encoding;
}
/** Resolve compile-time source/resources only against the exported file set.
 * References to installed COM/type libraries are separate, consented host inputs.
 * Missing native import records must not turn into a silently incomplete EXE.
 */
export function inspectClassicSources(project, files, projectPath, encoding) {
  const text = decodeNativeText(files[projectPath], {encoding}).text;
  const metadata = parseNativeProject(text), sourceFiles = [];
  const resolve = (reference, kind) => {
    let resolved;
    try {resolved = resolveProjectPath(Object.keys(files), projectPath, reference);}
    catch (error) {problem('CLASSIC_SOURCE_PATH', 'Unsafe ' + kind + ' source reference: ' + reference + '. ' + error.message);}
    if (!resolved) problem('CLASSIC_MISSING_SOURCE', 'Missing referenced ' + kind + ' file: ' + reference + '. Include the original file before compiling.');
    sourceFiles.push({kind, path: resolved});
  };
  for (const file of metadata.files) {
    // RelatedDoc is documentation, not a compiler input. Source assets are still
    // retained by sourceFiles() without making documentation a build dependency.
    if (file.kind !== 'related') resolve(file.path, file.nativeKind);
  }
  const resource = classicField(text, 'ResFile32');
  if (resource) resolve(unquote(resource), 'resource');
  for (const module of project.modules) {
    const moduleEncoding = new TextDecoder(module.nativeSource?.encoding || module.sourceEncoding || 'windows-1252').encoding;
    const file = module.sourcePath || module.name + (module.kind === 'form' ? '.frm' : module.kind === 'class' ? '.cls' : '.bas');
    const bytes = files[file] === undefined ? null : bytesOf(files[file]);
    if (moduleEncoding !== encoding && bytes?.some(byte => byte >= 128)) {
      problem('CLASSIC_ENCODING', 'Mixed ANSI code pages: ' + file + ' uses ' + moduleEncoding + ' but the project uses ' + encoding + '. Save all native sources with one matching Windows code page.');
    }
  }
  return {encoding, sourceFiles};
}

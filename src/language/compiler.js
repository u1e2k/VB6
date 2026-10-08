import {compileProject as compileCoreProject,compileModule,validateCompiledModules,parseLeafStatement,parseDeclarations,parseParameters} from './compiler-core.js';
import {xamlBuildDiagnostics} from '../xaml/contract.js';

/** All execution/AOT callers retain the existing compiler API. Authoring gates
 * run here so HTML, the VM, Win32 and macOS cannot build a stale XAML draft. */
export function compileProject(project,options) {
  const result=compileCoreProject(project,options),diagnostics=xamlBuildDiagnostics(project);
  return diagnostics.length?{...result,diagnostics:[...diagnostics,...result.diagnostics],valid:false}:result;
}
export {compileModule,validateCompiledModules,parseLeafStatement,parseDeclarations,parseParameters};

/** Source build kits are never represented as executable downloads. */
import {compileMacOS} from './compiler.js';
import {SDK_FILES,SDK_REVISION} from './sdk-payload.js';
export function createMacOSBuildKit(project,options={}) {
  const result=compileMacOS(project,options),files={...SDK_FILES,...result.files};
  const sources=Object.keys(SDK_FILES).filter(n=>/^native\/.*\.(cpp|mm)$/.test(n)).sort();
  const headers=Object.keys(SDK_FILES).filter(n=>/^native\/.*\.hpp$/.test(n)).sort();
  const resources=Object.keys(result.files).filter(n=>n.startsWith('resources/')).sort();
  const report={...result.report,artifact:'native-source-build-kit',sdkRevision:SDK_REVISION,sourceFiles:sources.length,resources:resources.length};
  files['build.json']=JSON.stringify({version:1,target:'macos-arm64',options:result.options,sources,headers,resources,report},null,2)+'\n';
  files['package.json']=JSON.stringify({name:'vb6-macos-build-kit',private:true,type:'module',engines:{node:'>=22'}},null,2)+'\n';
  files['README.md']='# macOS Apple Silicon source build kit\n\nThis is source code, not an executable. Review it before building.\n\nOn macOS with Node.js 22+ and Xcode Command Line Tools, run:\n\n```sh\nnode build.mjs\n```\n\nThe output directory contains an arm64 Mach-O executable inside an .app bundle, an .app.zip and a build report. The default ad-hoc signature is not Developer ID signing or notarization. The generated executable embeds neither a browser nor a JavaScript engine.\n\nOptions: --out DIRECTORY, --jobs 1..16, --cache DIRECTORY, --identity SIGNING_IDENTITY, --no-zip. Existing outputs are never replaced by default; --force explicitly permits replacement.\n\nThis is an experimental native backend, not certification of complete VB6, Win32, COM or OCX compatibility. Raw native pointers are not VB6 Long handles.\n';
  return {...result,files,report};
}

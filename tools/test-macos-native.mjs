/** Execute the native target; never replace a macOS run with a mock. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildMacOSPackage} from './build-macos-native.mjs';
import {runTool,writeBuildKit,buildNativeKit} from '../packages/macos-native/src/build-driver.mjs';
import {conformanceProject} from '../packages/macos-native/tests/conformance.mjs';
const root=path.resolve(import.meta.dirname,'..');buildMacOSPackage(root);
const {compileMacOS,createMacOSBuildKit,MacOSCompilerClient,verifyMacOSAppArchive}=await import('../packages/macos-native/dist/index.js');
const sdk=path.join(root,'packages/macos-native'),native=path.join(sdk,'native');
const work=await fs.mkdtemp(path.join(os.tmpdir(),'vb6-native-test-'));
let transcript='';
const log=text=>{process.stderr.write(text);transcript+=text;if(transcript.length>16*1024*1024)transcript=transcript.slice(-16*1024*1024);};
const report={platform:process.platform,arch:process.arch,macOSExecutionVerified:false,checks:[]};
const run=async(executable,args,options={})=>{console.log('RUN',path.basename(executable),args.slice(0,4).join(' '));return runTool(executable,args,{cwd:work,timeout:180000,...options});};
const compiler=process.platform==='darwin'?await run('/usr/bin/xcrun',['--find','clang++']):execFileSync('/bin/sh',['-c','command -v clang++'],{encoding:'utf8'}).trim();
try {
  report.compiler=await run(compiler,['--version']);
  const platformFlags=process.platform==='darwin'?['-arch','arm64','-isysroot',await run('/usr/bin/xcrun',['--sdk','macosx','--show-sdk-path'])]:[];
  const flags=[...platformFlags,'-std=c++17','-O0','-g','-Wall','-Wextra','-Werror','-fsanitize=address,undefined','-I',native];
  const values=path.join(work,'values');
  await run(compiler,[...flags,path.join(sdk,'tests/values.cpp'),...['values.cpp','object.cpp','calendar.cpp'].map(n=>path.join(native,n)),'-o',values]);
  assert.match(await run(values,[]),/native value contracts passed/);report.checks.push('sanitized-values');
  const project=conformanceProject(),compiled=compileMacOS(project),source=path.join(work,'main.cpp');
  await fs.writeFile(source,compiled.files['main.cpp']);
  const runtime=(await fs.readdir(native)).filter(n=>n.endsWith('.cpp')).sort().map(n=>path.join(native,n));
  const portable=path.join(work,'portable');
  await run(compiler,[...flags,source,...runtime,path.join(sdk,'tests/portable-host.cpp'),'-o',portable]);
  assert.match(await run(portable,[]),/NATIVE_CONFORMANCE_OK/);report.checks.push('sanitized-generated-program');
  const kit=createMacOSBuildKit(project),kitDir=path.join(work,'kit');
  await writeBuildKit(kitDir,kit.files);report.checks.push('standalone-build-kit');
  report.sourceSha256=createHash('sha256').update(compiled.files['main.cpp']).digest('hex');
  if(process.platform==='darwin') {
    assert.equal(process.arch,'arm64','Native macOS CI must execute on Apple Silicon');
    const cache=path.join(work,'cache'),out=path.join(work,'out');
    const built=await buildNativeKit(kitDir,{out,cache,jobs:3,log});
    assert.equal(built.architecture,'arm64');assert.equal(built.signatureVerified,true);
    assert.match(await run(built.executable,[]),/NATIVE_CONFORMANCE_OK/);report.checks.push('signed-arm64-app-execution');
    const sdkPath=await run('/usr/bin/xcrun',['--sdk','macosx','--show-sdk-path']);
    const ui=path.join(work,'appkit-tests');
    await run(compiler,['-std=c++17','-arch','arm64','-isysroot',sdkPath,'-mmacosx-version-min=11.0','-fobjc-arc','-I',native,path.join(sdk,'tests/appkit.mm'),path.join(cache,built.runtimeSha256,'libvb6-native.a'),'-framework','AppKit','-framework','Foundation','-framework','CoreGraphics','-framework','QuartzCore','-o',ui]);
    await run('/usr/bin/codesign',['--sign','-','--timestamp=none',ui]);
    assert.match(await run(ui,[],{timeout:30000}),/APPKIT_CONFORMANCE_OK/);report.checks.push('appkit-controls-events-api');
    const reused=await buildNativeKit(kitDir,{out:path.join(work,'reused'),cache,jobs:3,log});assert.equal(reused.cacheHit,true);report.checks.push('native-cache-reuse');
    // Verify the exact signed bytes produced by ditto; do not repack the bundle.
    const archive=await verifyMacOSAppArchive(new Uint8Array(await fs.readFile(built.zip)),kit.options);
    assert.equal(archive.executableSha256,built.sha256);report.checks.push('signed-app-archive-contract');
    const {createMacOSBridge}=await import('../packages/macos-native/src/bridge.mjs');
    const origin='http://127.0.0.1:8080';let approvals=0;
    const bridge=await createMacOSBridge({port:0,origins:[origin],cache,jobs:3,
      authorize:async manifest=>{assert.equal(manifest.sourceSha256,report.sourceSha256);assert.equal(manifest.name,project.name);approvals++;return true;}});
    const client=new MacOSCompilerClient((url,options)=>fetch(url,{...options,headers:{...options.headers,Origin:origin}}));
    try {
      await client.connect(bridge.url,bridge.token);
      const response=await client.build(project);assert.equal(approvals,1);
      const downloaded=path.join(work,'downloaded.app.zip'),expanded=path.join(work,'downloaded');
      await fs.writeFile(downloaded,response.bytes);await fs.mkdir(expanded);
      await run('/usr/bin/ditto',['-x','-k',downloaded,expanded]);
      const app=path.join(expanded,kit.options.name+'.app'),executable=path.join(app,'Contents','MacOS',kit.options.name);
      assert.equal(createHash('sha256').update(await fs.readFile(executable)).digest('hex'),response.report.executableSha256);
      await run('/usr/bin/codesign',['--verify','--strict','--verbose=2',app]);
      assert.match(await run(executable,[]),/NATIVE_CONFORMANCE_OK/);
      report.bridge={sha256:response.report.sha256,executableSha256:response.report.executableSha256,signatureVerifiedByCodesign:true,executedOn:process.arch};
      report.checks.push('real-approved-bridge-download-signature-execution');
    } finally {client.disconnect();await bridge.close();}
    // The reusable API must not delete its default output with its temporary kit.
    const {buildMacOSProject}=await import('../packages/macos-native/src/node.mjs');
    const apiCwd=path.join(work,'api-default-output');await fs.mkdir(apiCwd);
    const previousCwd=process.cwd();let apiOutput;
    try {process.chdir(apiCwd);apiOutput=await buildMacOSProject(project,{cache,jobs:3,zip:false});}
    finally {process.chdir(previousCwd);}
    // macOS aliases /var to /private/var; the builder intentionally returns
    // canonical paths. Still require the exact surviving output directory.
    assert.equal(apiOutput.app,await fs.realpath(path.join(apiCwd,'out',kit.options.name+'.app')));
    assert.equal((await fs.stat(apiOutput.executable)).isFile(),true);
    assert.match(await run(apiOutput.executable,[]),/NATIVE_CONFORMANCE_OK/);
    report.checks.push('reusable-api-output-survives-source-cleanup');
    report.macOSExecutionVerified=true;report.build=built;
    const artifacts=path.join(root,'artifacts/macos-native');await fs.mkdir(artifacts,{recursive:true});
    await fs.copyFile(built.zip,path.join(artifacts,path.basename(built.zip)));
  }
} catch(error) {
  report.failure={message:error.message,tool:error.tool,output:error.output};throw error;
} finally {
  const reports=path.join(root,'reports/macos-native');await fs.mkdir(reports,{recursive:true});
  await fs.writeFile(path.join(reports,'build.log'),transcript);
  await fs.writeFile(path.join(reports,'execution.json'),JSON.stringify(report,null,2)+'\n');
  await fs.rm(work,{recursive:true,force:true});
}
console.log(JSON.stringify(report,null,2));

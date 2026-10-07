import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {compileMacOS,createMacOSBuildKit,cppText,macOSOptions} from '../packages/macos-native/dist/index.js';
import {verifyMacOSAppArchive} from '../packages/macos-native/src/archive.js';
import {inspectMachO} from '../packages/macos-native/src/mach-o.js';
import {macOSArchiveFixture,macOSImageFixture,fixtureZip,fixtureProject} from './macos-fixture.mjs';
import {readZip} from '../src/project/zip.js';

// All image fixtures below are structural and nonexecutable. macOS CI separately
// verifies the signature and runs a genuinely compiled app on Apple Silicon.
test('source kit is deterministic, independent of project mutation, and contains no executable claim',()=>{
  const source=fixtureProject(),before=JSON.stringify(source),a=createMacOSBuildKit(source),b=createMacOSBuildKit(source);
  assert.equal(JSON.stringify(source),before);assert.deepEqual(a.files,b.files);
  assert.equal(a.report.artifact,'native-source-build-kit');
  for(const name of ['build.mjs','target.js','mach-o.js','main.cpp','native/vb6.hpp','native/appkit-host.mm','LICENSE'])assert.ok(a.files[name],name);
  const manifest=JSON.parse(a.files['build.json']);
  for(const name of [...manifest.sources,...manifest.headers])assert.ok(a.files[name],name);
  assert.equal(cppText('a\0\ud800"\\'),'Text{char16_t(0x61),char16_t(0x0),char16_t(0xd800),char16_t(0x22),char16_t(0x5c)}');
  assert.match(a.files['main.cpp'],/initializeProgram/);
});
test('target rejects path traversal, wrong architecture, malformed bundle identifiers and unbounded limits',()=>{
  for(const options of [{name:'../Escape'},{name:'x/y'},{arch:'x86_64'},{bundleIdentifier:'a/<b>'},{minimumVersion:'10.15'},{optimization:4},{maxCallDepth:Infinity}])assert.throws(()=>macOSOptions(options));
});
test('native export refuses unknown Windows library declarations',()=>{
  const source=fixtureProject();source.modules[0].code='Private Declare Sub Unsafe Lib "unknown-library" ()\nPublic Sub Main()\nUnsafe\nEnd Sub';
  assert.throws(()=>compileMacOS(source),/adapter/);
});
test('archive contract rejects lost execute mode, links, aliases, unexpected members and metadata mismatch',async()=>{
  const name='NativeFixture',executable=name+'.app/Contents/MacOS/'+name;
  const entries=Object.fromEntries(await readZip(macOSArchiveFixture()));
  await assert.rejects(verifyMacOSAppArchive(fixtureZip(entries),{name}),/permissions/);
  await assert.rejects(verifyMacOSAppArchive(fixtureZip(entries,p=>p===executable?0o120777:0o100644),{name}),/links/);
  await assert.rejects(verifyMacOSAppArchive(macOSArchiveFixture(name,{'unexpected.txt':'x'}),{name}),/Unexpected/);
  const aliases=macOSArchiveFixture(name,{[name+'.app/Contents/Resources/\u00e9.txt']:'a',[name+'.app/Contents/Resources/e\u0301.txt']:'b'});
  await assert.rejects(verifyMacOSAppArchive(aliases,{name}),/collision/);
  await assert.rejects(verifyMacOSAppArchive(macOSArchiveFixture(name),{name,bundleIdentifier:'org.other.application'}),/CFBundleIdentifier/);
  await assert.rejects(verifyMacOSAppArchive(macOSArchiveFixture(name),{name,minimumVersion:'12.0'}),/deployment/);
  const signatureMissing=macOSImageFixture();new DataView(signatureMissing.buffer).setUint32(152,0,true);
  await assert.rejects(verifyMacOSAppArchive(macOSArchiveFixture(name,{[executable]:signatureMissing}),{name}),/signature/);
});
test('Mach-O parser bounds checks malformed load commands and rejects other architectures',()=>{
  const input=macOSImageFixture();assert.equal(inspectMachO(input).architecture,'arm64');
  for(const mutate of [v=>v.setUint32(4,0x01000007,true),v=>v.setUint32(36,0xfffffffc,true),v=>v.setUint32(160,2000,true),v=>v.setUint32(112,2,true)]){
    const copy=input.slice();mutate(new DataView(copy.buffer));assert.throws(()=>inspectMachO(copy));
  }
  for(const length of [0,8,28,40,100])assert.throws(()=>inspectMachO(input.subarray(0,length)));
});
test('npm package compiles and exposes reusable local APIs after independent offline extraction',async t=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'vb6-macos-package-'));t.after(()=>fs.rm(tmp,{recursive:true,force:true}));
  const packageDirectory=path.resolve('packages/macos-native');
  const packed=JSON.parse(execFileSync('npm',['pack','--offline','--ignore-scripts','--json','--pack-destination',tmp],{cwd:packageDirectory,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(packed.length,1);const info=packed[0];
  assert.ok(info.files.some(f=>f.path==='src/bridge.mjs'));assert.ok(info.files.some(f=>f.path==='dist/index.js'));
  assert.ok(info.files.every(f=>!f.path.startsWith('tests/')&&!f.path.startsWith('src/compiler')));
  const destination=path.join(tmp,'extracted');await fs.mkdir(destination);
  execFileSync('tar',['-xzf',path.join(tmp,info.filename),'-C',destination]);
  const installed=path.join(destination,'package'),url=relative=>pathToFileURL(path.join(installed,relative)).href;
  const api=await import(url('dist/index.js'));assert.match(api.compileMacOS(fixtureProject()).files['main.cpp'],/initializeProgram/);
  assert.ok(api.createMacOSBuildKit(fixtureProject()).files['native/appkit-host.mm']);
  const node=await import(url('src/node.mjs')),bridge=await import(url('src/bridge.mjs'));
  assert.equal(typeof node.buildMacOSProject,'function');assert.equal(typeof bridge.createMacOSBridge,'function');
  execFileSync(process.execPath,[path.join(installed,'bin/vb6-macos.mjs'),'--help'],{encoding:'utf8'});
});

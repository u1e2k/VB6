import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {newProject} from '../src/project/model.js';
import {importFiles} from '../src/project/formats.js';
import {bytesOf} from '../src/project/native-text.js';
import {normalizeClassicOptions, classicBridgeURL} from '../src/exporter/classic-options.js';
import {configureClassicVBP} from '../src/exporter/classic-vbp.js';
import {prepareClassicProject} from '../src/exporter/classic-project.js';

test('runtime target options reject host authority and unsafe output names', () => {
  assert.deepEqual(normalizeClassicOptions({}, 'Hello'), {name:'Hello', codegen:'preserve'});
  for (const options of [{compiler:'evil.exe'}, {timeout:1}, {args:[]}, {codegen:'aot'}, {name:'../app'}, {name:'NUL.exe'}, {name:'a:stream'}, {name:'bad\nname'}]) assert.throws(() => normalizeClassicOptions(options));
  assert.equal(classicBridgeURL('http://127.0.0.1:8768/classic'), 'http://127.0.0.1:8768/classic');
  for (const url of ['https://remote.test/classic','http://localhost:8768/classic','http://127.0.0.1/classic?token=x','http://user@127.0.0.1/classic','http://127.0.0.1/other']) assert.throws(() => classicBridgeURL(url));
});
test('classic project preparation is immutable and does not invoke the AOT parser', () => {
  const project = newProject('RuntimeHello');
  project.modules[0].code = 'Option Explicit\nPrivate Sub Form_Load()\n  Dim value As Variant\n  Set value = CreateObject("Scripting.Dictionary")\nEnd Sub\n';
  const before = JSON.stringify(project), result = prepareClassicProject(project, {codegen:'pcode'});
  assert.equal(JSON.stringify(project), before);
  assert.equal(result.manifest.runtime, 'MSVBVM60.DLL'); assert.equal(result.manifest.compiled, false);
  assert.match(new TextDecoder().decode(result.files['RuntimeHello.vbp']), /CompilationType=1/);
  assert.match(String(result.files['Form1.frm']), /Scripting.Dictionary/);
});
test('classic output configuration preserves opaque bytes and does not change designer sections', () => {
  const original = Buffer.from('Type=Exe\r\nCompilationType=1\r\nCustom="\x80\xe9"\r\n[Designer]\r\nPath32="stay"\r\n', 'latin1');
  const patched = Buffer.from(configureClassicVBP(original, 'Runtime App', 'native'));
  assert.ok(patched.includes(Buffer.from('Custom="\x80\xe9"', 'latin1')));
  assert.match(patched.toString(), /CompilationType=0/); assert.match(patched.toString(), /\[Designer\]\r\nPath32="stay"/);
  assert.throws(() => configureClassicVBP(Buffer.from('Type=Exe\nType=OleExe'), 'App'));
  assert.throws(() => configureClassicVBP(Buffer.from('Type=Exe'), 'App😀'));
});
test('imported native source bytes and hidden attributes survive classic preparation', async () => {
  const names = ['HelloRuntime.vbp','Form1.frm','Main.bas'];
  const entries = await Promise.all(names.map(async name => [name, new Uint8Array(await fs.readFile('examples/classic/' + name))]));
  const imported = await importFiles(entries), project = imported.project || imported;
  const result = prepareClassicProject(project, {codegen:'native'});
  for (const name of names.slice(1)) assert.deepEqual(bytesOf(result.files[name]), entries.find(([n]) => n === name)[1]);
  assert.equal(result.manifest.projectType, 'exe');
});
test('browser-only behavior is diagnosed rather than silently discarded', () => {
  const layout = newProject(); layout.settings.anchoring = true;
  assert.throws(() => prepareClassicProject(layout), /anchoring\/auto-layout/);
  const state = newProject(); state.modules[0].form.ocxState = {};
  assert.throws(() => prepareClassicProject(state), /property bags/);
  const group = newProject(); group.nativeWorkspace = {};
  assert.throws(() => prepareClassicProject(group), /single native project/);
});
test('native ActiveX EXEs are accepted but DLL/OCX projects are not renamed to EXE', () => {
  const project = newProject(); project.nativeProject = {entries:[{key:'Type',value:'OleExe'}]};
  assert.equal(prepareClassicProject(project).manifest.projectType, 'oleexe');
  project.nativeProject.entries[0].value = 'OleDll';
  assert.throws(() => prepareClassicProject(project), /DLL and OCX/);
});
test('native files reject Windows device paths and Unicode BOMs', () => {
  const device = newProject(); device.modules[0].sourcePath = 'NUL.frm';
  assert.throws(() => prepareClassicProject(device), /Unsafe Windows/);
  const unicode = newProject(); unicode.modules[0].sourceEncoding = 'utf-16le';
  assert.throws(() => prepareClassicProject(unicode), /ANSI source code page/);
});

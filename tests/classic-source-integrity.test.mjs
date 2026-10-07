import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {newProject, createForm, createControl} from '../src/project/model.js';
import {importFiles} from '../src/project/formats.js';
import {encodeNativeText, decodeNativeText, bytesOf} from '../src/project/native-text.js';
import {prepareClassicProject} from '../src/exporter/classic-project.js';
import {configureClassicVBP} from '../src/exporter/classic-vbp.js';
import {compileClassicProject} from '../tools/classic-compile.mjs';
import {parseClassicOptions, stageClassic} from '../tools/build-classic.mjs';

const native = async (entries, encoding = 'windows-1252') => (await importFiles(
  entries.map(([name, text]) => [name, bytesOf(encodeNativeText(text, {encoding}))]),
  {encoding, basenameFallback: false})).project;

test('unresolved native source records cannot create incomplete classic executables', async () => {
  const project = await native([['Broken.vbp', 'Type=Exe\r\nName="Broken"\r\nForm=Missing.frm\r\n']]);
  assert.throws(() => prepareClassicProject(project), error =>
    error.diagnostics[0].code === 'CLASSIC_MISSING_SOURCE' && /Missing.frm/.test(error.message));
});

test('classic source references cannot escape the exported source root', async () => {
  for (const reference of ['../outside.frm', 'C:\\outside.frm', '\\\\server\\share\\outside.frm']) {
    const project = await native([['Unsafe.vbp', 'Type=Exe\r\nName="Unsafe"\r\nForm=' + reference + '\r\n']]);
    assert.throws(() => prepareClassicProject(project), error => error.diagnostics[0].code === 'CLASSIC_SOURCE_PATH');
  }
});

test('nested native source membership preserves relative paths within the archive', async () => {
  const project = await native([
    ['project/App.vbp', 'Type=Exe\r\nName="Nested"\r\nModule=MainModule; ..\\code\\Main.bas\r\nStartup="Sub Main"\r\n'],
    ['code/Main.bas', 'Attribute VB_Name = "MainModule"\r\nPublic Sub Main()\r\nEnd Sub\r\n']
  ]);
  const result = prepareClassicProject(project);
  assert.deepEqual(result.manifest.sourceFiles, [{kind: 'Module', path: 'code/Main.bas'}]);
  assert.match(decodeNativeText(result.files['project/App.vbp']).text, /\.\.\\code\\Main.bas/);
});

test('native resource inputs must be present, not silently omitted', async () => {
  const project = await native([['Resources.vbp', 'Type=Exe\r\nName="Resources"\r\nResFile32="missing.res"\r\n']]);
  assert.throws(() => prepareClassicProject(project), /Missing referenced resource file: missing.res/);
});

test('classic output names use the imported project ANSI encoding', async () => {
  const form = 'VERSION 5.00\r\nBegin VB.Form Form1\r\n Caption = "Żółć"\r\nEnd\r\nAttribute VB_Name = "Form1"\r\n';
  const project = await native([
    ['Polski.vbp', 'Type=Exe\r\nName="Polski"\r\nForm=Form1.frm\r\nStartup="Form1"\r\n'], ['Form1.frm', form]
  ], 'windows-1250');
  const before = JSON.stringify(project), result = prepareClassicProject(project, {name: 'Łódź', codegen: 'pcode'});
  assert.equal(result.manifest.encoding, 'windows-1250');
  assert.match(decodeNativeText(result.files['Polski.vbp'], {encoding: 'windows-1250'}).text, /ExeName32="Łódź.exe"/);
  assert.deepEqual(bytesOf(result.files['Form1.frm']), bytesOf(encodeNativeText(form, {encoding: 'windows-1250'})));
  assert.equal(JSON.stringify(project), before);
  const extra = createForm('Form2'); extra.form.properties.Caption = 'Łódź'; project.modules.push(extra);
  assert.match(decodeNativeText(prepareClassicProject(project).files['Form2.frm'], {encoding: 'windows-1250'}).text, /Łódź/);
});

test('mixed non-ASCII module encodings fail without changing project bytes', () => {
  const project = newProject(); project.modules[0].sourceEncoding = 'windows-1251';
  project.modules[0].form.properties.Caption = 'Привет';
  const before = JSON.stringify(project);
  assert.throws(() => prepareClassicProject(project), /Mixed ANSI code pages/);
  assert.equal(JSON.stringify(project), before);
});

test('Unicode VBP metadata fails explicitly even when its module list is empty', async () => {
  const project = await native([['Unicode.vbp', 'Type=Exe\r\nName="Unicode"\r\n']], 'utf-8');
  assert.throws(() => prepareClassicProject(project), /ANSI project code page/);
});

test('VBP configuration accepts inline comments and CR-only lines without losing opaque bytes', () => {
  const original = Buffer.from('Type=Exe \' classic\rCustom="\x80"\rCompilationType=1\r', 'latin1');
  const output = Buffer.from(configureClassicVBP(original, 'Name', 'native'));
  assert.ok(output.includes(Buffer.from('Custom="\x80"', 'latin1')));
  assert.match(output.toString(), /CompilationType=0/);
});

test('browser-project CLI shares intrinsic lowering and browser-extension diagnostics', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'classic-cli-')); let plan;
  try {
    const project = newProject('CLI'), timer = createControl('Timer');
    project.modules[0].form.controls.push(timer);
    const input = path.join(dir, 'app.vb6web'); await fs.writeFile(input, JSON.stringify(project));
    plan = await stageClassic(parseClassicOptions(['--project', input, '--stage-only', '--codegen', 'pcode']));
    const form = await fs.readFile(path.join(path.dirname(plan.vbp), 'Form1.frm'), 'utf8');
    const record = form.match(/Begin VB.Timer Timer1([\s\S]*?)\r\n   End/)[1];
    assert.doesNotMatch(record, /Font|Visible|Width|Height/);
    assert.match(await fs.readFile(plan.vbp, 'utf8'), /CompilationType=1/);
    project.modules[0].form.ocxState = {}; await fs.writeFile(input, JSON.stringify(project));
    await assert.rejects(stageClassic(parseClassicOptions(['--project', input, '--stage-only'])), /property bags/);
  } finally {
    if (plan) await fs.rm(plan.stage, {recursive: true, force: true});
    await fs.rm(dir, {recursive: true, force: true});
  }
});

test('compiler diagnostics retain project ANSI text rather than UTF-8 replacement characters', async () => {
  const prepared = prepareClassicProject(newProject('Logs'));
  await assert.rejects(compileClassicProject(prepared, {compiler: process.execPath,
    runner: async (_compiler, args) => {
      await fs.writeFile(args[3], Buffer.from('Caf\xe9: missing control', 'latin1')); return {code: 1};
    }}), error => error.compilerLog === 'Café: missing control');
});

test('native CLI supports an explicit non-Western ANSI project code page', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'classic-cp1250-')); let plan;
  try {
    const input = path.join(dir, 'app.vbp');
    await fs.writeFile(input, bytesOf(encodeNativeText('Type=Exe\r\nModule=Main; Łódź.bas\r\nExeName32="Żółć.exe"\r\n', {encoding: 'windows-1250'})));
    await fs.writeFile(path.join(dir, 'Łódź.bas'), 'Attribute VB_Name = "Main"\r\n');
    plan = await stageClassic(parseClassicOptions(['--project', input, '--stage-only', '--encoding', 'windows-1250']));
    assert.equal(plan.name, 'Żółć'); assert.equal(plan.encoding, 'windows-1250');
    assert.match(decodeNativeText(await fs.readFile(plan.vbp), {encoding: 'windows-1250'}).text, /ExeName32="Żółć.exe"/);
    assert.ok((await fs.stat(path.join(path.dirname(plan.vbp), 'Łódź.bas'))).isFile());
    assert.throws(() => parseClassicOptions(['--project', input, '--encoding', 'utf-8']), /ANSI project code page/);
  } finally {
    if (plan) await fs.rm(plan.stage, {recursive: true, force: true});
    await fs.rm(dir, {recursive: true, force: true});
  }
});

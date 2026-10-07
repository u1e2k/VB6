import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLES} from '../src/project/examples.js';
import {exportClassicArchive} from '../src/exporter/classic-archive.js';
import {newProject} from '../src/project/model.js';
import {writeZip, readZip} from '../src/project/zip.js';

test('the shipped Orders starter can always be saved as a diagnosed build archive', async () => {
  const project = EXAMPLES.find(example => example.id === 'orders').create();
  const snapshot = JSON.stringify(project);
  const archive = exportClassicArchive(project);
  assert.equal(archive.files['project.vb6web'], snapshot);
  assert.equal(archive.manifest.compiled, false);
  assert.equal(archive.manifest.buildable, false);
  assert.ok(archive.manifest.diagnostics.some(d => /StatusBar/.test(d.message)));
  const files = await readZip(writeZip(archive.files));
  assert.equal(new TextDecoder().decode(files.find(([name]) => name === 'project.vb6web')[1]), snapshot);
  assert.equal(JSON.stringify(project), snapshot);
});

test('ready archives retain the native build driver and source plus a lossless project snapshot', () => {
  const project = newProject('ArchiveHello');
  const archive = exportClassicArchive(project, {codegen: 'pcode'});
  assert.equal(archive.manifest.buildable, true);
  assert.equal(archive.manifest.sourceStatus, 'ready');
  assert.deepEqual(archive.manifest.diagnostics, []);
  assert.match(new TextDecoder().decode(archive.files['source/ArchiveHello.vbp']), /CompilationType=1/);
  assert.equal(archive.files['project.vb6web'], JSON.stringify(project));
});

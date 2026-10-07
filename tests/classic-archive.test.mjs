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
  assert.equal(new TextDecoder().decode(files.get('project.vb6web')), snapshot);
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

for (const example of EXAMPLES) {
  test('sample ' + example.id + ' downloads a lossless archive with explicit native readiness', async () => {
    const project = example.create(), snapshot = JSON.stringify(project);
    const archive = exportClassicArchive(project);
    assert.equal(archive.manifest.compiled, false);
    assert.equal(typeof archive.manifest.buildable, 'boolean');
    assert.equal(archive.manifest.buildable, archive.manifest.diagnostics.length === 0);
    assert.equal(archive.files['project.vb6web'], snapshot);
    assert.equal(JSON.stringify(project), snapshot);
    const files = await readZip(writeZip(archive.files));
    assert.equal(new TextDecoder().decode(files.get('project.vb6web')), snapshot);
    assert.deepEqual(JSON.parse(new TextDecoder().decode(files.get('classic-build.json'))), archive.manifest);
  });
}

test('blocked archive driver refuses before launching a compiler, even outside Windows', async () => {
  const {default: fs} = await import('node:fs/promises');
  const {default: path} = await import('node:path');
  const {default: os} = await import('node:os');
  const {spawnSync} = await import('node:child_process');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'classic-blocked-'));
  try {
    const project = newProject(); project.settings.anchoring = true;
    const archive = exportClassicArchive(project);
    for (const [name, data] of Object.entries(archive.files)) {
      const file = path.join(dir, name); await fs.mkdir(path.dirname(file), {recursive: true}); await fs.writeFile(file, data);
    }
    const result = spawnSync(process.execPath, [path.join(dir, 'build.mjs'), '--compiler', process.execPath], {encoding: 'utf8', timeout: 5000});
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Compilation is blocked/);
    assert.match(result.stderr, /anchoring\/auto-layout/);
    assert.doesNotMatch(result.stderr, /requires Windows|bad option/);
    await assert.rejects(fs.stat(path.join(dir, 'release')), {code: 'ENOENT'});
    assert.equal(archive.manifest.sourceStatus, 'requires-review');
    assert.match(archive.files['README.txt'], /output settings have NOT been applied/);
  } finally {await fs.rm(dir, {recursive: true, force: true});}
});

test('failed source serialization retains Unicode, designer and data state without partial native output', () => {
  const project = newProject(); project.modules[0].code = "' 😀 Łódź\n";
  const archive = exportClassicArchive(project);
  assert.equal(archive.manifest.buildable, false);
  assert.equal(archive.manifest.sourceStatus, 'unavailable');
  assert.ok(archive.manifest.diagnostics.length);
  assert.equal(archive.files['project.vb6web'], JSON.stringify(project));
  assert.ok(!Object.keys(archive.files).some(name => name.startsWith('source/')));
  assert.match(archive.files['README.txt'], /no partial native project/);
});

test('archive saving cannot turn an unsafe native filename into a ZIP traversal', async () => {
  const project = newProject(); project.modules[0].sourcePath = 'NUL.frm';
  const archive = exportClassicArchive(project);
  assert.equal(archive.manifest.buildable, false);
  assert.equal(archive.manifest.sourceStatus, 'unavailable');
  const files = await readZip(writeZip(archive.files));
  assert.deepEqual([...files.keys()].sort(), ['README.txt', 'build.mjs', 'classic-build.json', 'project.vb6web']);
  assert.equal(JSON.parse(new TextDecoder().decode(files.get('project.vb6web'))).modules[0].sourcePath, 'NUL.frm');
});

test('archive input limits and host authority stay validated rather than becoming a fallback', () => {
  assert.throws(() => exportClassicArchive(null), /valid project/);
  assert.throws(() => exportClassicArchive(newProject(), {compiler: 'evil.exe'}), /Unsupported/);
  assert.throws(() => exportClassicArchive(newProject(), {name: '../escape'}), /Windows-safe/);
  const project = newProject(); project.modules[0].code = 'x'.repeat(20 * 1024 * 1024);
  assert.throws(() => exportClassicArchive(project), /20 MiB/);
});

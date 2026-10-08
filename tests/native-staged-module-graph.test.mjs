import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {parseOptions, stageWindows} from '../tools/build-windows.mjs';

// Import the staged module, not desktop/studio.mjs beside the repository source.
// A source-tree import can pass unit tests while vb6://app rejects it as absent.
// https://www.electronjs.org/docs/latest/api/protocol
for (const arch of ['x64', 'arm64']) test(`staged ${arch} IDE imports the complete approved preview module graph`, async () => {
  const {stage, manifest} = await stageWindows(parseOptions([
    '--name', `Module Graph ${arch}`, '--arch', arch, '--graphics', 'auto', '--stage-only'
  ]));
  try {
    const web = path.join(stage, 'web');
    const {installNativePreview} = await import(pathToFileURL(path.join(web, 'studio.mjs')).href);
    assert.equal(typeof installNativePreview, 'function');
    const helper = await fs.readFile(path.join(web, 'runtime-document-loader.mjs'));
    assert.equal(helper.toString(), await fs.readFile(new URL('../src/ide/runtime-document.js', import.meta.url), 'utf8'));
    for (const file of ['studio.mjs', 'runtime-document.mjs', 'runtime-document-loader.mjs', 'window-transport.mjs']) {
      assert.equal(manifest.files[file], createHash('sha256').update(await fs.readFile(path.join(web, file))).digest('hex'));
    }
    let resolve;
    const approval = new Promise(done => { resolve = done; });
    const frame = {isConnected: true, src: '', removeAttribute() {}, set srcdoc(_) { assert.fail('Native loader tried srcdoc'); }};
    const errors = [];
    const studio = {runtimeFrame: frame, bridgeToken: 'one', stop() {}, status: message => errors.push(message)};
    const url = 'vb6://app/preview/' + 'a'.repeat(32);
    installNativePreview(studio, {runtimeDocument: () => approval});
    const ready = studio.loadRuntimeDocument(frame, '<html></html>');
    assert.equal(frame.src, '');
    resolve(url); await ready;
    assert.equal(frame.src, url); assert.deepEqual(errors, []);
    installNativePreview(studio, {runtimeDocument: async () => 'https://example.com'});
    frame.src = ''; await studio.loadRuntimeDocument(frame, '<html></html>');
    assert.equal(frame.src, ''); assert.match(errors[0], /invalid preview URL/);
  } finally { await fs.rm(stage, {recursive: true, force: true}); }
});

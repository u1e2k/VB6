/** Keep public native runtime examples buildable without calling a local mock an
 * independent Windows/VB6 execution oracle. Real fixture acceptance remains in
 * the existing Windows workflow and its unchanged executable/hash gates. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {compileWin32} from '../src/native/compiler.js';
import {newProject} from '../src/project/model.js';

const documents = [
  {path: 'WIN32-VARIANTS.md', examples: 3},
  {path: 'NATIVE-STRING-METADATA.md', examples: 1}
];
const project = code => ({
  ...newProject('NativeDocumentExample'),
  startup: 'Sub Main',
  modules: [{id: 'entry', name: 'Entry', kind: 'module', code}]
});

for (const {path, examples: expected} of documents) {
  const url = new URL('../docs/' + path, import.meta.url);
  const markdown = readFileSync(url, 'utf8');
  const examples = [...markdown.matchAll(/^```vb\r?\n([\s\S]*?)^```[ \t]*$/gm)];
  test(path + ' retains every complete executable example', () => {
    assert.equal(examples.length, expected, 'Do not silently drop example coverage');
    for (const [, code] of examples) assert.match(code, /Public Sub Main\(\)/);
  });
  for (const [index, [, code]] of examples.entries()) {
    for (const optimization of [0, 1, 2]) {
      test(`${path} example ${index + 1} compiles reproducibly at O${optimization}`, () => {
        const input = project(code), before = JSON.stringify(input);
        const result = compileWin32(input, {optimization});
        assert.equal(result.report.architecture, 'x86');
        assert.equal(result.report.extraction, false);
        assert.equal(JSON.stringify(input), before, 'Compilation must not rewrite input');
        assert.deepEqual(result.bytes, compileWin32(input, {optimization}).bytes);
        assert.ok(result.report.sourceMap.some(entry => entry.procedure === 'Main'));
      });
    }
  }
  test(path + ' resolves its repository-relative documentation links', () => {
    for (const [, target] of markdown.matchAll(/\]\(([^)]+\.md)(?:#[^)]*)?\)/g)) {
      if (/^[a-z][a-z\d+.-]*:/i.test(target)) continue;
      assert.ok(existsSync(fileURLToPath(new URL(target, url))), target);
    }
  });
}

const withBody = (body, procedures = '') =>
  project(`Option Explicit\nPublic Sub Main()\n${body}\nEnd Sub\n${procedures}`);
for (const type of ['Long', 'String', 'Variant']) {
  for (const optimization of [0, 1, 2]) {
    test(`whole ${type} array boxes and extracts as an owned Variant at O${optimization}`, () => {
      const input = withBody(
        `Dim items() As ${type}\nDim copied() As ${type}\nDim value As Variant\nReDim items(0 To 1)\nvalue=items\ncopied=value`
      ), before = JSON.stringify(input);
      const result = compileWin32(input, {optimization});
      assert.equal(JSON.stringify(input), before);
      assert.deepEqual(result.bytes, compileWin32(input, {optimization}).bytes);
      assert.match(JSON.stringify(result.report.imports), /VariantCopyInd/);
      assert.equal(result.report.architecture, 'x86');
      assert.equal(result.report.extraction, false);
    });
    test(`whole ${type} array packs as one nested ParamArray value at O${optimization}`, () => {
      const input = withBody(
        `Dim items() As ${type}\nReDim items(0 To 1)\nPack items`,
        'Private Sub Pack(ParamArray values() As Variant)\nIf UBound(values) <> 0 Then Error 5\nIf Not IsArray(values(0)) Then Error 5\nEnd Sub'
      ), before = JSON.stringify(input);
      const result = compileWin32(input, {optimization});
      assert.equal(JSON.stringify(input), before);
      assert.deepEqual(result.bytes, compileWin32(input, {optimization}).bytes);
      assert.match(JSON.stringify(result.report.imports), /SafeArrayPutElement/);
      assert.equal(result.report.extraction, false);
    });
  }
  test(`whole ${type} array cannot alias a scalar ByRef Variant`, () => {
    assert.throws(() => compileWin32(withBody(
      `Dim items() As ${type}\nReDim items(0 To 1)\nAssignValue items`,
      'Private Sub AssignValue(ByRef value As Variant)\nvalue=1\nEnd Sub'
    )), /Whole-array ByRef Variant/);
  });
}
for (const body of ['ReDim values(2)', 'Erase values', 'values=Array(2)']) {
  test(`ParamArray descriptor mutation remains explicitly diagnosed: ${body}`, () => {
    assert.throws(() => compileWin32(withBody(
      'Pack 1', `Private Sub Pack(ParamArray values() As Variant)\n${body}\nEnd Sub`
    )), /ParamArray/);
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';

// Existing editor consumers and compiler-side consumers must share the same
// definitions, not copies that can drift or split caches and nominal identity.
for (const name of ['source-context', 'type-catalog', 'data-type-catalog',
  'signature-syntax', 'declaration-index', 'reference-metadata']) {
  test('stable editor exports share the language implementation: ' + name, async () => {
    const editor = await import('../src/editor/' + name + '.js');
    const language = await import('../src/language/' + name + '.js');
    assert.deepEqual(Object.keys(editor).sort(), Object.keys(language).sort());
    for (const key of Object.keys(language)) assert.strictEqual(editor[key], language[key], key);
  });
}

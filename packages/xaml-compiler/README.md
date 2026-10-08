# @vb6/xaml-compiler

Dependency-free JavaScript XAML syntax, schema, semantic compiler, construction IR,
explicit host object writer and UTF-16 language services. ES modules run in Node.js,
browsers and workers without a DOM or a .NET runtime. TypeScript declarations are
included. This package does not import the VB6 application.

**Development version 0.1.0.** This is an independent implementation informed by
Microsoft's public XAML documentation, not a complete translation of Microsoft's
C# compiler, WinMD system, XBF format, MSBuild tasks or C#/C++ generated bindings.
The built-in schema contains a representative WinUI vocabulary, not the complete
WinUI API inventory. Constructing an object description is not implementing that
control's rendering, layout, dependency properties or binding engine.

## Compile and construct

```js
import {
  compileXaml, instantiateXaml, createObjectHost, XamlLanguageService
} from '@vb6/xaml-compiler';

const text = `<Button
  xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
  xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
  x:Name="SaveButton" Width="120" Content="Save" />`;
const result = compileXaml(text);
if (!result.success) throw new Error(result.diagnostics.map(d => d.message).join('\n'));

// Tooling/data host, deliberately not a WinUI renderer.
const instance = instantiateXaml(result.program, createObjectHost());
console.log(instance.root.properties.Content); // Save
console.log(instance.names.get('SaveButton') === instance.root); // true
instance.dispose();

const language = new XamlLanguageService();
language.openDocument('file:///Main.xaml', text, 1);
console.log(language.diagnostics('file:///Main.xaml'));
console.log(language.symbols('file:///Main.xaml'));
language.closeDocument('file:///Main.xaml');
```

## Compiler and host contracts

`parseXaml` builds a recovering namespace-aware syntax tree with exact source
spans, comments, CDATA, attributes and tokens. `parseMarkupExtension` handles
nested extensions and binding function arguments. `compileXaml` resolves types
and members through `XamlSchemaContext`, converts scalar values and produces a
serializable construction program only when compilation succeeds. Failed results
still expose the syntax, semantic nodes and diagnostics for an editor.

Custom types use `schema.registerType(uri, name, {base, members, contentProperty})`.
Property metadata supports literal converters, enums, collections, dictionaries,
attached properties, events and nullable values. `emitXamlModule` emits a data ES
module whose `build(host, options)` calls the object writer; it does not evaluate
user input as JavaScript.

The object writer requires `host.create` and `host.set`. Collection, binding,
event, template and theme semantics require explicit `add`, `bind`, `listen`,
`template` and `resource` hooks. External dictionary loading and deferred x:Load
require host preprocessing. Missing capabilities throw rather than creating
nonfunctional placeholders. Construction is transactional, with rollback and
reverse-order subscription/object disposal. Namescopes and resource identity are
retained, with cyclic resource construction detected.

`parseBindingPath`, `evaluateBindingPath` and `assignBindingPath` use expression
data. Calls require an explicit `invoke` callback; static types and casts require
host callbacks. They are not a complete C#/VB expression/type checker and do not
supply observable dependency tracking. Getters and callbacks are trusted host
code; this is not a sandbox for executing arbitrary application object graphs.

## Language service

`XamlLanguageService` owns immutable URI/version text snapshots. It supplies
completion, diagnostics, hover, namescope-aware element references/rename,
conservative resource references/rename, document symbols, folding ranges,
semantic tokens and formatting. Ranges and offsets use UTF-16; positions are
zero-based. Edits reject stale versions. Analysis is cached per document and
schema revision; parsing is not incremental subtree reuse. Resource rename
rejects ambiguous declarations and XML-encoded references instead of guessing.

The formatter preserves mixed-content and xml:space subtrees. It is not a
canonicalizing serializer. The independent VB6 integration lives in `src/xaml`
and `src/ide/xaml.js`, outside this package.

## Limits and validation

Defaults bound source size to 2,000,000 UTF-16 code units, XML nodes/attributes to
50,000, XML nesting to 256, and markup/binding nesting to 64. DTDs, external entity
resolution and arbitrary markup execution are rejected. Unsafe prototype member
names are rejected. Hosts remain responsible for the behavior of their callbacks.

From the repository, run `node --test tests/xaml-compiler.test.mjs` and
`node tools/test-xaml-package.mjs`. The latter packs the actual package, verifies
an isolated import and exercises TypeScript consumers when `tsc` is available.
No npm registry publication is performed by these commands.

References: Microsoft Learn's XAML syntax, XAML namespaces, x:Bind, Binding,
StaticResource and TemplateBinding documentation; Microsoft's public
`microsoft/microsoft-ui-xaml/src/XamlCompiler` source layout. No Microsoft source
files or generated WinMD inventory are included here. License: MIT.

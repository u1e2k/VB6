# Native-first VB.NET migration

Version 0.2.0 separates representation selection, semantic policy, and support
packaging. The default is **native / preserve / minimal**. Ordinary applications
can have no project-specific compatibility dependency. Difficult source retains
explicit support rather than silently changing behavior to make the archive smaller.

A successful converter report is not a successful .NET build or a certificate of
VB6 equivalence. Review `validation`, diagnostics and representation decisions.
The converter never executes the input, restores a package, or runs a compiler.

## Quick start

```js
import {createVbNetMigrator} from '@vb6-studio/vbnet-migration';

const converter = createVbNetMigrator();
const converted = converter.convertProject(project, {
  codeStyle: 'native',
  runtime: 'minimal',
  semanticPolicy: 'preserve',
  platform: 'AnyCPU'
});
console.log(converted.report.representations);
console.log(converted.report.runtime);
const archive = converter.exportProject(project, {platform: 'AnyCPU'});
```

The project-specific support is independent of the standard .NET runtime and
`Microsoft.VisualBasic` APIs. "No custom runtime" does not mean a self-contained
native executable or the removal of the normal .NET runtime.

```sh
node tools/migrate-vbnet.mjs Legacy.vbp --platform AnyCPU --out native.zip
node tools/migrate-vbnet.mjs Legacy.vbp --runtime none --inspect
node tools/migrate-vbnet.mjs Legacy.vbp --code-style compatibility --runtime project --out legacy.zip
```

In Studio, select **File → Migrate to VB.NET (.NET 10 ZIP)…**. The dialog exposes
code style, support policy, target, platform and strictness. Modernization is a
separate, initially unchecked approval. The review dialog reports support files,
UTF-8 source bytes, required features and the reasons for representation choices.
Cancel, execution-state checks, original retention and stale-project guards remain.

## Independent controls

| Option | Values and contract |
|---|---|
| `codeStyle` | `native` (default) plans native representations and cleans emitted code. `compatibility` retains legacy representations and source shape. |
| `runtime` | `minimal`, `none`, `project`, `package`. Native defaults to minimal; compatibility defaults to project. An explicit setting overrides either default. |
| `semanticPolicy` | `preserve` (default) or `modernize`. Modernize requires at least one explicit supported rule in `acceptedRules`. |
| `acceptedRules` | Currently only `currency-decimal`. Unknown or duplicate rules fail; a rule cannot be supplied under preserve policy. |
| `runtimePackage` | `{id, version}` for an independently verified core support package. Required in package mode only if core support is used. |
| `windowsRuntimePackage` | Equivalent explicit Windows support package configuration. No version is guessed and no package is published. |

`Option Strict Off` and x86 remain conservative defaults independently of code
style. Use `strict: true` to expose required conversions to the VB.NET compiler,
and select the platform appropriate to the application's reviewed dependencies.
Native-first is not unrestricted type inference or a guarantee of strict-clean
output for arbitrary source.

### Minimal support

Each compatibility operation registers a root at the emission site with source,
line, generated file and reason. `runtime-catalog.js` defines an immutable explicit
dependency graph. The closure is emitted as independently composable source units:

```text
Application/
  Project.vbproj
  Module1.vb
  Compatibility/              # absent when no support is required
    VbCurrency.vb             # example: only this type is needed
    LICENSE
Project.slnx
migration-report.json
source-map.json
Directory.Build.targets
global.json
README-MIGRATION.md
Originals/                    # default retention; optional
```

There is no extra runtime project or assembly reference in minimal mode. The
support is compiled as part of the application. Units use explicit global
namespaces so application `RootNamespace` settings do not relocate support types.
Application imports are selected per emitted file, and source-map lines are
remapped after whitespace and identifier cleanup.

The linker does **not** discover dependencies by searching identifier-looking
strings in the final application text. Whole-type and member fragments are built
from the authoritative authored runtime sources. Extraction fails if the expected
declaration contract is absent; dependencies are explicit, including cycles.
It does not delete unused source procedures: all source members still convert and
can retain support even when they are not called by the entry point.

### None, project and package policies

`none` emits no support files or references. A required compatibility operation
produces `MIG_RUNTIME_REQUIRED`, with its source and reason. Normal export refuses
an unresolved result. An explicitly requested review ZIP includes the existing
MSBuild guard. This mode is not permission to drop semantics or substitute stubs.

`project` emits authored support projects when required. Combining it with
`codeStyle: 'compatibility'` retains the previous full core/Windows project contract,
including the original layout and runtime-focused test fixtures.

`package` emits only explicit, versioned `PackageReference` items for required
support families. For example:

```js
const output = converter.convertProject(project, {
  runtime: 'package',
  runtimePackage: {id: 'Company.Reviewed.Compatibility', version: '0.2.0'},
  windowsRuntimePackage: {id: 'Company.Reviewed.Compatibility.Windows', version: '0.2.0'}
});
```

These are example package identities, not claims that such packages exist.
The caller must build/publish or obtain compatible assemblies and configure its
feeds. IDs and exact semantic versions are validated; floating versions are not
accepted. A report warning distinguishes source generation from actual restore
or API-compatibility verification. No support is referenced when no feature needs it.

## Representation planning

The pipeline binds source declarations first. `record-types.js` retains record
ownership across nested/cross-module fields. Known record-field arithmetic no
longer falls back to Variant solely because member binding lost the declared type.
The shared frontend retains record layouts, not complete type accessibility
metadata; ambiguous project-wide record names are not guessed.

`representations.js` performs conservative whole-procedure planning before
emission. It considers shape, initialization, copying, escape uses, allocation
on normal control-flow paths and call boundaries. Decisions are stable across a
connected group of local array copies. Failed proofs keep the compatibility
representation and record a reason; they do not suppress diagnostics.

### Records

```vb
Public Structure Point
    Public X As Integer
    Public Y As Integer
End Structure
```

A numeric record needs no interface, factory or boxed deep-copy method. Ordinary
structure assignment and ByVal calls copy it normally. Records with string/date
fields can need a creation factory without needing deep copying. String contents
are immutable; Date initialization explicitly represents the VB zero date.
Records with owned array or Variant fields retain initialization/copy support,
but only owned fields get custom copying. Class references retain identity.
Recursive value layouts are diagnosed instead of optimized recursively forever.

### Arrays

Eligible local arrays become `T()` or `T(,)`, with ordinary indexing, native
`ReDim` and framework bounds queries. Native whole-array assignment clones
proven scalar/string storage rather than introducing reference aliases.
Fixed-array `Erase` clears contents; dynamic-array `Erase` releases storage.

Current proofs cover numeric/Boolean fixed arrays, fixed-rank numeric dynamic
arrays with validated constant bounds, and string vectors produced by standard
`Split`/`Filter`. Dynamic allocation must dominate every indexed or bounds use.
Native `ReDim Preserve` currently covers one dimension; multidimensional Preserve
retains compatibility storage until shape/error equivalence is established.
Multidimensional enumeration retains compatibility storage because managed and
VB array traversal order cannot be assumed equivalent.

For a private fixed one-dimensional vector with nonzero constant lower bounds,
the backing array is shifted. Tiny `VbNativeArrays.Index`/`Bound` helpers check
translated addresses and dimensions. Bounds and references are not simply padded
with an unused element. Such a project can be much smaller, but is not necessarily
runtime-free. String initialization, owned record arrays, dynamic lower bounds,
uncertain allocation/bounds, public array parameters, escaping arrays and indirect
or resumable control flow remain on the compatibility path.

A proven native array element can be passed as a real matching-type CLR ByRef
argument. Calls with mismatched formal types, unknown/external callees or
unproved redimensioning/lifetime boundaries are not treated as safe. General
compatibility-array elements still need value-cell lowering; property copy-back
is not substituted for live reference semantics.

### Local Variants

Only conservative homogeneous assignments that dominate all nonescaping,
non-introspective uses specialize a local Variant. Public signatures, `VarType`
observations, mixed writes, Null states, unknown calls and unsupported uses keep
the Variant representation. This is a bounded normal-flow proof, not a complete
interprocedural subtype/promotion analysis or arbitrary whole-program inference.

### Code cleanup

Typed numeric `Select Case` ranges with constant, effect-free endpoints remain
ordinary native ranges. Dynamic endpoints retain eager compatibility comparisons
so short-circuit range matching cannot suppress an observable endpoint call.

A function consisting of one executable assignment to its result, without reading
that result first, can emit a direct `Return`. General function-result assignment
is not converted to an early exit. Other control flow keeps its result variable.
Native console startup uses an accessible public Main directly instead of an
extra entry/forwarder pair. Private Main retains its visibility and an in-module
forwarder because the VB.NET startup method must be accessible. A simple single-form startup without observable default
instance use can construct its form directly. Other form lifetime cases retain
required support and diagnostics.

Parameterless events use typed inline `Sub` lambdas calling the original handler.
This avoids narrowing parameter-dropping `AddressOf` conversions under the
designer's `Option Strict On`. Mouse/key/cancel/indexed-control events keep their adapters.
Unused tooltip/component/disposal scaffolding is omitted only when no control
needs it. WinForms designer construction remains standard editable source.

Identifier cleanup tokenizes strings/comments and preserves required keyword
escaping. It never replaces bracket-looking data inside a string or comment.
Known scalar intrinsics use standard .NET/Visual Basic APIs when their argument
representation permits it; dynamic Null/subtype/owned-array cases retain support.

## Explicit modernization is a different semantic contract

```sh
node tools/migrate-vbnet.mjs Legacy.vbp --runtime none \
  --semantic-policy modernize --accept-rule currency-decimal --out reviewed.zip
```

```js
const result = converter.convertProject(project, {
  semanticPolicy: 'modernize',
  acceptedRules: ['currency-decimal'],
  runtime: 'minimal'
});
```

This rule maps Currency declarations/conversions/constants/loops to Decimal.
It deliberately changes four-decimal quantization, scaled 64-bit range,
subtype introspection (`VarType`, `Len`) and binary/interop representation.
Native scalar math/conversion calls stay on the selected Decimal representation.
The rule is independent of output code style. Every applied declaration or
literal decision is recorded under `modernization` with a reason and location.
It does not certify ABI conversion or remove an existing native-marshaling
blocker. Do not approve it for accounting/file/COM behavior without review.

No automatic On Error → Try/Catch transformation is introduced. Error resumption,
Currency preservation and array ownership are not traded away merely for smaller
source. Only the named, explicitly accepted modernization rule changes policy.

## Extensions

Code hooks support the legacy string return or a structured return:

```js
const plugin = {
  id: 'company.constants.v2',
  representationSafe: true,
  expression({node}) {
    if (node?.kind === 'id' && node.name.toLowerCase() === 'companyversion') {
      return {code: '"2026.10"', requires: []};
    }
  }
};
```

`requires` contains feature IDs or public support member names resolved by the
catalog. Static `plugin.requires` can declare a shared requirement set. Hooks can
also call `context.requireRuntime(symbol, location, reason)` for explicit roots.
Unknown features fail instead of leaving unresolved references unreported.
`RUNTIME_CATALOG` is exported and deeply frozen at the feature/dependency level.

An old string/control/finalize hook without explicit requirements conservatively
retains appropriate support; its source is not scanned to guess dependencies.
Without `representationSafe: true`, code-producing hooks also prevent native
array/Variant planning, plain-record removal, direct result/startup elimination
and direct form ownership. The opt-in is a trusted extension contract: the plugin
must understand native representations and preserve observable behavior itself.
Declaring no requirements and declaring representation safety are separate promises.

Finalize hooks run after application/source retention and before support/project/
solution materialization. They may add files and requirements, but must not expect
the final SDK files to exist yet. Added VB files should use their own imports or
fully qualified support names. Rewriting an existing emitted file also makes the
extension responsible for any affected source-map entries. The output validator
still rejects collisions, unsafe paths, invalid data and asynchronous hooks.
Plugins are trusted caller code, never loaded from imported project metadata.

## Verification and output-quality budgets

```sh
npm run build
npm run test:migration
npm run test:migration:browser
npm run pack:vbnet-migration
node tools/test-vbnet-package.mjs
tsc --noEmit --strict --module nodenext --moduleResolution nodenext \
  --target es2022 tests/migration-types.fixture.mts
```

`migration-native-metrics.test.mjs` records same-input native versus compatibility
source bytes and file counts. Empty/scalar/numeric-array/numeric-record/simple-form
fixtures require **zero custom support files**. A Currency fixture requires only
Currency support in minimal mode. These are UTF-8 source measurements, not
compiled assembly sizes, throughput benchmarks or native-VB6 parity certificates.

The .NET harness runs both profiles, checks generated programs and adds native
records/initialization/array aliases/shifted bounds/string intrinsics/startup/
modernization/root-namespace fixtures. Windows additionally executes native-style
WinForms construction and events. Each runtime catalog root is also compiled
independently using only its declared dependency closure. Missing SDKs are explicit
skips locally; `VB6_REQUIRE_DOTNET=1` fails the required CI gate.

The real browser harness covers both output profiles, explicit runtime-free
failure, modernization approval, package-reference configuration, downloads,
cancellation, running-state and stale-project checks. `VB6_OFFLINE=1` loads built
assets inline only for supplemental local tests, marks real-HTTP verification
false, and is forbidden in GitHub Actions. It is not a real-origin acceptance pass.

A new test or workflow is not itself execution evidence. Inspect current-head
reports before treating a conversion as deployable. Universal Variant promotion,
COM/OCX/default-member/ABI behavior, live compatibility-array aliases, binary
codecs, graphics and all form lifecycle cases remain outside these native proofs.

## Primary language references

- [VB.NET structures](https://learn.microsoft.com/en-us/dotnet/visual-basic/language-reference/statements/structure-statement)
- [ReDim and Preserve](https://learn.microsoft.com/en-us/dotnet/visual-basic/language-reference/statements/redim-statement)
- [Relaxed delegate conversion](https://learn.microsoft.com/en-us/dotnet/visual-basic/programming-guide/language-features/delegates/relaxed-delegate-conversion)
- [Partial type declarations](https://learn.microsoft.com/en-us/dotnet/visual-basic/language-reference/modifiers/partial)
- [Currency representation](https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/currency-data-type)
- [On Error](https://learn.microsoft.com/en-us/dotnet/visual-basic/language-reference/statements/on-error-statement)

These references inform implementation constraints; they do not substitute for
running a licensed Microsoft VB6 differential conformance suite.

# VB6 → VB.NET / .NET 10 migration

The migration engine converts the current Studio project or a native VB6 project
into editable VB.NET source and SDK projects. It is independent of the browser
runtime: exported programs compile to .NET and do not embed a JavaScript VM.

**Version 0.2.0 is not a full-fidelity converter for arbitrary VB6 programs.**
The implementation distinguishes generated source, known blocking diagnostics,
and external build/runtime verification. `success: true` means there are no known
converter blockers. It does **not** mean the .NET compiler ran, that every emitted
file compiles, or that Microsoft VB6 behavioral equivalence was demonstrated.
Known unsupported constructs remain in original sources and the migration report.

## Native-first output in 0.2.0

Defaults are `codeStyle: 'native'`, `runtime: 'minimal'`, and
`semanticPolicy: 'preserve'`. The converter selects native records, eligible
arrays and standard intrinsics and emits only required compatibility units.
Simple projects have no custom-runtime source, imports or project references.
For the previous full-runtime/source-shape contract select
`codeStyle: 'compatibility', runtime: 'project'` explicitly.

See [Native-first migration](VBNET-NATIVE-FIRST.md) for representation proofs,
minimal/none/project/package policies, explicit Currency modernization, extension
contracts, source-size budgets and current boundaries. Native-first does not
mean all VB6 source can be translated without support.

## Studio workflow

Stop execution and choose **File → Migrate to VB.NET (.NET 10 ZIP)…**. Select an
automatic, console, library or WinForms target, a platform, code style, support
policy and optional strictness. Currency modernization requires separate approval.
The second dialog displays source-linked diagnostics. A clean report offers a
normal ZIP; an unresolved report offers an explicitly labeled **review ZIP** with
an MSBuild error guard. Cancelling either dialog writes nothing. A project change
while the review dialog is open invalidates the export, preventing stale downloads.

WinForms targets `net10.0-windows`; console/library targets use `net10.0`. The x86
default is conservative for classic native/COM dependencies. Select `AnyCPU` for
portable non-UI code, or the appropriate explicit platform after interop review.
`Option Strict Off` preserves a compatibility-oriented starting point. Enabling
strict mode exposes unresolved narrowing and late binding to the .NET compiler;
it is not an automatic proof that the resulting project is strict-clean.

## Command line

```sh
node tools/migrate-vbnet.mjs Legacy.vbp --out Legacy-net10.zip
node tools/migrate-vbnet.mjs source.zip --entry Project/Legacy.vbp --out Legacy-net10.zip
node tools/migrate-vbnet.mjs application.vb6web --target console --platform AnyCPU --out application.zip
node tools/migrate-vbnet.mjs group.vbg --root ./Legacy --review --out group-review.zip
node tools/migrate-vbnet.mjs Legacy.vbp --inspect
```

The input may be `.vb6web`, `.json`, `.vbp`, `.vbg` or a ZIP containing a project.
Native paths outside the selected root are not implicitly read. Use `--root` to
select an explicit common ancestor for a group. Directory traversal skips
symlinks, `.git`, `node_modules`, `bin` and `obj`. CLI inputs are bounded to 32 MiB
and 10,000 files. ZIP input is read with bounded expansion and is not extracted
into arbitrary filesystem locations. Existing output files are never overwritten.
The converter never executes the input project, its declarations, a COM server,
a process, or a network request.

`--review` is required to export known unresolved code from the CLI/API. Inspection
returns exit status 2 for unresolved diagnostics; successful explicit review
archive creation returns 0 because it deliberately created the requested bundle.

## Output

Native/minimal output places any selected support under
`Application/Compatibility/`; that directory is absent when no support is needed.
The solution contains only the application project. Direct native console startup
also omits `__vbEntry.vb`. The following full-source layout is the explicit
**compatibility/project** profile; it is no longer the default:

```text
Application/
  Project.vbproj
  Module1.vb
  Form1.vb
  Form1.Designer.vb
  __vbEntry.vb
VB6.Compatibility/
  VB6.Compatibility.vbproj
  LICENSE
  src/*.vb
VB6.Compatibility.Windows/     # WinForms exports only
  VB6.Compatibility.Windows.vbproj
  LICENSE
  src/VbForms.vb
Originals/
  project.vb6web
  Code/*.bas, *.cls, *.frm
  Native/...                  # native files and available binary resources
Project.slnx
global.json
Directory.Build.targets
migration-report.json
source-map.json
README-MIGRATION.md
```

All available original project data is retained by default. The browser snapshot
is the complete input object, including designer extensions that native serializers
cannot represent. Individual module source is retained independently. Inactive
conditional-compilation branches are not translated into alternate builds but
remain in originals. Original `.vbp`, `.frm`, `.frx`, `.res` and dependency assets
are retained when present in the imported native workspace. Retention of an asset
is **not** an assertion that the corresponding runtime feature was converted.

Generated files are outside the originals directory, so SDK compile globs do not
compile legacy source. Paths are validated before a result is returned, including
files added by plugins. ZIPs use stable ordering, timestamps and UTF-8 filenames,
with CRC32 and classic ZIP size guards. Path traversal, DOS device names, invalid
Unicode and case-insensitive/Unicode-normalized collisions are rejected.

Group projects are converted into separate project directories. Cross-project
linking and COM identity currently produce a blocking diagnostic. Each child has
its own workspace build guard: MSBuild's nearest-file search cannot bypass the
root group's unresolved status.

## Pipeline and responsibilities

| Layer | Responsibility |
|---|---|
| `src/language/compiler.js` | Existing frontend, optional retained procedure syntax and shared leaf-statement IR parsing. Default execution IR remains unchanged. |
| `contracts.js`, `names.js` | Versioned options/hooks, source diagnostics, naming, type names, escaping and source-mapped writing. |
| `context.js`, `registry.js`, `record-types.js` | Module/procedure binding, declaration lookup, type information, intrinsic/control metadata and shared constants. |
| `expressions.js`, `declarations.js`, `statements.js` | AST-aware expression lowering, typed declarations, structured statements and explicit compatibility calls. |
| `array-statements.js`, `control-flow.js`, `call-semantics.js` | Ordered array-bound lowering, Variant selection predicates, Currency loop headers and reference-argument diagnostics. |
| `property-plan.js`, `optional-parameters.js` | Shared accessor representation, typed optional forwarding overloads and declaration-bound defaults. |
| `file-record-layout.js`, `file-records.js` | Recursive framework-layout proof and application-local binary record adapters. |
| `module-emitter.js`, `forms.js` | Modules, classes, contracts, properties, lifecycle procedures, WinForms designers and event bridges. |
| `representations.js`, `native-intrinsics.js`, `output-plan.js` | Conservative shape/ownership/allocation decisions, native intrinsic binding and direct-return eligibility. |
| `runtime-catalog.js`, `runtime-plan.js`, `project-layout.js` | Explicit support roots and closure, per-file imports, selected source/project/package layout. |
| `project.js`, `archive.js` | Target selection, runtime sources, project files, original retention, reports, guard generation and deterministic packaging. |
| `cli.mjs`, `src/ide/vbnet-export.js` | Bounded filesystem adapter and browser UI adapter. Neither is required by the pure converter API. |

This is not a global regular-expression substitution tool. Parsed expressions and
shared statement IR determine conversions. Structured source headers are emitted
as structured VB.NET blocks, and procedure locals are hoisted to preserve VB6
procedure scope. Original physical lines map to generated locations.

## Implemented transformations and explicit boundaries

| Area | Implemented path | Boundary requiring review/adapters |
|---|---|---|
| Declarations | Modules/classes, constants, enums, UDT structures, fixed strings, Static locals, optional/ByRef/ParamArray parameters, events and Get/Let/Set grouping; independent Let/Set and ByRef indexed accessor methods; typed optional Currency forwarding overloads. | Parameterless/default methods, dynamic dispatch of rewritten properties, and unverified optional property/interop signatures. |
| Numeric types | VB6 Integer → `Short`; Long → `Integer`; explicit conversion functions; scaled 64-bit Currency with four-place rounding. | Native Currency For loops use explicitly converted start/end/step values. Exact mixed-type/Variant promotion and every overflow boundary are not certified. |
| Arrays and records | Column-major typed arbitrary-lower-bound arrays, Variant-contained typed arrays, ordered bounds, final-dimension ReDim Preserve, typed/dynamic Erase, element factories, CLR array imports and nested value copies. | Whole fixed-array assignment, live array-element ByRef aliases, complex Variant Erase locations, multi-target resumable statements, returned-record With semantics and binary array layout. |
| Object model | Classes, method/property emission, source-class Implements contracts, WithEvents and event raising; lazy local and member As New; native With for record lvalues. | ByRef replacement of lazy locals, complete late-bound default-member coercion, COM reference identity/lifetime and all Variant object states. |
| Control flow | If/ElseIf, inline If, For/For Each, Do/Loop, While/Wend, Select Case, labels, GoTo, computed branches, explicit GoSub continuation stacks. | Variant Select uses one captured selector, ordered null-aware comparisons and eager range endpoints. Combined GoSub/error-resumption and expanded-statement resumption behavior still require review. |
| Errors | Native VB.NET On Error, Resume, Error/Err, preserved labeled handlers. | This deliberately avoids claiming that a mechanical Try/Catch rewrite preserves resumable VB6 errors. All exception-to-Err mappings are not certified. |
| Intrinsics and files | Shared intrinsic constants, many Microsoft.VisualBasic APIs, array/string adapters, scalar file operations, fixed-string/Currency binary I/O and recursively proven scalar UDT records, source-retained unsupported statements. | Exact Null/Empty/Nothing/Variant subtype behavior across every intrinsic; binary arrays, Variant/Object, and records containing compatibility storage. |
| Forms | WinForms partial class/designer split, default instances, containers, text/font/color/layout, menus, standard control fields, sparse control arrays, event bridges and initialization/close ordering. | Dynamic control Load/Unload; complete OCX/control object models, complex data binding, graphics/printing, resources, multi-form shutdown, designer pixel parity and all event orderings. |
| Native/COM | ANSI Declare emission, explicit bitness/ABI diagnostics, retained references, COM activation calls and extension points. | Raw pointers, callbacks, custom marshaling, COM type-library conversion/registration, OCX persistence and deployment are not automatic. |

The compatibility paths below remain available when a native representation is
not proved. See the native-first guide for the narrower zero-support paths.

`VbVariant` uses explicit Null handling and managed Visual Basic operators; it is
not a complete reimplementation of the VB6 Variant discriminated representation.
`Class_Terminate` is exposed through `IDisposable` with a blocking ownership
migration diagnostic, not silently equated to GC finalization. Unsupported graphics
or components are not replaced with behaviorless success stubs.

## Property, optional-argument and binary-record lowering

See [Language and record lowering](VBNET-LANGUAGE-LOWERING.md) for the accessor
method plan, declaration-bound optional defaults, binary layout eligibility,
calling-assembly constraints and regression fixtures. These transformations use
ordinary VB.NET or the framework where behavior is representable; they do not
claim that all VB6 object, interop and binary layouts are covered.

## Array and control-flow semantics

A scalar Variant can now hold a typed, arbitrary-rank array:

```vb
Dim values As Variant
ReDim values(-1 To 2, 3 To 4) As Long
values(-1, 3) = 21
ReDim Preserve values(-1 To 2, 3 To 6)
```

The emitter passes bounds as ordered pairs through `VbArrayBounds.FromPairs`:
lower 1, upper 1, lower 2, upper 2. Every bound is evaluated and converted once
in that order; separate lower/upper array initializers would reorder side effects.
`VbArrays.ResizeVariant` validates dimensions and element tags before committing
storage changes. Preserve retains the element type and all earlier dimensions.
An explicit new `As` type is allowed without Preserve on a scalar Variant; it
remains an error on a declared typed array. Fixed arrays cannot be redimensioned.

`Erase` of a Variant array returns an unallocated array with its element type
intact, **not scalar Empty**. `IsArray` remains true, `VarType` retains the array
flag and element tag, and accessing bounds before reallocation raises an error.
Object and Variant element arrays are distinguished even though both use managed
`Object` storage. Scalar values cannot be assigned to Object-only array storage.

Assignment, `Array(...)` construction and ByVal Variant procedure entry copy
owned array values, recursively including nested arrays. Referenced class objects
retain identity. CLR array import walks coordinates in VB column-major order and
preserves arbitrary lower bounds rather than using CLR enumeration order.
Interop arrays containing cyclic nested array graphs are not covered by this
value-copy model. SAFEARRAY locks and native descriptors are not reproduced.

Indexed reads/writes capture the receiver and subscripts once. Passing a migrated
compatibility-array element as a live ByRef argument is **blocked**, including named arguments:
VB.NET property copy-back is not equivalent when aliases observe intermediate
writes or the callee throws. A whole Variant variable passed ByRef still uses a
real managed reference. A proven native array with a matching-type nonescaping
call can instead pass a real CLR element reference. Named/omitted late index arguments and multi-target
ReDim/Erase under resumable error handling also require explicit adapters rather
than a misleading build-ready result.

Currency loop headers remain native VB.NET `For` statements with `VbCurrency`
bounds and step. The compiler controls bound caching, direction, `Next`, counter
mutation and `Exit For`; no hand-written While approximation is introduced.
Variant Select Case captures its selector once, uses null-aware comparisons,
retains comma-clause order and stops testing after the first match. Ranges use
eager `And` between their two endpoint comparisons; `AndAlso` would skip required
side effects. `Option Compare Text` is passed to the comparison runtime.

Permanent fixtures distinguish generated-program execution from direct runtime
contracts. They assert failed-Preserve value retention, Err numbers, array tags,
ByVal isolation/whole-Variant ByRef writes, nested ownership, CLR coordinate order,
Currency bound-call counts, positive/negative/zero steps and Select Case traces.
The existing WinForms and package/browser conformance checks remain in place.
These cases do not certify every VB6 coercion, default-member, ABI or error-resume
combination.

Primary semantic references: Microsoft [MS-VBAL ReDim](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/22b5d372-0a54-4617-9462-4934b5edc88c),
[MS-VBAL Erase](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/f7958382-95a7-47fa-91bd-42262ab9ad32),
[MS-VBAL Select Case](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/94a2f0fe-bdbe-4f5d-b3f4-bbf339b0ac65), and
[VB.NET For Next](https://learn.microsoft.com/en-us/dotnet/visual-basic/language-reference/statements/for-next-statement).
The language specification and .NET tests are not a claim of differential testing
against a licensed Microsoft VB6 compiler.

## Reusable packages

`@vb6-studio/vbnet-migration` contains ESM, TypeScript declarations, a Node CLI and
a standalone browser bundle. The package build copies the complete relative
dependency closure; an extracted tarball does not need the repository beside it.
This change creates a packable package; it does not publish it to the npm registry.

```sh
npm run build:vbnet-migration
npm run pack:vbnet-migration
node tools/test-vbnet-package.mjs
```

The authored .NET source lives in `packages/vbnet-runtime` and
`packages/vbnet-runtime-windows`. `tools/build-vbnet-runtime.mjs` embeds those exact
sources in browser exports. Do not edit generated `runtime-sources.js` directly.
The runtime projects also contain package metadata for a separately verified
`dotnet pack`; no unbuilt NuGet binary is distributed as a compiled library.

```js
import {createVbNetMigrator} from '@vb6-studio/vbnet-migration';

const converter = createVbNetMigrator({plugins: [{
  id: 'company.constants.v2',
  representationSafe: true,
  expression({node}) {
    if (node?.kind === 'id' && node.name.toLowerCase() === 'companyversion') {
      return {code: '"2026.10"', requires: []};
    }
  }
}]});
const result = converter.convertProject(project, {platform: 'AnyCPU'});
const archive = converter.exportProject(project, {platform: 'AnyCPU'});
// archive.bytes is Uint8Array; archive.fileName is a validated suggested name.
```

Extension hooks are synchronous and have unique IDs. Structured code results
declare `{code, requires}`; legacy strings remain supported conservatively.
`representationSafe` explicitly opts a trusted extension into native planning.
Finalize hooks run before support/SDK project materialization so their requirements
are included; see the native-first guide for the precise contract.

 `analyze` inspects the
snapshot and diagnostics; `expression` and `statement` may return VB source;
`control` supplies a type/initialization mapping; `finalize` may add source files.
Returning `undefined` or `null` defers to the next handler/default implementation.
Promises are rejected. Plugins are trusted host code and can execute arbitrary
JavaScript; the converter does not load them from project metadata. A custom
frontend can be injected through `compile`, following the existing compiled
project/retained-syntax contract. Diagnostics should be removed only by a verified
adapter that actually replaces the unsupported behavior, not by a blanket filter.

## Validation and release gates

```sh
npm test
npm run test:migration
npm run test:migration:browser
npm run pack:vbnet-migration
node tools/test-vbnet-package.mjs
tsc --noEmit --strict --module nodenext --moduleResolution nodenext --target es2022 tests/migration-types.fixture.mts
```

The shared .NET harness in `tests/migration-dotnet-support.mjs` builds emitted projects and
executes assertions for arrays, Currency, strings, static variables, GoSub, record
copying, As New, Implements dispatch, separate property accessors, fixed-string and
Currency binary byte goldens, optional Currency overloads and WinForms controls/events.
`migration-dotnet.test.mjs` and `migration-optional-dotnet.test.mjs` exercise both
native and compatibility output; the optional fixtures also use `Option Strict On`.
These cases are
explicitly **skipped when the .NET 10 SDK is absent**, never reported as successful
compilation. `VB6_REQUIRE_DOTNET=1` makes a missing SDK fail the gate. The dedicated
GitHub workflow installs .NET 10 on Linux and Windows; Windows executes WinForms.
Adding this workflow does not itself constitute a passed hosted CI run.

The browser test uses the real File menu and validates the exact downloaded ZIP.
`VB6_OFFLINE=1` is a supplemental local inline-assets mode for environments that
block browser navigation; it is forbidden in GitHub Actions and its report marks
real HTTP origin verification as false. JavaScript generation tests, browser
interaction tests, a .NET build and Microsoft VB6 differential behavior are
separate evidence categories. Read the exported report before treating a project
as deployable.

SDK references: Microsoft's .NET 10 download documentation, Visual Basic language
reference, SDK desktop project properties and WinForms migration documentation.
The generator requests the .NET 10 SDK feature band with latest-feature roll-forward
and uses the installed stable SDK's Visual Basic compiler rather than inventing a
separate “VB.NET 10” language version.

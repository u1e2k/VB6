# VB6 → VB.NET / .NET 10 migration

The migration engine converts the current Studio project or a native VB6 project
into editable VB.NET source and SDK projects. It is independent of the browser
runtime: exported programs compile to .NET and do not embed a JavaScript VM.

**Version 0.1.0 is not a full-fidelity converter for arbitrary VB6 programs.**
The implementation distinguishes generated source, known blocking diagnostics,
and external build/runtime verification. `success: true` means there are no known
converter blockers. It does **not** mean the .NET compiler ran, that every emitted
file compiles, or that Microsoft VB6 behavioral equivalence was demonstrated.
Known unsupported constructs remain in original sources and the migration report.

## Studio workflow

Stop execution and choose **File → Migrate to VB.NET (.NET 10 ZIP)…**. Select an
automatic, console, library or WinForms target, a platform and optional strictness.
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
| `context.js`, `registry.js` | Module/procedure binding, declaration lookup, type information, intrinsic/control metadata and shared constants. |
| `expressions.js`, `declarations.js`, `statements.js` | AST-aware expression lowering, typed declarations, structured statements and explicit compatibility calls. |
| `module-emitter.js`, `forms.js` | Modules, classes, contracts, properties, lifecycle procedures, WinForms designers and event bridges. |
| `project.js`, `archive.js` | Target selection, runtime sources, project files, original retention, reports, guard generation and deterministic packaging. |
| `cli.mjs`, `src/ide/vbnet-export.js` | Bounded filesystem adapter and browser UI adapter. Neither is required by the pure converter API. |

This is not a global regular-expression substitution tool. Parsed expressions and
shared statement IR determine conversions. Structured source headers are emitted
as structured VB.NET blocks, and procedure locals are hoisted to preserve VB6
procedure scope. Original physical lines map to generated locations.

## Implemented transformations and explicit boundaries

| Area | Implemented path | Boundary requiring review/adapters |
|---|---|---|
| Declarations | Modules/classes, constants, enums, UDT structures, fixed strings, Static locals, optional/ByRef/ParamArray parameters, events and Get/Let/Set grouping. | Simultaneous Property Let and Set, ByRef indexed-property mutation, parameterless/default methods and optional Currency metadata. |
| Numeric types | VB6 Integer → `Short`; Long → `Integer`; explicit conversion functions; scaled 64-bit Currency with four-place rounding. | Exact mixed-type/Variant promotion and every overflow boundary are not certified. Currency For loops require additional lowering. |
| Arrays and records | Column-major typed arbitrary-lower-bound arrays, checked indexing, final-dimension ReDim Preserve, fixed/dynamic Erase, element factories and nested value copies. | Whole fixed-array assignment, scalar-Variant ReDim, returned-record/array-element ByRef With semantics and binary array layout. |
| Object model | Classes, method/property emission, source-class Implements contracts, WithEvents and event raising; lazy local and member As New; native With for record lvalues. | ByRef replacement of lazy locals, complete late-bound default-member coercion, COM reference identity/lifetime and all Variant object states. |
| Control flow | If/ElseIf, inline If, For/For Each, Do/Loop, While/Wend, Select Case, labels, GoTo, computed branches, explicit GoSub continuation stacks. | Variant Select comparison and combined GoSub/error-resumption continuation behavior require review. |
| Errors | Native VB.NET On Error, Resume, Error/Err, preserved labeled handlers. | This deliberately avoids claiming that a mechanical Try/Catch rewrite preserves resumable VB6 errors. All exception-to-Err mappings are not certified. |
| Intrinsics and files | Shared intrinsic constants, many Microsoft.VisualBasic APIs, array/string adapters, scalar file operations, source-retained unsupported statements. | Exact Null/Empty/Nothing/Variant subtype behavior across every intrinsic and binary UDT/Currency/Variant/fixed-string record codecs. |
| Forms | WinForms partial class/designer split, default instances, containers, text/font/color/layout, menus, standard control fields, sparse control arrays, event bridges and initialization/close ordering. | Dynamic control Load/Unload; complete OCX/control object models, complex data binding, graphics/printing, resources, multi-form shutdown, designer pixel parity and all event orderings. |
| Native/COM | ANSI Declare emission, explicit bitness/ABI diagnostics, retained references, COM activation calls and extension points. | Raw pointers, callbacks, custom marshaling, COM type-library conversion/registration, OCX persistence and deployment are not automatic. |

`VbVariant` uses explicit Null handling and managed Visual Basic operators; it is
not a complete reimplementation of the VB6 Variant discriminated representation.
`Class_Terminate` is exposed through `IDisposable` with a blocking ownership
migration diagnostic, not silently equated to GC finalization. Unsupported graphics
or components are not replaced with behaviorless success stubs.

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
  id: 'company.constants.v1',
  expression({node}) {
    if (node?.kind === 'id' && node.name.toLowerCase() === 'companyversion') {
      return '"2026.10"';
    }
  }
}]});
const result = converter.convertProject(project, {platform: 'AnyCPU'});
const archive = converter.exportProject(project, {platform: 'AnyCPU'});
// archive.bytes is Uint8Array; archive.fileName is a validated suggested name.
```

Extension hooks are synchronous and have unique IDs. `analyze` inspects the
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

The .NET harness in `tests/migration-dotnet.test.mjs` builds emitted projects and
executes assertions for arrays, Currency, strings, static variables, GoSub, record
copying, As New, Implements dispatch and WinForms controls/events. These cases are
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

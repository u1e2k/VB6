# @vb6-studio/vbnet-migration

Extensible, source-retaining VB6 → VB.NET migration for **.NET 10**, with WinForms
source generation and deterministic ZIP exports. Pure synchronous JavaScript ESM;
the converter does not execute VB6 code. Node 22+ CLI and a standalone browser
bundle are included. Generated applications include complete compatibility-runtime
VB sources; they do not depend on the JavaScript converter at runtime.

**Version 0.1.0 is not universal VB6 compatibility.** A successful conversion means
no *known converter blockers*, not a successful .NET build or certified behavioral
parity. Reports explicitly record `dotnetBuild: "not-run"`. COM/OCX dependencies,
raw pointers, unsupported controls, resources, binary layouts and other unhandled
semantics produce review diagnostics. An unresolved export requires an explicit
option and includes an MSBuild error guard, not compilable no-op stubs.

```js
import {createVbNetMigrator} from '@vb6-studio/vbnet-migration';
import {writeFile} from 'node:fs/promises';

const migrator = createVbNetMigrator();
const project = {
  name: 'Hello', startup: 'Sub Main', settings: {},
  modules: [{name: 'Program', kind: 'module', code:
    'Option Explicit\nPublic Sub Main()\nDebug.Print "Hello from .NET 10"\nEnd Sub'}]
};
const result = migrator.exportProject(project, {target: 'console'});
await writeFile(result.fileName, result.bytes, {flag: 'wx'});
```

```sh
vb6-migrate Legacy.vbp --out Legacy-net10.zip
vb6-migrate Legacy.zip --entry Legacy/App.vbp --out Legacy-net10.zip
vb6-migrate application.vb6web --target winforms --platform x86 --out application.zip
vb6-migrate Legacy.vbp --inspect
vb6-migrate Legacy.vbp --review --out Legacy-review.zip
```

Unzip the result, review `migration-report.json`, then use `dotnet build *.slnx`.
WinForms applications run on Windows; non-UI applications target `net10.0`.
The compatibility default is `Option Strict Off` and x86 for classic interop.
`--strict` enables `Option Strict On`; it is not an inference guarantee.

## API and extensions

`createVbNetMigrator({plugins, compile})` returns `convertProject(project, options)`
and `exportProject(project, options)`. Conversion returns generated `files`,
`diagnostics`, `report`, `sourceMap`, `success` and `projectFile`. Export adds
`bytes` and `fileName`. Equivalent convenience functions are exported alongside
`migrationZip`, `MigrationError`, version constants and capability metadata.
See `index.d.ts` for the versioned contracts.

Plugins have unique `id` values and optional synchronous `analyze`, `expression`,
`statement`, `control`, `finalize` hooks. Code hooks return a VB source string or
`undefined` to defer. Plugins are trusted executable JavaScript supplied by the
caller, never loaded from project metadata. They may add diagnostics and files;
generated path collisions, traversal and asynchronous hooks are rejected.

```js
const plugin = {
  id: 'company.constants.v1',
  expression({node}, context) {
    if (node?.kind === 'id' && node.name.toLowerCase() === 'companyversion') {
      return '"2026.10"';
    }
  }
};
const converter = createVbNetMigrator({plugins: [plugin]});
```

The browser build exposes `globalThis.VB6Migration` and requires no Node APIs.
The CLI import `@vb6-studio/vbnet-migration/cli` exports argument parsing, bounded
input loading and command execution. Native directory traversal skips symlinks.
ZIP input is bounded and never extracted to arbitrary host paths.

## Architecture and boundaries

The pipeline snapshots project data, reuses the repository's parser and compiler
syntax, binds module/procedure symbols, emits structured VB.NET, generates forms,
adds source runtime projects and maps, then validates the complete archive.
Numbers preserve VB6 Integer/Long widths; lower-bound arrays, Currency and fixed
strings use explicit compatibility code. Structured loops and properties remain
structured; GoSub uses a continuation stack. Existing Microsoft.VisualBasic APIs
supply supported intrinsics rather than recreating the entire library.

Exact Variant subtype/overflow promotion, deterministic COM reference-count
lifetime, OCX designer state, raw ABI and graphics parity are not certified.
Inactive conditional-compilation branches remain in originals. Workspace projects
are retained and converted separately, but linking requires an explicit adapter.
Control and runtime limitations are recorded in the repository migration guide.

## Build from this repository

```sh
npm run build:vbnet-migration
npm run test:migration
npm run test:migration:browser
npm run pack:vbnet-migration
```

The package copies its complete dependency closure into `lib` and includes the
browser bundle in `dist`. Generated files are built before packing and are not
vendored into repository source control. MIT licensed.

# @vb6-studio/vbnet-migration

Native-first, source-retaining VB6 → VB.NET migration for **.NET 10**, with
WinForms designers and deterministic ZIP exports. Pure synchronous JavaScript
ESM, Node 22+ CLI, typed extension APIs, and a standalone browser bundle.
Converted applications do not depend on the JavaScript converter or embed its VM.

**0.2.0 defaults to native / preserve / minimal.** Simple projects need no custom
compatibility runtime. Other projects receive only the required authored support
units. This is not universal VB6 compatibility: success means no known converter
blockers, not successful .NET compilation or certified behavioral equivalence.
Reports record `dotnetBuild: "not-run"`; unresolved review archives retain guards.

## API

```js
import {createVbNetMigrator} from '@vb6-studio/vbnet-migration';
import {writeFile} from 'node:fs/promises';

const project = {
  name: 'Hello', startup: 'Sub Main', settings: {},
  modules: [{name: 'Program', kind: 'module', code:
    'Option Explicit\nPublic Sub Main()\nDebug.Print "Hello from .NET 10"\nEnd Sub'}]
};
const migrator = createVbNetMigrator();
const result = migrator.exportProject(project, {
  target: 'console', platform: 'AnyCPU', runtime: 'none'
});
await writeFile(result.fileName, result.bytes, {flag: 'wx'});
```

`convertProject` returns `files`, `diagnostics`, `report`, `sourceMap`, `success`
and `projectFile`; `exportProject` adds `bytes` and `fileName`. Convenience
functions `convertVbNetProject` and `exportVbNetProject` are also exported.
`index.d.ts` defines options, reports, plugin contracts and the immutable
`RUNTIME_CATALOG`. No input VB6, COM component, process or network request runs
while converting. Plugins are separate trusted host JavaScript.

## Output and semantic policies

| Setting | Contract |
|---|---|
| `codeStyle: 'native'` | Default. Bound records, eligible native arrays, conservative local Variant specialization, simpler functions/startup/events and intrinsic selection. |
| `codeStyle: 'compatibility'` | Legacy source representations. Defaults to project support unless runtime is explicitly selected. |
| `runtime: 'minimal'` | Default native packaging. Required source units under `Application/Compatibility/`; no extra runtime project. No directory when no support is needed. |
| `runtime: 'none'` | No support; required helpers produce actionable blocking diagnostics rather than disappearing. |
| `runtime: 'project'` | Authored source projects. Compatibility/project retains the previous full-runtime layout. |
| `runtime: 'package'` | Explicit `runtimePackage`/`windowsRuntimePackage` objects `{id, version}` for required families. No automatic package publication, availability or restore claim. |
| `semanticPolicy: 'preserve'` | Default. Unproved transformations retain compatibility support. |
| `semanticPolicy: 'modernize'` | Requires `acceptedRules: ['currency-decimal']`. This is the only currently implemented modernization rule. |

Currency → Decimal changes quantization, scaled range, subtype introspection and
binary/interop representation; it is never implicitly approved. Native field
types/array layouts must remain consistent at every relevant use. Escaping arrays,
uncertain allocation/bounds, owned initialization, multidimensional Preserve/
enumeration and most public-array contracts retain compatibility representations.
Standard `Microsoft.VisualBasic` APIs are .NET libraries, not a custom VB6 VM.

## CLI

```sh
vb6-migrate Legacy.vbp --platform AnyCPU --out Legacy-net10.zip
vb6-migrate Legacy.zip --entry Legacy/App.vbp --out Legacy-net10.zip
vb6-migrate Legacy.vbp --runtime none --inspect
vb6-migrate Legacy.vbp --code-style compatibility --runtime project --out compatibility.zip
vb6-migrate Legacy.vbp --semantic-policy modernize --accept-rule currency-decimal --out approved.zip
vb6-migrate Legacy.vbp --runtime package --runtime-package Company.Compat@0.2.0 --out shared.zip
vb6-migrate Legacy.vbp --review --out unresolved-review.zip
```

`Company.Compat` is an illustrative identity, not a published package claim.
Package versions must be explicit semantic versions. Existing files are never
overwritten; ZIP/native input reading is bounded and does not extract arbitrary
paths. `--no-originals` removes retained source copies when deliberately selected.
Originals are never included in generated compile globs.

Review `migration-report.json`, then build the generated `.slnx` with the .NET 10
SDK. WinForms runs on Windows. x86 and `Option Strict Off` remain conservative
interop defaults; `--strict` requests stricter compiler checks, not an inference
or successful-compilation guarantee.

## Extensions

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
const converter = createVbNetMigrator({plugins: [plugin]});
```

Synchronous hooks: `analyze`, `expression`, `statement`, `control`, `finalize`.
Code hooks can return `{code, requires}`, a legacy string, or `undefined` to defer.
Static `plugin.requires` and `context.requireRuntime(symbol, location, reason)`
can register explicit dependency roots. Unknown roots fail. No final application
text scanning is used to guess runtime dependencies.

Old opaque code hooks conservatively retain support. Unless they explicitly set
`representationSafe: true`, representation-sensitive optimizations remain off.
The flag and a requirements declaration are independent trusted promises.
Finalize runs after application/source emission but before runtime/SDK/solution
materialization; added VB files must provide imports or qualified names. A plugin
rewriting mapped files is responsible for its mapping changes. Path collisions,
traversal and async hooks remain errors. No plugins are loaded from project data.

The browser build exposes `globalThis.VB6Migration` without Node APIs. The CLI
entry `@vb6-studio/vbnet-migration/cli` also exports argument/input adapters.

## Reports, verification and boundaries

`report.representations` explains selected and retained layouts;
`report.runtime` lists roots, transitive features, policy, source counts/bytes and
package identities; `report.modernization` records explicit semantic changes.
Source counts are not compiled-binary or performance measurements.

COM/OCX/native ABI, general default members/Variant subtype promotion, live
compatibility-array element references, binary layouts, graphics/printing,
dynamic-control lifetime and cross-project linking still need adapters/review.
Inactive configurations and original resources are retained, not certified converted.

The repository includes generation/size budgets, independently extracted package
checks, real browser export tests, and .NET compilation/execution fixtures for both
profiles. Each support root is compiled in isolation using its dependency closure.
A missing local .NET SDK is an explicit skip; `VB6_REQUIRE_DOTNET=1` makes required
CI fail instead. Test definitions alone are not successful execution evidence.

```sh
npm run build:vbnet-migration
npm run test:migration
npm run test:migration:browser
npm run pack:vbnet-migration
```

The repository guide `docs/VBNET-NATIVE-FIRST.md` documents exact proof boundaries,
hook timing, migration controls and primary language references. Generated `lib`
and `dist` are built from the complete relative dependency closure before packing.
MIT licensed. This package is packable; no registry publication is implied.

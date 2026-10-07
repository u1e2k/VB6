# Native compiler and optimization

The JavaScript native backend emits x86 PE32 programs using installed Windows DLLs, without an embedded JavaScript VM. The compiler is extended in `src/native`; no existing native source module is removed by this work.

## Build and use

```sh
npm run build
npm run build:win32 -- --project example.vbp --out release/native --optimization 2
```

```js
import {compileWin32, X86, PE32Image, mem32} from './src/native/entry.js';
const {bytes, report} = compileWin32(project, {optimization: 2});
console.log(report.optimization, report.records);
```

Optimization 0 retains baseline instruction selection. Level 1 shortens tagged same-section branches after relocation analysis. Level 2 additionally folds safe integer expressions, selects immediate arithmetic instructions and removes branches to the immediately following instruction. It also propagates constants through conservative basic blocks of unaliased local Long storage, lowers comparisons directly to conditional branches, and uses relocated jump tables for computed branches. The propagation pass preserves all original instruction indices and source checkpoints, excludes escaped locals, and treats calls, joins, loop headers and error continuations conservatively. Overflow, division errors, eager Boolean evaluation, statement recovery and source identities must be preserved. Raw PE32Image linking defaults to level 0. These levels do not promise global register allocation, inlining, vectorization, LTO or PGO.

## Source and generated code

The previous large deletion was `dist/vb6-native.js`, a generated bundle. Current main already builds this file and `src/editor/diagnostics-payload.js` from retained source and verifies both against the exact inventory in `tools/ide-artifacts.json`. This branch preserves that established policy, all native source modules, and current main's language, themes, exports and layout code. Built distributions still include the native SDK. Normal builds must not update their own expected fingerprints.

## Current native extensions

Checked register, immediate, ModR/M and SIB operands; symbolic memory relocations; integer, x87, SSE/SSE2 and locked atomic instruction families; indirect calls; and explicit stdcall/cdecl assembler helpers are exported through the native entry point. Low-level assembler callers are responsible for ABI register preservation and CPU feature availability. Raw emit remains a deliberately unchecked escape hatch.

POD records support numeric fields, nested records and fixed inline array fields, checked indexing, copies, typed ByRef parameters, isolated parenthesized copies, Len/LenB, VarPtr and typed Win32 declarations. As Any accepts addressable unmanaged storage; explicit call-site ByVal passes pointer values. Native pointers require correct byte counts and lifetimes and are not sandboxed.

Managed records, complete Variant/Decimal semantics, class/interface and COM/OCX ownership, remaining VB runtime/control features and advanced optimizing passes are not complete. Unsupported features must fail explicitly, not be silently ignored.

## Control flow and String runtime

Native `GoSub`/`Return`, `On ... GoSub` and `On ... GoTo` now have explicit lowering. Computed selectors are evaluated once and converted to Long; 0 and selectors beyond the label list fall through, while values outside 0..255 raise error 5. GoSub return addresses live in a bounded, per-procedure-activation stack separate from ESP, preserving the error-frame stack. `maxGoSubDepth` is an API option and is exposed as `--max-gosub-depth` in the CLI (default 1,024; allowed 1..16,384). Overflow raises error 28 and Return without GoSub raises error 3. It is an explicit resource policy, not an original-VB6 depth claim.

`Do Until` and `Loop Until` respect the frontend's inverted branch polarity. Nested `With` blocks support addressable POD records, capture an indexed receiver once, and retain field ByRef aliases. Structured exits clear captured addresses; entering a block without a captured receiver raises error 91. Object/form/control With receivers still require additional lowering and remain diagnosed.

Length-aware BSTR helpers add `Trim`/`LTrim`/`RTrim`, `StrReverse`, `LCase`/`UCase`, and `StrComp` (including applicable `$` forms). Trimming removes U+0020 only. Reversal operates on UTF-16 code units and retains embedded NULs. Case conversion uses Windows `LCMapStringW` with explicit lengths and queried output capacity; results are independently owned. `StrComp` supports binary/text comparison, omitted caller defaults and `vbUseCompareOption`. Native String operators now support `Option Compare Text` using installed Windows collation, without claiming portable locale-identical results on other systems.

Packed SSE/SSE2 memory arithmetic has hardware alignment requirements. The execution fixture exercises truly unaligned MOVDQU loads/stores, register arithmetic, and a separate 16-byte-aligned packed-memory path. The low-level assembler does not silently realign arbitrary caller pointers.

## Validation

```sh
npm test
node tools/verify-x86-encodings.mjs
node tools/win32-optimizer-fixtures.mjs
```

On Windows:

```powershell
./tools/test-win32-optimizer.ps1
```

The Windows driver executes twelve programs: four fixture families at O0/O1/O2, including new control-flow/String semantics, the existing compiler/record regression, existing arithmetic and direct assembler checks. It verifies executable hashes and exit statuses, enforces timeouts, and checks for unwanted adjacent extracted files. Evidence stays in CI artifacts rather than adding generated reports to source control.

Compilation is not native execution evidence. Use final-head CI results and actual execution reports. The earlier conversation cited Windows run IDs that were not retrievable and described a main integration that had not been published; those claims must not be treated as validation. The current work revalidates the published tree and records observed results only.

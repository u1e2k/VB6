# Native compiler and optimization

The JavaScript native backend emits x86 PE32 programs using installed Windows DLLs, without an embedded JavaScript VM. All existing native source modules are retained. This document describes the implemented subset, not complete VB6/runtime/Win32/COM/OCX parity.

## Build and use

```sh
npm run build
npm run build:win32 -- --project example.vbp --out release/native --optimization 2
# Optional removal of unreachable generated procedures and their unused imports:
npm run build:win32 -- --project example.vbp --out release/pruned --optimization 2 --prune-unused-procedures
```

```js
import {compileWin32, X86, PE32Image, mem32} from './src/native/entry.js';
const {bytes, report} = compileWin32(project, {
  optimization: 2,
  pruneUnusedProcedures: true,
  maxGoSubDepth: 1024
});
console.log(report.optimization, report.records);
```

All levels use compact flag-equivalent machine encodings where available. Level 0 disables optimization passes. Level 1 shortens tagged same-section branches after relocation analysis. Level 2 additionally folds safe typed integer expressions, selects immediate arithmetic, redirects verified branches through pure jump chains and removes branches to the immediately following instruction. It lowers comparisons directly to conditional branches and uses relocated jump tables for computed branches.

The constant-propagation pass tracks unaliased Byte, Integer, Long and Boolean locals with their storage types, assignment ranges and Boolean normalization. Explicit forward joins retain only facts shared by every incoming path. Loop backedges, unknown effects, escaped locals and error continuations are conservative barriers. Complex flow and large instruction/local products use a bounded basic-block fallback. No instruction index, checkpoint or eager operand is deleted.

Overflow, division errors, eager Boolean evaluation, statement recovery and source identities remain observable. Raw `PE32Image.finish()` defaults to level 0. These levels do not provide global register allocation, inlining, advanced loop optimization, vectorization, LTO or PGO.

## Source, generated code and pruning

`dist/vb6-native.js` and `src/editor/diagnostics-payload.js` are generated from retained source. Their exact inventory and fingerprints are verified by `tools/ide-artifacts.json`; normal builds cannot update their own expectations. Built distributions still include the standalone `VB6Native` browser/worker SDK. The earlier removal of a tracked generated bundle did not remove its compiler implementation.

`pruneUnusedProcedures` is an opt-in Boolean requiring optimization 2. It removes unreachable **generated procedure code**, never source modules. It follows code/data relocations and callback references, retains address-taken procedures, rebases addresses and marks removed source-map entries with `optimizedOut: true` and `rva: null`. All procedures are still lowered and checked before pruning, so unsupported constructs cannot disappear silently. It also removes imports that have no symbolic references after procedure pruning; shared runtime helpers are retained. Reports list `removedProcedures`, `removedImports` and retained import counts. The low-level `PE32Image.finish()` option `pruneUnusedImports` defaults to the procedure-pruning setting and can independently enable import pruning at O2 or explicitly disable it. References to import-table metadata or nonzero import-address offsets conservatively retain the whole import table.

Pruning is opt-in because removing an otherwise unused DLL also removes its loader initialization. Do not enable it for programs relying on that side effect, raw numeric code/IAT pointers or manually computed import-table layout. The low-level `pruneNativeProcedures` API requires closed code-unit metadata and relocation-described addresses. Address-taken callbacks and referenced ordinal imports remain live; pruning does not bypass unsupported-feature diagnostics.

## Integer semantics

Byte, Integer, Long and Boolean expression widths and authored literal type characters are preserved independently of the physical EAX register width. Intermediate narrow overflow checks are not postponed until assignment. For example, `2000 * 365` overflows Integer, while `2000& * 365` uses Long. Boolean arithmetic promotion, Byte bitwise masks, signed literal endpoints and Long-minimum `Mod -1` retain their explicit semantics. Constant folding respects the same intermediate widths and never cancels an overflowing subtree.

O2 replaces signed division and remainder by constant powers of two with exact bias/shift/mask sequences that round toward zero. Division of Long minimum by -1 still raises overflow; `Mod -1` returns zero. Neutral and annihilating integer operations retain left-operand evaluation, including calls and errors. Immediate `Eqv`/`Imp` keep the result's declared width. No fast-math reassociation or approximate division is used.

Expression-type caching is scoped to an instruction and reset on compiler-context changes. It does not retain stale local types or With bindings across statements.

## Native records and pointers

POD records support numeric fields, nested records and fixed inline array fields, checked indexing, copies, typed ByRef parameters, isolated parenthesized copies, Len/LenB, VarPtr and typed Win32 declarations. As Any accepts addressable unmanaged storage; explicit call-site ByVal passes pointer values. Native pointers require correct layouts, byte counts and lifetimes and are not sandboxed. Indexed Len/LenB arguments retain receiver/subscript evaluation and bounds checks.

Managed records, fixed-String record fields, SAFEARRAYs of records, record function returns and ByVal record parameters are not fully lowered. Complete Variant/Decimal semantics, classes/interfaces, COM/OCX ownership and remaining runtime/control services are also incomplete. Unsupported features produce explicit diagnostics.

## Control flow and With

Native `GoSub`/`Return`, `On ... GoSub` and `On ... GoTo` have explicit lowering. Computed selectors are evaluated once and converted to Long; 0 and selectors beyond the label list fall through, while values outside 0..255 raise error 5. GoSub return addresses use a bounded per-activation stack separate from ESP. `maxGoSubDepth` is available through the API and `--max-gosub-depth` CLI option (default 1,024; allowed 1..65,536, subject to the existing 512 KiB procedure workspace budget). Overflow raises error 28; Return without GoSub raises error 3. This is a resource policy, not a claim about the original VB6 depth limit.

`Do Until` and `Loop Until` honor the frontend's inverted branch polarity. Nested `With` supports addressable POD records, forms and supported intrinsic controls. Indexed receivers are captured once, including the control-array Index and HWND slot. Structured exits clear the active binding without changing lexical lowering; entry into an unentered binding raises error 91 before dereference or mutation. General class/COM With receivers are not implied by these supported cases.

## Counted String runtime

BSTR helpers support `Trim`/`LTrim`/`RTrim`, `StrReverse`, `LCase`/`UCase`, `String`, `StrComp` and `InStrRev`, including applicable `$` forms. Added intrinsic signatures accept named and omitted arguments while preserving authored evaluation order and formal ABI slot order. Results have per-statement ownership.

Trimming removes U+0020 only. Reversal operates on UTF-16 code units and preserves embedded NULs. Repetition preserves counted lengths, including NUL characters; numeric character codes use the installed ANSI code page rather than a Latin-1 approximation. Case conversion retains Windows `LCMapStringW` with explicit lengths and queried output capacity, including length-changing mappings. `StrComp` supports binary/text comparison, caller defaults and `vbUseCompareOption`; String operators and String Select Case support Option Compare Text through Windows collation. Locale-identical behavior across other platforms is not claimed.

Binary `InStrRev` uses a reusable counted REP-comparison kernel over UTF-16 units, with checked lengths, bounded candidate ranges and unchanged ownership. Zero-length ranges do not dereference their pointers. The text path retains installed Windows `CompareStringW`; neither embedded NULs nor explicit character counts are replaced by zero-terminated comparisons.

## Checked assembler

The SDK exports checked registers, immediates, ModR/M/SIB memory operands and symbolic relocations; integer, x87, SSE/SSE2 and locked atomic families; indirect calls; and explicit stdcall/cdecl helpers. Additional instructions include INC/DEC, bit scans/tests/modifications, double shifts, MOVD/MOVQ and MXCSR transfers. Accumulator immediate forms, sign-extended word immediates and EBP displacement encodings are shortened without changing their flags or EAX effects. Register INC/DEC preserve carry; they are not substituted for ADD/SUB when carry is observable.

`stringInstruction(name, width, repeat)` validates MOVS/CMPS/STOS/LODS/SCAS at 8/16/32 bits before emitting any byte. `repCompare`/`repScan` select checked repeat conditions. Direction/carry and PUSHFD/POPFD helpers are available. These use implicit ESI/EDI/ECX and AL/AX/EAX operands; callers must provide bounded valid buffers and restore CLD before Windows calls or returns. Low-level callers remain responsible for register preservation, CPU feature availability and floating-point control state. Raw `emit` is deliberately unchecked.

Legacy packed SSE/SSE2 memory arithmetic can require 16-byte alignment. `sseUnaligned(name, destination, memory, scratch)` explicitly loads packed memory through MOVDQU and applies the register operation. It requires a distinct scratch XMM register and validates both plans before emitting either. It does not silently change raw `sse` semantics or realign arbitrary caller pointers.

## Validation

```sh
npm test
node tools/verify-x86-encodings.mjs
node tools/test-x86-cpu.mjs
node tools/test-native-optimizer-cpu.mjs
node tools/win32-speed-size-fixtures.mjs
```

On Windows:

```powershell
./tools/test-win32-optimizer.ps1
```

The existing Validate workflow retains all build, browser, Windows-system and COM/OCX jobs. Its native-compiler job requires 30 distinct executables: nine fixture families at O0/O1/O2 plus pruned O2 continuation-language, String-library and speed/size variants. The speed/size fixture writer calls the original fixture writer and retains all 23 pre-existing variants. Original compiler/records, arithmetic, language and assembler checks are retained. Fixtures cover typed overflow, signed strength reduction, forward joins and loop barriers, carry/direction flags, bounded counted-string instructions, evaluated-once With, real HWND controls, named arguments, counted NUL strings, live Win32 declarations and procedure/import pruning. The driver verifies hashes, exit statuses, matrix completeness, timeouts and absence of adjacent extracted files. Reports and executable evidence stay in CI artifacts.

GNU assembler/objdump differential validation covers 4,259 encodings. The separate Linux x86-64 CPU check tests equivalent SSE2 instructions at all 16 byte alignments and reproduces the unsafe legacy form's fault; it is not a Windows ABI or PE32 oracle. The additional Linux x86-64 optimizer harness executes the production arithmetic and counted-comparison encodings against independent C integer oracles and guard-page buffers. It covers signed power-of-two divisors, all Integer inputs, seeded Long inputs, zero-length inaccessible pointers, bounded string lengths and mismatches. These shared instruction encodings are not a substitute for the separate PE32 Windows execution matrix. Node tests compare 4,624 typed integer binary combinations to the shared runtime, with additional unary, encoding, linking, ownership and diagnostic checks.

Compilation and earlier-head CI do not establish native execution of a new revision. Check the actual final-head `native-optimizer-execution` artifact and `execution.json`, alongside the other validation jobs. Historical conversation claims without retrievable matching artifacts are not validation evidence.

# Native x86 string and form metadata contracts

This increment extends the direct PE32 backend, not the JavaScript interpreter or
an extracted runtime. Generated programs use counted UTF-16 BSTRs and installed
Windows APIs. It does not establish complete VB6 language, COM, OCX, or framework
compatibility. See also [native optimizer contracts](native-compiler-optimization.md).

## Replace and InStr

`Replace(expression, find, replace, [start], [count], [compare])` and `Replace$`
now lower to native x86. Arguments can be positional, named, or explicitly omitted
where optional. Supplied expressions execute exactly once in authored order;
formal order determines the six-DWORD stdcall frame. Earlier string arguments are
snapshots, so later ByRef mutations do not change an already-evaluated input.

The emitter computes the output size, allocates once, and fills that allocation.
Matches are non-overlapping. `start` is one-based and the returned string begins
at that position, without the preceding source prefix. Empty find or zero count
copies that suffix; empty source or past-end start returns an empty string.
Binary matching preserves embedded NULs and individual UTF-16 code units.

`start < 1`, `count < -1`, and unsupported comparison modes raise recoverable
error 5. Inputs and output retain the native 1,048,576-code-unit budget; exceeding
it raises error 7 before assignment. Allocation or second-pass failures do not
release or overwrite the caller's previous destination value. Failed fills free
their owned result. Programs that never call this builtin omit its new emitter.

`InStr` accepts its two-positional-string shorthand and formal
`start`, `string1`, `string2`, `compare` names. An explicitly supplied comparison
requires an explicitly supplied start. Defaults and `vbUseCompareOption` resolve
in the caller's module. User procedures continue to shadow both builtin names.

**Comparison boundary:** binary and text modes are supported. Text mode uses the
installed user's Windows locale and the existing fixed-width `CompareStringW`
search contract. Arbitrary LCIDs, Access database comparison, general
Variant-return/Null-propagation semantics for these String-valued intrinsics,
and variable-width linguistic equivalence are not implemented here. The
[separate native Variant runtime](WIN32-VARIANTS.md) now supports scalar Null
values; that does not redefine the return contract of every String builtin.
Replace's omitted comparison follows the existing project runtime's Option Compare
policy; this is not an exhaustive original-VB6 oracle.

## Split, Join and Filter

`Split` and `Filter` produce owned, zero-based native String SAFEARRAY results.
They can be assigned to a dynamic variable-length `String()` destination, nested
inside another supported String-array intrinsic, indexed immediately, or supplied
to LBound/UBound. `Join` returns an owned counted BSTR. Positional, named and omitted
optional arguments use the same evaluate-once argument planner as native calls.
An earlier array argument is copied before a later argument can mutate it.

```vb
Option Explicit
Option Base 1

Public Sub Main()
    Dim parts() As String
    Dim selected() As String
    Dim joined As String

    parts = Split("one,,two,three,", ",")
    If LBound(parts) <> 0 Or UBound(parts) <> 4 Then Error 5
    selected = Filter(parts, "o", True, vbBinaryCompare)
    joined = Join(selected, "|")
    If joined <> "one|two" Then Error 5
    joined = Join(Filter(Split("a,b,a", ","), "a"), ":")
    If joined <> "a:a" Then Error 5

    parts = Split("A" & ChrW(0) & "B", ChrW(0))
    joined = Join(parts, ChrW(0))
    If Len(joined) <> 3 Then Error 5
End Sub
```

Split preserves empty items, including a trailing empty item, and does not overlap
matches. Its limit leaves the remaining suffix in the final element. An empty
expression or zero limit creates an allocated empty array with lower bound 0 and
upper bound -1; an empty delimiter with nonempty input produces one item.
A limit below -1 is error 5. Option Base does not change these result bounds.

Join/Filter accept one-dimensional typed String arrays, including fixed arrays
with negative lower bounds. An unallocated source raises error 9; a multidimensional
source raises error 13. These String-array intrinsics do not accept ordinary
Variant-boxed arrays or arbitrary Variant()/Object arrays as their source.
[General Variant array boxing](WIN32-VARIANTS.md) is implemented separately. Split/Filter assignment to fixed arrays
or fixed-length String-array destinations remains a compile diagnostic.

Empty Filter needles match every source item; inclusion retains those items and
exclusion creates an empty result. Empty results are valid Join inputs. Binary
comparisons preserve UTF-16 code units and embedded NULs; text mode retains the
installed fixed-width Windows NLS matching contract. Unsupported modes raise
error 5; omitted and vbUseCompareOption modes use the caller's Option Compare.

Completed array results are published transactionally. Self-assignment reads a
snapshot, and failure does not replace the prior destination. Publishing into a
ByRef-pinned array raises error 10 instead of invalidating an element address.
Temporary arrays have explicit release ownership on success and error unwind.
Split/Filter element backing storage observes the configured maxArrayBytes limit;
Join observes the existing 1,048,576-code-unit result budget. Separate BSTR payloads
are not included in the per-array descriptor/backing-store budget.

## Tag, Name, and TabStop

Design and runtime `Tag` values on supported HWND controls, forms, and scalar or
statically indexed Timers use owned counted BSTR storage. Existing nonvisual
ImageList/CommonDialog tags retain their state-record ownership; their owner form
is validated as an HWND rather than treating the state pointer as a window. Getters produce owned
snapshots. Setters resolve the receiver, copy the incoming value, swap the owner,
and then release the previous value. Empty strings and self-assignment are valid.
A setter whose receiver is no longer live after RHS evaluation reports error 5
instead of installing another allocation into that unloaded object.

Timers have no control HWND. Their Tag slots belong to their containing form;
indexed access selects the saved evaluated Index, including `With` bindings.
Missing indices raise error 340. Unloading a form releases its standalone tags;
reloading restores authored values. This retains the backend's existing implicit
form-loading and reentrant Initialize behavior, not a new general object model.

`Name` is a read-only String for forms and supported controls. Indexed Name reads
evaluate and validate their receiver rather than silently substituting a constant.

`TabStop` is a Boolean backed by the actual HWND's `WS_TABSTOP` bit. Changes preserve
other style bits, normalize nonzero numeric values, and affect native dialog tab
traversal. Reads observe external Win32 style changes. The emitter follows the
Windows zero-return/last-error contract rather than interpreting every zero as
failure. It applies to the explicit tabbable control set in
`src/native/control-metadata.js`; PictureBox and non-input controls are not added
to that set here. Runtime TabIndex reordering and dynamic control creation remain
outside this increment.

## Reproduction and evidence

```sh
npm run build
npm test
node --test tests/win32-replace-emitter.test.mjs tests/win32-string-binding.test.mjs tests/win32-control-metadata.test.mjs
node tools/win32-speed-size-fixtures.mjs
node tools/win32-control-fixtures.mjs
```

On Windows, execute the unchanged fixture drivers:

```powershell
./tools/test-win32-optimizer.ps1
./tools/test-win32-controls.ps1
```

The String-library family contains 87 assertion groups and runs at O0, O1, O2,
and pruned O2. The editing family retains its original 14 assertions and adds 23
metadata groups, running at O0, O1, and O2. New checks include counted design-time
and runtime tags, snapshots, empty/self assignment, independent timer/HWND array
state, unload/reload, actual `GetNextDlgTabItem` traversal, and repeated replacement.
The integrated Windows control matrix retains all 20 main-branch families:
60 executables and 729 assertions. Matrix completeness checks, timeouts, executable
hash verification, and no-extraction checks are retained.

String-array compiler and mocked-kernel regressions are in
`tests/win32-string-array-binding.test.mjs` and
`tests/win32-string-array-kernels.test.mjs`. The 37 additional Windows String-array
groups are retained in `tools/win32-string-array-fixtures.mjs`.
`tests/win32-runtime-doc-examples.test.mjs` compiles the complete example above
at O0/O1/O2 without treating that compilation as native execution.

Node compilation, encoding and ownership checks are not Windows execution proof.
Review the current commit's `native-optimizer-execution` and
`native-control-execution` artifacts, particularly their `execution.json` files.
Earlier-head results do not certify a later implementation change.

## API references

- [Replace function](https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/replace-function)
- [InStr function](https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/instr-function)
- [SysAllocStringLen](https://learn.microsoft.com/en-us/windows/win32/api/oleauto/nf-oleauto-sysallocstringlen)
- [GetWindowLongW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowlongw)
- [SetWindowLongW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowlongw)

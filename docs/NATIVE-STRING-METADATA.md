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
search contract. Arbitrary LCIDs, Access database comparison, Variant/Null
propagation, and variable-width linguistic equivalence are not implemented by
this increment. Replace's omitted comparison follows the existing project
runtime's Option Compare policy; this is not an exhaustive original-VB6 oracle.

## Tag, Name, and TabStop

Design and runtime `Tag` values on supported HWND controls, forms, and scalar or
statically indexed Timers use owned counted BSTR storage. Getters produce owned
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

The String-library family contains 50 assertion groups and runs at O0, O1, O2,
and pruned O2. The editing family retains its original 14 assertions and adds 23
metadata groups, running at O0, O1, and O2. New checks include counted design-time
and runtime tags, snapshots, empty/self assignment, independent timer/HWND array
state, unload/reload, actual `GetNextDlgTabItem` traversal, and repeated replacement.
Original fixture families, matrix completeness checks, timeouts, executable hash
verification, and no-extraction checks are retained.

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

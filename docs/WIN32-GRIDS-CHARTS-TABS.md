# Native grid, chart and tab-page contracts

These are direct x86/PE32 implementations. Compiler-side JavaScript emits private
VB procedures and native helper calls; the ordinary compiler lowers those
procedures to x86. The generated EXE contains neither JavaScript source nor a
JavaScript/VB interpreter. The browser runtime, optional native layout kernel and
Win32 control implementation remain different backends with explicit boundaries.

## Dense unbound grids

`MSFlexGrid`, `MSHFlexGrid` and `DataGrid` have real HWNDs with a grid subclass,
GDI cell painting and native scrollbars. `GridData` is a saved rectangular matrix,
not an ADO/DAO provider. The current contract is an **unbound dense text grid**:
MSHFlexGrid hierarchical bands and DataGrid recordset binding are not implied.

The private storage kernel implements `Rows`, `Cols`, `FixedRows`, `FixedCols`,
`Row`, `Col`, `RowSel`, `ColSel`, `TopRow`, `LeftCol`, `Redraw`, `Locked`,
`SelectionMode`, `ScrollBars`, `GridLines`, fixed/selection colors, `Text`,
`TextMatrix(row,col)`, `Clip`, `FormatString`, `ColWidth(index)`,
`RowHeight(index)`, `RowData(index)`, `ColData(index)`, `ColAlignment(index)`,
`AddItem`, `RemoveItem` and `Clear`. Geometry/data indices are zero-based; the
width/height/alignment setters accept -1 for every element. Selection, row
insertion/removal and resize retain their respective metadata and overlapping
cells. FormatString uses `<`, `^` and `>` alignment and `|`-separated headings.

Storage is bounded at 1,048,576 cells, 100001 rows, 10000 columns and 1,048,576
UTF-16 code units per cell. Zero rows are permitted; at least one column is
required. Widths/heights use twips and are bounded at 300000 per element. These
are exporter limits, not claims about Microsoft's controls. Pointer tables use
SAFEARRAY storage; individual cell text uses owned BSTRs. Stored cells preserve
embedded NULs and supplementary Unicode. Allocation/copy failure during a resize,
row insertion or Clip replacement releases staging arrays and leaves the old
matrix intact. Caller-visible HWND/epoch stamps reject stale receivers after a
form is unloaded and recreated.

Painting visits only the visible cell range, clips each cell and restores the
HDC. It creates no HWND per cell and no GDI brush per cell. WM_PAINT pairs
BeginPaint/EndPaint; WM_PRINTCLIENT paints into the caller's DC without calling
EndPaint on that DC. Native scrollbar track positions use GetScrollInfo rather
than the truncated HIWORD of the scroll message. Partial wheel detents accumulate.
Keyboard navigation and mouse selection deliver RowColChange, SelChange, Scroll,
Click and DblClick through the owning form, including nested/indexed controls.

### In-place editing

F2, a printable character, or a cell double-click opens one temporary Unicode EDIT
child. Enter commits; Escape cancels; loss of focus attempts a commit. The editor
inherits the grid font, is clipped to the visible cell rectangle, and limits text
to the bounded String size. A locked grid, fixed header or offscreen cell does not
open an editor. A resize cancels the active editor instead of leaving it detached
from its cell. A cell containing an embedded NUL cannot be represented by EDIT and
raises error 5 before creating a truncated editor; its stored value is preserved.

The unbound transaction dispatches `BeforeColUpdate`, then `Validate`, then writes
the cell and dispatches `AfterColUpdate`. A cancellation discards the proposed
value and closes the editor, matching the existing browser grid's transaction.
The scalar callback contract is `ColIndex As Integer`, `OldValue As String` and
`Cancel As Integer` for BeforeColUpdate; Validate accepts a ByRef Boolean or
Integer Cancel slot; AfterColUpdate receives a ByRef Integer column. An authored
Variant OldValue signature is **not** silently converted to String: the current
AOT Variant/object boundary still rejects it. Indexed grids prepend their Index.

Each edit session owns its old text and has a reference-counted native record.
Validation can replace its ByRef old String without invalidating ownership.
Before writing, the session checks the grid HWND, epoch, data revision and Locked
state. A callback that writes/resizes data, destroys the editor, or recreates the
form cannot cause the pending edit to overwrite a different cell. Destruction
inside validation keeps the retained session alive until its caller returns.
Temporary HWNDs, records and old/proposed BSTRs are released on cancellation and
normal completion. Failure paths are covered by emitted-instruction tests.

There is no claim yet for native data-bound editing, provider update errors,
hierarchical bands, merged cells, arbitrary cell formatting, full sorting,
clipboard service integration, every grid event or complete original control API.

## MSChart

The native MSChart implementation stores a bounded binary-Double matrix in a
VT_R8 SAFEARRAY and row/column labels in BSTR arrays. It supports `RowCount`,
`ColumnCount`, selected one-based `Row`/`Column`, `Data`, `RowLabel`, `ColumnLabel`,
`Redraw` and **ChartType 1 (column) or 3 (line)**. These paths paint real GDI plots
with multiple series, axes and row labels. Empty data sets and negative values
are supported; finite extreme values are normalized before calculating a range
so opposite Double extremes do not overflow merely during chart scaling.

Saved JSON values are passed into the private kernel as explicitly typed Double
literals, including fractional values and integral values outside the Long range.
They must not use the scalar compiler's untagged-Long synthetic literal path.
Linked-PE regressions check the binary values and reject unconditional startup
overflow jumps at O0/O1/O2, including negative zero and subnormal seeds.

Rows/columns are bounded at 10000 each and one million total values. Matrix/label
resizing is transactional and keeps overlap. NaN, infinity and other chart types
fail explicitly. The full ChartSpace/Plot/Axis/Series object model, legends,
3D/area/pie/scatter plots, data binding and full chart event/style APIs remain
unimplemented. No physical drawing-performance or all-chart parity claim is made.

## Explicit tab-page ownership

`SSTab` and `TabStrip` support named page children through saved
`Tabs: [{Caption, Controls: [...]}]` entries or a child's zero-based `TabPage`
property. The child must have the tab as its direct parent; an indexed parent
must be unambiguous. Names such as `Button(2)` retain the control-array element.
Unassigned controls remain shared, rather than being silently assigned to page 0.
Conflicting/missing bindings and malformed raw FRM page counts are rejected.

Raw `Tab(i).Control(j)`, `Tab(i).ControlCount` and `TabCaption(i)` metadata is also
recognized. Original SSTab files may store inactive children shifted left by
75000 twips. The export clone restores that saved offset only when the explicit
raw page binding identifies an inactive SSTab child. The user's saved project is
not changed. Native export then uses logical positions plus visibility masking;
this does not reproduce the original control's negative Left property convention.

A page masks its children's WS_VISIBLE bits without overwriting their logical
Visible properties. `Visible=False` remains false when the page is revisited.
Programmatic selection, native TCN_SELCHANGE, Clear and optional layout all use
this mask. Hiding a focused descendant repairs focus only if the tab's HWND and
page generation still match; reentrant unload/recreation cannot focus a stale
window. Nested Frames/PictureBoxes keep their native children and coordinate
systems. Programmatic tab selection explicitly routes the event because
TCM_SETCURSEL alone does not generate TCN_SELCHANGE.

`TabCaption` and zero-based `TabCaption(index)` use native Unicode item messages.
Reads grow an owned BSTR rather than truncating at 4096 characters and handle the
TCM_GETITEM contract where the control replaces pszText or returns NULL. Empty
captions are allowed; embedded NULs are rejected. Bad indices report error 381.
Caption helpers and page-mask helpers are independently usage-driven.

Dynamic full Tabs item objects, Add/Remove lifetime semantics, hidden/disabled
headers and every keyboard/accessibility/layout detail remain unfinished. Hidden
or disabled saved header state is explicitly rejected rather than silently
ignored. The existing opt-in native anchoring/docking/stack/wrap kernel remains
unchanged in scope; advanced browser-only layout fields remain diagnostics.

## Validation boundaries and extension points

- `control-grid-contract.js` validates saved dimensions and cell payloads.
- `control-grid-core.js` is the private, compiler-owned VB storage/navigation
  kernel. `control-grid.js` resolves receivers and emits the reachable procedure
  closure; `control-grid-host.js` owns SAFEARRAY/GDI intrinsics.
- `control-grid-window.js` and `control-grid-edit.js` handle actual HWND messages
  and bounded in-place editor lifetimes, without changing the browser engine.
- `control-chart-core.js` / `control-chart-host.js` separate data algorithms from
  native GDI and binary-Double SAFEARRAY access.
- `control-tabs.js` owns export normalization and visibility; `control-tab-text.js`
  owns bounded native Unicode captions.

The VM kernel tests exercise algorithms with failure injection and randomized
matrix operations. The test-only IA-32 machine executes emitted helper bytes with
explicit mocked APIs and guarded memory. Neither establishes real Windows GUI,
GDI, x87/COM ABI, IME, accessibility or performance correctness. The ordinary
Windows control driver independently requires all 19 fixture families at all
three optimization levels (57 EXEs). All 57 passed on Windows in [run 37736233835](https://github.com/wieslawsoltes/VB6/actions/runs/37736233835)
on `abe5277f538bd837be44b6b093941ffcdbb6c131`, including the original chart
assertions after the typed-Double startup correction. This is an execution
checkpoint, not a replacement for current-head native and repository checks.
Do not merge without those checks; missing test-support files must not be bypassed.

Primary platform contracts used by these paths:

- [SAFEARRAY BSTR parameter indirection](https://learn.microsoft.com/en-us/windows/win32/api/oleauto/nf-oleauto-safearrayputelement)
- [32-bit scrollbar state](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getscrollinfo)
- [BeginPaint / EndPaint ownership](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-beginpaint)
- [EDIT character limit](https://learn.microsoft.com/en-us/windows/win32/controls/em-setlimittext)
- [EDIT selection](https://learn.microsoft.com/en-us/windows/win32/controls/em-setsel)
- [EN_KILLFOCUS parent notification](https://learn.microsoft.com/en-us/windows/win32/controls/en-killfocus)
- [Tab selection notifications](https://learn.microsoft.com/en-us/windows/win32/controls/tcm-setcursel)
- [TCM_GETITEM pointer replacement contract](https://learn.microsoft.com/en-us/windows/win32/controls/tcm-getitem)
- [Archived Microsoft KB 150417: SSTab's saved Left offset](https://www.betaarchive.com/wiki/index.php/Microsoft_KB_Archive/150417)

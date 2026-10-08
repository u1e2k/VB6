# Freestanding Win32 control lowering

This is the direct x86/PE32 backend, not an Electron export. `src/native/control-catalog.js` describes native classes and per-family system dependencies; `controls.js` integrates creation, state, lifetime and notifications into the compiler. These JavaScript modules run **while compiling** and are not embedded in the EXE.

## Implemented mapping and bounded behavior

There are 36 mapped control types, including two nonvisual native services. Mapping is not a claim that every browser/VB6 property, method, event or resource is implemented.

| Control family | Current native implementation |
| --- | --- |
| CommandButton, Label, TextBox, CheckBox, OptionButton, Frame, ListBox, ComboBox, Timer | Existing HWND/timer lowering, shared fonts, values, list operations and form lifecycle retained. Creation styles additionally respect edit alignment/locking/scrollbars/passwords, multi-selection list styles and button notification styles. |
| HScrollBar, VScrollBar, ProgressBar, Slider, UpDown | Native scrollbar/common-control classes, signed 32-bit ranges and positions, supported range-property setters, line/page increments, slider ticks and UpDown acceleration. Nested scroll/notification forwarding and Change/Scroll dispatch are lowered. Reversed ranges are rejected. |
| TreeView, ListView | Native tree and list-view windows populated from saved nodes, columns, rows and subitems. Tree keys/parents/cycles are checked before generation. Collection Count/Clear operates on native items. Full keyed item objects, Add/Remove/item-property APIs and object-valued events remain unimplemented. |
| StatusBar, Toolbar | Actual saved status panels and toolbar buttons; Count/Clear and supported style/text operations. Saved image indices and borrowed ImageList bindings are lowered. Full panel/button object APIs and object-valued click events remain unimplemented. |
| TabStrip, SSTab | Native tab items/captions, selected Tab, Count/Clear and selection notifications; SSTab Click receives the previous tab index. Native page ownership, logical Visible masking, raw FRM page metadata and bounded Unicode TabCaption access are implemented. Full dynamic tab-item objects and hidden/disabled headers remain unfinished; see the [grid/chart/tab contract](WIN32-GRIDS-CHARTS-TABS.md). |
| DTPicker, MonthView | Native date/common controls, calendar-validated ISO design seeds, Date getters/setters through SYSTEMTIME and OLE DATE, and Change notification mapping. The complete date-control property/event surface is not implemented. |
| RichTextBox | System RichEdit loaded from System32; owned Unicode text and logical range selection/replacement, supported edit properties and Change/SelChange notifications. Persisted TextRTF, TextRTF/SelRTF getters/setters and LoadFile/SaveFile (0=RTF, 1=text) use native streaming. Selection fonts, emphasis, colors and paragraph alignment/indentation are lowered through native format records as described below. OLE embedding and the rest of the rich-formatting API remain unimplemented. |
| DriveListBox, DirListBox, FileListBox | Native combo/list windows populated by Unicode Windows drive/file enumeration. Supported Path/Pattern/Drive/FileName/ListIndex/ListCount/Refresh operations; semicolon-delimited file patterns. No process-current-directory mutation; enumeration handles and owned path strings have cleanup. Complete classic navigation, attribute filtering and event parity remain unfinished. |
| PictureBox, Image, Shape, Line | Native owner-drawn surfaces and nested PictureBox parenting. Shape/Line use GDI with authored shape/fill/border settings and supported mutable drawing properties. Embedded BMP/PNG/JPEG/GIF and ICO resources, runtime LoadPicture and owned Picture assignment use GDI+/HICON rendering. Form Icon also emits PE icon resources. PictureBox graphics/printing APIs beyond the documented surface still remain unimplemented. |
| ImageList | Nonvisual HIMAGELIST, bounded image dimensions, saved ListImages, keyed/one-based item access, Add/Remove/Clear, Key/Tag/Index/Picture, and tree/list/toolbar/tab image bindings. The item/value ABI is bounded as described below. |
| CommonDialog | Nonvisual properties, ShowOpen/ShowSave/ShowColor/ShowFont and ShowPrinter through Unicode comdlg32 APIs. Transactional cancellation, bounded buffers and native resource cleanup. ShowHelp, hooks/templates and the full Printer object contract are not implemented. |
| MSFlexGrid, MSHFlexGrid, DataGrid | Native unbound dense grids with owned text, transactional resize/row operations/Clip, variable cell geometry, selection, native scrolling/GDI painting and a transactional Unicode in-place editor. Native provider binding, hierarchical bands and complete cell/column APIs remain unfinished. |
| MSChart | Native binary-Double data and label storage with real GDI column and line plots. Other chart types, plot-object APIs and data binding remain explicitly unsupported. |

See [native grid, chart and tab-page contracts](WIN32-GRIDS-CHARTS-TABS.md) for exact members, limits, editor callbacks, lifetimes, architecture and validation boundaries.

Common supported additions include geometry/Move/ZOrder/Refresh, Tag ownership, mapped color properties, mutable per-control fonts and design-time tooltips. Input handlers use optional native subclass thunks: focus, keyboard, mouse, indexed control arguments and ByRef key cancellation. Mouse X/Y use Single storage with the parent's supported scale-mode conversion. Unsupported executable members/events still fail compilation. Design-only appearance properties outside the mapped set may retain native defaults, as with the existing exporter; they are not all validated or reproduced.

## RichEdit string and stream ownership

Full Text reads no longer use the old 4096-unit scratch buffer. The compiler adopts a dynamically sized BSTR before invoking Windows, bounds it at the existing 1,048,576 UTF-16-unit limit and shrinks it through OleAut32 when text changes during reentry. EDIT SelText validates its captured range against the new snapshot. RichEdit SelText uses EM_GETTEXTRANGE with EM_EXGETSEL logical positions, rather than applying those positions to WM_GETTEXT's CRLF representation.

String RTF is encoded with strict UTF-8 conversion, then scanned by its counted byte length. ASCII RTF is passed without a code-page override so native font/ANSI hex escapes retain their document semantics. Raw non-ASCII input uses an explicit UTF-8 override rather than an ANSI round trip. TextRTF/SelRTF output requests standard SF_RTF without SF_USECODEPAGE: Windows emits 7-bit RTF with non-ASCII text escaped, not the UTF-8-specific URTF dialect. The ASCII stream is decoded as UTF-8 without losing its escape sequences or depending on the system code page. Each call has its own stack-local EDITSTREAM and cookie. Stream-out grows an owned byte buffer up to four MiB; exact-length byte content is then converted to an owned Unicode BSTR. Streaming callbacks report bounded allocation/I/O failures to Windows and do not jump across Windows frames to a VB error handler. File methods close their file handle after SendMessage returns, before raising a stream error. Native file type 1 follows SF_TEXT's Windows plain-text encoding conventions; it is not an explicit UTF-8 file API.

RTF helpers, Unicode conversion and read/write directions are emitted only when requested. A RichTextBox used only for plain Text does not import the file-stream API or include the RTF helper family. Validate these contracts with the current-head Windows execution matrix; source/PE structure tests alone do not prove RTF parsing or resource-lifetime behavior.

## RichEdit selection formatting

`SelBold`, `SelItalic`, `SelUnderline`, `SelStrikethru`, `SelFontName`,
`SelFontSize`, `SelColor`, `SelBackColor`, `SelAlignment`, `SelIndent`,
`SelRightIndent` and `SelHangingIndent` use invocation-local CHARFORMAT2W or
PARAFORMAT2 records. Each setter specifies only the requested attribute mask;
it does not reconstruct a whole RTF document or reset unrelated formatting.
Native getter masks distinguish uniform from mixed selections. **The current
scalar-only AOT ABI raises error 94 for mixed values rather than returning a
fabricated scalar; this is not Variant Null parity.** Faces are limited to 31
UTF-16 units without embedded NUL, point sizes to 0.05–16383.5 after conversion
to native twips, and supported paragraph indents to ±31680 twips. Auto colors
resolve using Windows system colors. Bullets, tabs, embedded objects, arbitrary
CHARFORMAT fields, full rich printing and the complete formatting API remain work.

## CommonDialog state and cancellation

The control has no visible HWND. It owns property BSTRs, custom-color slots and
an optional accepted printer HDC. `FileName`, `Filter`, `FilterIndex`, `DialogTitle`,
`InitDir`, `DefaultExt`, `Flags`, `CancelError`, `Color`, `MaxFileSize`, font
properties and printer page/copy properties use per-instance state. `FileTitle`,
`hDC` and `LastError` are read-only. Authored `FontSize` preserves its exact Double;
CHOOSEFONT's tenths-of-a-point integer applies only to the native dialog boundary.

ShowOpen/ShowSave use OPENFILENAMEW with operation-local, zeroed UTF-16 buffers.
Filters must contain paired description/pattern entries separated by `|`.
Explorer multi-selection preserves the native embedded-NUL filename list in a
counted BSTR. The process working directory is not changed. The selected dialog
operation alone determines which comdlg32 entry is imported.

ShowColor and ShowFont copy their initial palette/font state into local native
records. Cancellation leaves the last accepted properties unchanged; native
failure/CancelError is reported only after acquired resources are released.
`CancelError` raises 32755 on user cancellation. Reentrant operations on the same
control fail explicitly; independent instances do not share workspaces.

ShowPrinter uses PRINTDLGEXW, balances OLE initialization, stages the selected
page/copy settings and owns its accepted HDC. Cancellation or failure preserves
the previous HDC. Returned temporary DEVMODE/DEVNAMES handles are GlobalFree'd,
unaccepted HDCs are DeleteDC'd, and replacing an accepted HDC deletes the previous
one. Callers borrow `hDC` and must not delete it. The dialog does not itself start
a print job. Printer-global default mutation, remembered DEVMODE across calls,
PrintSetup and driver-managed-copy/hook/template contracts are deliberately
rejected or remain unsupported. Copy counts must not be applied twice by a caller
that also asks the printer driver to perform copies.

Actual user interaction with these dialogs is **not verified by the test-only
API-hook machine or the noninteractive Windows DialogState fixture**. A Windows
UI acceptance run is required in addition to resource and ABI tests.

## Pictures, icons and PE resources

`Image.Picture`, `PictureBox.Picture`, `Form.Picture` and `Form.Icon` own native
picture references. Assignment from another native Picture property retains the
same decoded image; `Nothing` or `LoadPicture("")` clears it. Embedded project
assets, data URIs and FRX picture records are resolved while compiling. The EXE
contains only used image data, never the resource resolver or a JavaScript runtime.
PNG, JPEG, GIF and BMP are decoded by GDI+; ICO payloads create HICONs. Payloads
are bounded at 20 MiB, 32768 pixels per axis and 64M pixels total, with actual
native codecs validating the data. A decoder's IStream outlives the image. Image
replacement/disposal releases decoded images, cached HBITMAP/HICONs and streams
in ownership order. Animated-image frame APIs, metafiles, cursors and every
original IPicture member are not implemented.

The private picture record exposes `Handle`, `Type`, `Width` and `Height` to the
supported AOT member-expression ABI; it is **not a general COM IPicture object**.
Current HIMETRIC size conversion assumes 96 DPI. `LoadResPicture` and
`LoadResString` accept compile-time constant resource identifiers and the supported
formats/language lookup; dynamic resource IDs still fail compilation. Runtime
file LoadPicture uses a bounded existing file; it does not extract embedded bytes
to an adjacent file. The first authored form ICO populates deterministic
RT_GROUP_ICON/RT_ICON resources for the shell. The application manifest remains
present with ordinary-user privileges. Other authored form icons still install
on their own HWNDs. Projects without extra resources retain the old manifest path.

## ImageList and bounded item references

`ImageList` owns a native HIMAGELIST with dimensions 1–2048 and at most 10000 images.
Saved ListImages are decoded and inserted in order. `ListImages.Add(index,key,picture)`
supports omitted index/key arguments; zero/missing index appends, other valid
indices insert before the one-based position. Nonempty keys are unique under
case-insensitive native comparison, with duplicate error 35602 and missing-item
error 35601. `Item`, the default index/key accessor, `Count`, `Remove` and `Clear`
are lowered. Item `Key`, counted `Tag`, `Index` and `Picture` are supported.
Changing dimensions requires an empty list. Native insertion/reorder failure
releases incoming ownership; the rollback attempts restore native order before
metadata is committed. Failure of the operating system's rollback itself is not
certified as an atomic transaction.

A statement pins its item before evaluating a mutating right-hand side. A `With`
item or picture receiver is evaluated once and keeps a strong reference through
the block, errors and procedure cleanup. Clearing/removing an item detaches it
from the list while outstanding references remain valid; the detached Index is
zero, and its Tag/Picture no longer mutate another list slot. These bounded
references are not a general `Object` variable, `For Each` or full collection
interface. Add-result object assignment, arbitrary class-held references and
all collection-valued events remain unsupported.

TreeView.ImageList, ListView.Icons/SmallIcons, Toolbar.ImageList and tab ImageList
bindings borrow handles owned by the same form. Saved image keys/indices become
native indices. Runtime static-control-array elements retain separate ImageList
states. Clearing a binding does not destroy the list; ListView does not own borrowed
lists. Cross-form binding is rejected pending a shared lifetime model. External
mutation through the exposed hImageList can desynchronize compiler-owned metadata
and is the caller's responsibility. The other controls' complete item-object
APIs remain separate work.

## Native layout

The existing optional native layout kernel remains the authority when `project.settings.anchoring` is enabled: all 16 anchor masks, nested containers, minimum/maximum sizes, docking, horizontal/vertical/wrap layouts and suspend/resume. PictureBox and tab containers participate without flattening their child HWNDs. Indexed containers retain identity. Drive-list dropdowns preserve the existing combo dropdown-height policy.

Advanced browser-only auto-layout fields remain explicitly rejected by `layout-seed.js`. This change does not implement a second complete Figma-style solver or remove those diagnostics. With anchoring disabled, no native layout kernel is emitted. Explicit tab-page masks still apply without enabling layout, and layout Show operations preserve the page mask when anchoring is enabled.

## Output size and ownership

`report.controls` lists used types and dependencies. `runtime.mutableFonts`, `runtime.fileFamilies`, `runtime.ownerDrawingFamilies` and `runtime.richTextFeatures`, `runtime.selectionFormatting`, `runtime.dialogs`, `runtime.pictures` and `runtime.imageLists`, `runtime.grids`, `runtime.charts` and `runtime.tabPages` identify emitted optional families. Ordinary button/label applications do not import common-control initialization, RichEdit loading or file-enumeration APIs merely because these compiler modules exist. ICC flags are combined once for the actual classes used. RichEdit uses `LoadLibraryExW` with a System32-only search; no project DLL is copied or extracted.

Initial equal fonts reuse the existing cache. Mutable fonts have per-control ownership and do not delete a shared initial font. Tag/path/pattern strings use BSTR ownership; temporary GDI brushes/pens are deleted after restoring the drawing DC. These changes do not claim that every unused legacy core helper or unused procedure is removed; the compiler's separate optimization/pruning settings remain unchanged.

## Validation

```sh
npm run build
node --test tests/win32-*.test.mjs tests/layout-native.test.mjs
node tools/win32-control-fixtures.mjs
```

On Windows, execute the generated native fixtures:

```powershell
./tools/test-win32-controls.ps1
```

The driver independently requires exactly nineteen fixture families at O0/O1/O2: 57 distinct EXEs with 600 planned checks. The original six families and all their assertions remain unchanged. Four resource/format families, three grid families, three grid-editor families, one chart family and two tab-page/layout families extend the matrix. All 57 executables passed the actual Windows driver in [run 37736233835](https://github.com/wieslawsoltes/VB6/actions/runs/37736233835) on `abe5277f538bd837be44b6b093941ffcdbb6c131` after the persisted-Double chart fix. This execution checkpoint does not certify interactive common dialogs, every control member, or later revisions. It verifies each executable hash, copies only that executable to an isolated directory, enforces a timeout, associates nonzero exit codes with explicit assertions and checks that no adjacent runtime files were extracted. Results are written to `reports/native-controls/execution.json`. Assertions cover real HWND hierarchy/notifications, editing, fonts, saved content, filesystem enumeration and GDI bitmap pixels/resource counts. The RichText family adds persisted RTF, Unicode escape handling, standard RTF header and BMP/supplementary Unicode full/selection round trips, paragraph-based logical selection positions, more-than-65535-character selections, nested SelChange notification routing, disk RTF/plain-text round trips, closed-handle deletion and VB file-error recovery. The existing optimizer/native Windows matrix remains unchanged.

**Compilation and Node tests are not Windows execution evidence.** Require successful current-head Windows and repository checks before merging changes to these paths. Historical passes, diagnostic-only instrumented copies and a successful compilation do not substitute for execution of the unmodified self-checking executables. Linked-PE regressions separately check contiguous native record fields, relocated caption pointers and RTF stream flags at every optimization level.

## Remaining control/runtime boundaries

Native Data/Adodc/OLE hosting and native data-provider binding remain unimplemented. MSFlexGrid, MSHFlexGrid and DataGrid implement an unbound dense-grid subset, not hierarchical or data-bound parity; MSChart implements only the documented native column/line paths. ImageList, CommonDialog and Picture have the bounded implementations above, not their entire original API. Native COM/OCX/data-service packages in other repository components do not automatically supply an AOT object ABI. Full COM picture objects, every image format, full native collection objects, OLE-rich streams, full event/property parity, complete dynamic tab/header behavior and advanced layout remain separate work. Do not remove diagnostics or replace these controls with empty STATIC windows to suggest compatibility.

## Primary platform contracts

- [InitCommonControlsEx](https://learn.microsoft.com/en-us/windows/win32/api/commctrl/nf-commctrl-initcommoncontrolsex)
- [Rich Edit controls](https://learn.microsoft.com/en-us/windows/win32/controls/about-rich-edit-controls)
- [GetScrollInfo and full-width thumb tracking](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getscrollinfo)
- [Tab selection does not itself emit TCN_SELCHANGE](https://learn.microsoft.com/en-us/windows/win32/controls/tcm-setcursel)
- [Unicode directory enumeration](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-findfirstfilew)
- [Multiple wildcard patterns](https://learn.microsoft.com/en-us/windows/win32/api/shlwapi/nf-shlwapi-pathmatchspecexw)

- [EM_STREAMIN](https://learn.microsoft.com/en-us/windows/win32/controls/em-streamin)
- [EM_STREAMOUT](https://learn.microsoft.com/en-us/windows/win32/controls/em-streamout)
- [EDITSTREAMCALLBACK](https://learn.microsoft.com/en-us/windows/win32/api/richedit/nc-richedit-editstreamcallback)
- [EM_GETTEXTRANGE](https://learn.microsoft.com/en-us/windows/win32/controls/em-gettextrange)
- [EN_SELCHANGE](https://learn.microsoft.com/en-us/windows/win32/controls/en-selchange)

- [CHARFORMAT2W](https://learn.microsoft.com/en-us/windows/win32/api/richedit/ns-richedit-charformat2w)
- [PARAFORMAT2](https://learn.microsoft.com/en-us/windows/win32/api/richedit/ns-richedit-paraformat2)
- [OPENFILENAMEW](https://learn.microsoft.com/en-us/windows/win32/api/commdlg/ns-commdlg-openfilenamew)
- [CHOOSEFONTW](https://learn.microsoft.com/en-us/windows/win32/api/commdlg/ns-commdlg-choosefontw)
- [PRINTDLGEXW](https://learn.microsoft.com/en-us/windows/win32/api/commdlg/ns-commdlg-printdlgexw)
- [GDI+ startup](https://learn.microsoft.com/en-us/windows/win32/api/gdiplusinit/nf-gdiplusinit-gdiplusstartup)
- [SHCreateMemStream](https://learn.microsoft.com/en-us/windows/win32/api/shlwapi/nf-shlwapi-shcreatememstream)
- [ImageList_Create](https://learn.microsoft.com/en-us/windows/win32/api/commctrl/nf-commctrl-imagelist_create)
- [ImageList_Copy](https://learn.microsoft.com/en-us/windows/win32/api/commctrl/nf-commctrl-imagelist_copy)

### Local ABI-hook tests

`tests/support/native-x86-machine.mjs` is a bounded **test-only interpreter** for
a subset of emitted IA-32 instructions. Every Windows call is an explicit test
hook, with clobbered volatile registers, checked stdcall cleanup and guarded
memory. It tests our emitted control flow, field placement, ownership and failure
paths. It is not a Windows implementation, a physical CPU run or a substitute for
the native acceptance driver. The compiler and exported application do not
import or embed it. Unimplemented instructions and unhooked API calls fail tests.

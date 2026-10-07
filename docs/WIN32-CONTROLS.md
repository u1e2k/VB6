# Freestanding Win32 control lowering

This is the direct x86/PE32 backend, not an Electron export. `src/native/control-catalog.js` describes native classes and per-family system dependencies; `controls.js` integrates creation, state, lifetime and notifications into the compiler. These JavaScript modules run **while compiling** and are not embedded in the EXE.

## Implemented mapping and bounded behavior

There are 30 mapped control types. Mapping is not a claim that every browser/VB6 property, method, event or resource is implemented.

| Control family | Current native implementation |
| --- | --- |
| CommandButton, Label, TextBox, CheckBox, OptionButton, Frame, ListBox, ComboBox, Timer | Existing HWND/timer lowering, shared fonts, values, list operations and form lifecycle retained. Creation styles additionally respect edit alignment/locking/scrollbars/passwords, multi-selection list styles and button notification styles. |
| HScrollBar, VScrollBar, ProgressBar, Slider, UpDown | Native scrollbar/common-control classes, signed 32-bit ranges and positions, supported range-property setters, line/page increments, slider ticks and UpDown acceleration. Nested scroll/notification forwarding and Change/Scroll dispatch are lowered. Reversed ranges are rejected. |
| TreeView, ListView | Native tree and list-view windows populated from saved nodes, columns, rows and subitems. Tree keys/parents/cycles are checked before generation. Collection Count/Clear operates on native items. Full keyed item objects, Add/Remove/item-property APIs and object-valued events remain unimplemented. |
| StatusBar, Toolbar | Actual saved status panels and toolbar buttons; Count/Clear and supported style/text operations. Full panel/button object APIs, image-list integration and object-valued click events remain unimplemented. |
| TabStrip, SSTab | Native tab items/captions, selected Tab, Count/Clear and selection notifications; SSTab Click receives the previous tab index. Native container parenting is supported. Full per-page control visibility, tab-item objects and browser tab-layout parity remain unfinished. |
| DTPicker, MonthView | Native date/common controls, calendar-validated ISO design seeds, Date getters/setters through SYSTEMTIME and OLE DATE, and Change notification mapping. The complete date-control property/event surface is not implemented. |
| RichTextBox | System RichEdit loaded from System32; owned Unicode text and logical range selection/replacement, supported edit properties and Change/SelChange notifications. Persisted TextRTF, TextRTF/SelRTF getters/setters and LoadFile/SaveFile (0=RTF, 1=text) use native streaming. OLE embedding and full per-selection formatting APIs remain unimplemented. |
| DriveListBox, DirListBox, FileListBox | Native combo/list windows populated by Unicode Windows drive/file enumeration. Supported Path/Pattern/Drive/FileName/ListIndex/ListCount/Refresh operations; semicolon-delimited file patterns. No process-current-directory mutation; enumeration handles and owned path strings have cleanup. Complete classic navigation, attribute filtering and event parity remain unfinished. |
| PictureBox, Image, Shape, Line | Native owner-drawn surfaces and nested PictureBox parenting. Shape/Line use GDI with authored shape/fill/border settings and supported mutable drawing properties. **Picture/Icon resources and PictureBox graphics/printing APIs are not implemented. Image without an image resource is only a surface, not image-display parity.** |

Common supported additions include geometry/Move/ZOrder/Refresh, Tag ownership, mapped color properties, mutable per-control fonts and design-time tooltips. Input handlers use optional native subclass thunks: focus, keyboard, mouse, indexed control arguments and ByRef key cancellation. Mouse X/Y use Single storage with the parent's supported scale-mode conversion. Unsupported executable members/events still fail compilation. Design-only appearance properties outside the mapped set may retain native defaults, as with the existing exporter; they are not all validated or reproduced.

## RichEdit string and stream ownership

Full Text reads no longer use the old 4096-unit scratch buffer. The compiler adopts a dynamically sized BSTR before invoking Windows, bounds it at the existing 1,048,576 UTF-16-unit limit and shrinks it through OleAut32 when text changes during reentry. EDIT SelText validates its captured range against the new snapshot. RichEdit SelText uses EM_GETTEXTRANGE with EM_EXGETSEL logical positions, rather than applying those positions to WM_GETTEXT's CRLF representation.

String RTF input explicitly uses UTF-8 with strict Windows conversion rather than an ANSI round trip. TextRTF/SelRTF output requests standard SF_RTF without SF_USECODEPAGE: Windows emits 7-bit RTF with non-ASCII text escaped, not the UTF-8-specific URTF dialect. The ASCII stream is decoded as UTF-8 without losing its escape sequences or depending on the system code page. Each call has its own stack-local EDITSTREAM and cookie. Stream-out grows an owned byte buffer up to four MiB; exact-length byte content is then converted to an owned Unicode BSTR. Streaming callbacks report bounded allocation/I/O failures to Windows and do not jump across Windows frames to a VB error handler. File methods close their file handle after SendMessage returns, before raising a stream error. Native file type 1 follows SF_TEXT's Windows plain-text encoding conventions; it is not an explicit UTF-8 file API.

RTF helpers, Unicode conversion and read/write directions are emitted only when requested. A RichTextBox used only for plain Text does not import the file-stream API or include the RTF helper family. Validate these contracts with the current-head Windows execution matrix; source/PE structure tests alone do not prove RTF parsing or resource-lifetime behavior.

## Native layout

The existing optional native layout kernel remains the authority when `project.settings.anchoring` is enabled: all 16 anchor masks, nested containers, minimum/maximum sizes, docking, horizontal/vertical/wrap layouts and suspend/resume. PictureBox and tab containers participate without flattening their child HWNDs. Indexed containers retain identity. Drive-list dropdowns preserve the existing combo dropdown-height policy.

Advanced browser-only auto-layout fields remain explicitly rejected by `layout-seed.js`. This change does not implement a second complete Figma-style solver or remove those diagnostics. With anchoring disabled, no native layout kernel is emitted.

## Output size and ownership

`report.controls` lists used types and dependencies. `runtime.mutableFonts`, `runtime.fileFamilies`, `runtime.ownerDrawingFamilies` and `runtime.richTextFeatures` identify emitted optional families. Ordinary button/label applications do not import common-control initialization, RichEdit loading or file-enumeration APIs merely because these compiler modules exist. ICC flags are combined once for the actual classes used. RichEdit uses `LoadLibraryExW` with a System32-only search; no project DLL is copied or extracted.

Initial equal fonts reuse the existing cache. Mutable fonts have per-control ownership and do not delete a shared initial font. Tag/path/pattern strings use BSTR ownership; temporary GDI brushes/pens are deleted after restoring the drawing DC. These changes do not claim that every unused legacy core helper or unused procedure is removed; the compiler's separate optimization/pruning settings remain unchanged.

## Validation

```sh
npm run build
node --test tests/win32-richtext*.test.mjs tests/win32-control*.test.mjs tests/win32-aot.test.mjs tests/layout-native.test.mjs
node tools/win32-control-fixtures.mjs
```

On Windows, execute the generated native fixtures:

```powershell
./tools/test-win32-controls.ps1
```

The driver requires exactly six fixture families at O0/O1/O2: 18 distinct EXEs. It verifies each executable hash, copies only that executable to an isolated directory, enforces a timeout, associates nonzero exit codes with explicit assertions and checks that no adjacent runtime files were extracted. Results are written to `reports/native-controls/execution.json`. Assertions cover real HWND hierarchy/notifications, editing, fonts, saved content, filesystem enumeration and GDI bitmap pixels/resource counts. The RichText family adds persisted RTF, Unicode escape handling, standard RTF header and BMP/supplementary Unicode full/selection round trips, paragraph-based logical selection positions, more-than-65535-character selections, nested SelChange notification routing, disk RTF/plain-text round trips, closed-handle deletion and VB file-error recovery. The existing optimizer/native Windows matrix remains unchanged.

**Compilation and Node tests are not Windows execution evidence.** Require successful current-head Windows and repository checks before merging changes to these paths. Historical passes, diagnostic-only instrumented copies and a successful compilation do not substitute for execution of the unmodified self-checking executables. Linked-PE regressions separately check contiguous native record fields, relocated caption pointers and RTF stream flags at every optimization level.

## Remaining control/runtime boundaries

MSFlexGrid, MSHFlexGrid, DataGrid, MSChart, ImageList, CommonDialog and Data/Adodc/OLE hosting are not implemented in this direct backend. Native COM/OCX/data-service packages in other repository components do not automatically supply an AOT object ABI. Image resources, full native collection objects, OLE-rich streams, full event/property parity and advanced layout remain separate work. Do not remove diagnostics or replace these controls with empty STATIC windows to suggest compatibility.

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

# Native macOS lifetime and editing contracts

This guide supplements [macOS export](MACOS-EXPORT.md). It describes the native
C++ runtime and AppKit host, not the browser runtime or complete original VB6
compatibility. Runtime source lives in `packages/macos-native/native`.

## Reference release and finalization

`makeNativeInstance` gives native class instances an allocation-free final-release
queue. A shared-pointer deleter only enqueues or disposes: it never calls VB code
and never throws. `Frame::mark`, `Frame::result` and the return boundary of
`Runtime::invoke` drain pending callbacks while VB error handling is available.
A release is observed before the next VB instruction. The previous source site
remains active during the drain so an unhandled finalizer error enters the
caller's ordinary `On Error`/`Resume` path instead of escaping a C++ destructor.
Successful finalizers preserve the caller's `Err` state.

Aliases, returned objects, interface views, collection entries and object-array
slots are real owners. Call lowering builds argument vectors directly rather
than using C++ initializer-list temporaries that would keep a stale ByRef object
alive for the duration of a call. Internal call frames retain parameter storage,
not redundant argument snapshots; native external-call ABI storage is separate.

The intrusive queue detaches a pending batch before dispatch. A finalizer may
release a child and observe its termination before its next instruction, without
running an unrelated pending peer first. Exceptions requeue unprocessed nodes.
Field-only ownership chains are processed iteratively rather than recursively;
`End` and runtime teardown also use iterative disposal. Native tests cover chains
of 4,096 objects with a VB call-depth budget of eight.

During `Class_Terminate`, `Me` and `shared_from_this` remain valid through a fresh
owning control block. Escaped self references remain memory-safe and cannot
trigger a second finalization. This is a safety contract, not certification of
all original VB6 object-resurrection edge cases. Failed initialization does not
schedule a termination callback. `End` marks the runtime as ending before native
stack unwinding; teardown invalidates the lifetime controller before destroying
host state. Native clients can subsequently release retained objects safely,
but must not call them after their runtime is gone.

Reference-count cycles are not collected. Normal global/static/default-form
shutdown ordering and complete default-form recreation/lifecycle behavior remain
unfinished. The runtime can queue an initialized, unloaded form's termination
when its final owner disappears; default instances still rooted by the runtime
do not thereby obtain complete `Form_Terminate` semantics.

## Native text, selection and events

`appkit-edit.mm` is the shared boundary for `TextBox`, `RichTextBox` and editable
`ComboBox` properties. It reads the live `NSTextView` or the `NSTextField` shared
field editor while editing, rather than a stale control string. Selection is a
bounded UTF-16 range; durable `SelStart`/`SelLength` state survives explicit focus
changes. `SelStart` cancels the previous selection, lengths clamp to remaining
text, and negative values fail without partially changing the selection.

`appkit-edit-fields.mm` restores an explicit selection when Cocoa attaches its
shared field editor, before the first edit notification. Native text, secure-text
and combo cells retain their respective Cocoa base implementations. Detachment
captures the range; a new mouse selection supersedes a pending programmatic
range. This avoids treating `controlTextDidBeginEditing` as a focus notification
or replacing the secure-input editor with a plain text view.

Text and replacement setters commit the new string and insertion caret before
raising `Change`. They suppress native notification feedback during mutation and
do not overwrite a reentrant handler's subsequent edits. `SelText` replacement
preserves unselected attributed runs in rich text and inherits insertion
formatting. `MaxLength` bounds committed user insertions without trimming the
existing suffix or splitting an inserted surrogate pair. Intermediate marked
composition remains under AppKit ownership; comprehensive IME, undo and keyboard
interaction acceptance is still required.

Existing `GetWindowTextW` and `SendMessageW` edit adapters use these same control
properties, including live field-editor text and selection. Their source-level
handle and ByRef-buffer contracts remain distinct from real Win32 pointer ABIs.
The existing SendMessage notification suppression is retained. This increment
does not establish complete EM_SETSEL negative/reversed-range behavior,
EM_REPLACESEL undo behavior or every Win32 edit message.

## RichTextBox attributed selections

`appkit-richtext.mm` implements `SelBold`, `SelItalic`, `SelUnderline`,
`SelStrikeThru`, `SelColor`, `SelBackColor`, `SelFontName`, `SelFontSize`,
`SelAlignment`, `SelRTF` and `TextRTF` through the same native VB member boundary.
Character-property getters inspect every effective attributed run in the selected
UTF-16 range and return `Null` for mixed values. At an insertion caret they read
native typing attributes. Assigning `Null` is an invalid property value, not an
instruction to discard existing formatting.

Selected formatting transforms a temporary attributed substring before a single
commit. Unselected runs and unrelated attributes survive; failed validation or
font-family conversion does not partially format earlier runs. The selection is
preserved before `Change` is dispatched. Caret-only character formatting changes
insertion attributes without reporting a document-content change; subsequent
`SelText` insertion uses those attributes rather than the character underneath the
caret. Paragraph alignment applies to the affected paragraphs and restores the
original character selection. The supported alignment values are left (0), right
(1), center (2) and justified (3).

Font sizes follow the existing host's 96-logical-pixel / 72-typographic-point
mapping, with VB sizes rounded to half points. Family selection uses installed
native fonts and rejects unavailable families; no font file is bundled or loaded
from a project. These choices are explicit source-compatibility contracts, not
pixel-equivalence or complete Windows font-substitution certification.

RTF replacement parses in memory before mutating the document, limits the input
to 16 MiB of UTF-8 transport data, and rejects invalid headers/import failures.
`SelRTF` replaces only the selection and moves the insertion caret to the end of
the replacement; `TextRTF` replaces the document and resets the caret. Both keep
the stored plain text coherent with the native text view. Roundtrip regressions
check text and formatting, not byte-for-byte RTF serialization. Cocoa can
normalize the representation and unsupported document features. This is not an
untrusted-document sandbox or a full RichEdit/OLE file-format implementation.

General undo/redo integration, full selection-change event ordering, advanced
paragraph indents/bullets/tabs, embedded OLE objects, rich printing, all Win32
character-format messages and exhaustive clipboard/IME interactions remain
outside this implementation. The existing whole-control font/appearance setters
are separate from these selection properties.

## Lists and implementation boundaries

List insertion/removal shifts selection indices with their items while preserving
`ItemData` alignment. Removing the selected item clears its index; `Clear` does
not leave a stale index that selects a later added item. Reloading native widgets
suppresses callback feedback and restores the selection snapshot. Programmatic
ComboBox `ListIndex` changes synchronize text and emit one `Click` only when the
index changes. This is not full keyboard-selection/event ordering certification.

Control creation/layout, properties, methods, delegates and editing are separate
implementation units. The normal SDK source manifest discovers all units; no
hand-maintained binary list or runtime JavaScript interpreter is introduced.

## Regression gates

Run the ordinary build and tests, followed by the native harness:

```sh
npm test
node tools/test-macos-native.mjs
```

`tests/macos-lifetimes.test.mjs` checks shared-frontend/codegen contracts.
`packages/macos-native/tests/lifetimes.mjs` runs generated VB lifetime scenarios.
`class-lifetime.cpp` independently exercises the ownership ABI, error recovery,
escaped references, deep chains and clients outliving the runtime. The harness
compiles the same runtime objects with address/undefined-behavior sanitizers for
these executables and retains the existing interface/value checks.

On Apple Silicon, `tests/appkit-edit.mm` exercises a real shared field editor,
UTF-16 selection, reentrant changes, focus persistence, live text API buffers,
rich-text attributes, user insertion limits and list identity. The separate
`tests/appkit-richtext.mm` exercises mixed selections, formatting preservation,
insertion style, paragraph alignment, RTF roundtrips and rejection without partial
mutation. `tests/macos-richtext.test.mjs` checks shared-frontend lowering and SDK
source enrollment, not native widget behavior. The generated VB form fixture in
`packages/macos-native/tests/richtext.mjs` is separately built as a signed arm64
application and executed to exercise compiler lowering, form loading, `Change`
events, mixed Variant values, RTF replacement and `On Error` together. These assertions
are part of the existing native workflow alongside signed application and bridge
execution. A Linux sanitizer pass is not an AppKit or Apple Silicon pass. Exact
revision-specific results belong in CI artifacts and the pull request, not here.

## Reference sources

Official documentation informs these contracts; shared VBA and current AppKit
references are not an independent differential oracle for every original VB6
edge case. No proprietary runtime binaries or fonts are redistributed.

- Microsoft Terminate event: https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/terminate-event-visual-basic-for-applications
- Microsoft End statement: https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/end-statement
- Apple NSControl currentEditor: https://developer.apple.com/documentation/appkit/nscontrol/currenteditor()
- Microsoft EM_REPLACESEL: https://learn.microsoft.com/en-us/windows/win32/controls/em-replacesel
- Apple field editor architecture: https://developer.apple.com/library/archive/documentation/TextFonts/Conceptual/CocoaTextArchitecture/TextFieldsAndViews/TextFieldsAndViews.html
- Apple text editing and notifications: https://developer.apple.com/library/archive/documentation/TextFonts/Conceptual/CocoaTextArchitecture/TextEditing/TextEditing.html
- Microsoft InkEdit properties (related RichEdit selection API, not an original VB6 oracle): https://learn.microsoft.com/en-us/windows/win32/tablet/inkedit-properties

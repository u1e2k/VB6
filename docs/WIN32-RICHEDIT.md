# Native RichEdit selection and search

`SelProtected` and `SelBullet` now use the native selection records alongside
the existing character/paragraph properties. `IsNull(Rich.SelBold)` (and the
other supported selection members) checks the native uniform-selection mask;
it does not convert mixed formatting into a Boolean. A direct scalar read of
a mixed selection continues to raise error 94. This does not introduce general
Variant-valued native storage.

`Find(text, start, end, flags)`, `GetLineFromChar`, `CanUndo`, `Undo`, `CanRedo`
and `Redo` use RichEdit messages. Find accepts optional positional arguments
(defaults 0, -1, 0), whole-word (2), match-case (4), and no-highlight (8). Its
UTF-16 search buffer and result record belong to the current invocation.
Empty or missing matches leave selection unchanged. Invalid negative/reversed
ranges, unsupported flag bits and embedded NUL search text raise error 380
before search/selection mutation. Named arguments are not lowered here.

The permanent tests distinguish instruction execution with explicitly mocked
Win32 calls from the self-checking Windows EXEs. Existing resource, ImageList,
CommonDialog, grid/chart and tab implementations from PR #95 are retained,
including their documented compatibility boundaries. Picture resources retain
the current dimension/header validation and resource ownership.

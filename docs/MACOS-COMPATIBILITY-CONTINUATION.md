# Native macOS compatibility continuation

Continuation of merged PR #88, based on main `3b7ab056221da7d0b2b586596ab555256d68edba` (source tree `16958b03a7a838588f98b566143714683c11a8ab`). Other native Windows, rendering, XAML and migration branches are independent.

## Current implementation targets

- Deterministic native class finalization at last-reference release, including interface views, scope exit, initialization failures and End suppression; explicit error and runtime-shutdown boundaries.
- Native AppKit text/control behavior and source API compatibility, with permanent generated-program and native-host regressions.
- Standalone compiler/SDK build-kit reproducibility and unchanged existing export paths.

This is an implementation work log, not a declaration that these targets or full VB6 parity are complete. The delivered changes and exact validation evidence will be recorded before this PR is ready for review.

## Acceptance

Keep all existing tests, hosted native Apple Silicon execution and strict generated-artifact fingerprints enabled. Portable C++ execution does not establish AppKit behavior or Apple Silicon execution. Test the exact published source; do not substitute local-only files for GitHub evidence.

Reference semantics: Microsoft Terminate event documentation describes final reference release and the absence of Terminate on End/abnormal termination: https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/terminate-event-visual-basic-for-applications . This VBA reference informs the shared language behavior; it is not independent certification of every VB6 edge case.

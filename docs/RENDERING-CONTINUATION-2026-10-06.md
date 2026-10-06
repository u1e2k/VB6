# Rendering continuation — 6 October 2026

## Original local handoff (historical)

This was a locally prepared continuation of PR #21, based on
`2442a2ca67f5560080afd6c0502105551edfd9a8` and integrating main
`728a9201806a4d455113867d2778c3262666a05b`. At the time of this original handoff, publication and merge were not available.
The final reconciliation below supersedes that publication status; these earlier
results remain revision-specific historical evidence.

## Corrections

Repeated `pointerover` notifications for the same pointer and target no longer
invalidate every paint-style snapshot. Actual boundary/capture changes, window
blur, touch end, and driver teardown clear the retained target. All original
application events still propagate. The map is bounded to avoid retaining
arbitrarily many synthetic pointer targets. The headed Chromium text-update
reproducer retained none of eight style objects before the fix and all eight
afterwards. A new browser regression checks 100 duplicate notifications, native
hover transitions, event delivery and cleanup.

Applying unchanged options no longer clears the text atlas or schedules extra
paint. Same-backend text/pixel-snapping changes are submitted before the
`setOptions()` promise resolves; the renderer and device remain owned by the same
session. This is a submission contract, not a promise that the operating system
has presented the frame. A failed paint uses the normal ordered fallback and
awaits its completion. Unit and real-backend browser cases cover these paths.

The main-branch issue #39 fixes are retained, including caption masks, frame and
toolbar bevels, selector paint, menu ownership and detached-window handling. The
only authored merge conflict was `tools/build.mjs`; its combined version includes
both fidelity CSS and the reusable renderer bundle. All generated applications
were rebuilt from those combined sources, not selected from one stale branch.

Background images can have fractional device-pixel boundaries **inside** a
control's border. The old border-width-only native-edge preservation did not
cover these inner two-pixel staircase edges, producing long mismatched columns
at 125%/150% DPI. The adapter now clears just the affected one-device-pixel
boundary strips after its own element paint. Opaque interiors remain GPU-drawn.
Native hole rounding also ignores a few machine-arithmetic ULPs at mathematically
integral boundaries instead of clearing an additional physical pixel. Truly
fractional coordinates still round outwards; pixel-comparison tolerances are
unchanged at zero.

Square checkbox chrome now uses the same attributed staircase-background method
while preserving real border widths, input size, glyph origin, native keyboard
interaction and checked/indeterminate state. Radio circles are unchanged. Forced
colors retain the original real-border styling. This fixes a native diagonal
border raster discrepancy that also persisted with the overlay hidden.

Source attribution for Pointer Events, CSS Backgrounds and the original
Jordan Scales/98.css bevel method remains alongside the implementation. The
98.css MIT notice remains in the source, exported CSS and packages. No font
assets have been added.

## Reproduction

```sh
npm run build
npm test
node --test tests/rendering-*.test.mjs
python tools/browser-rendering-tests.py --require-webgl2 --software-gpu
python tools/verify-rendering-report.py reports/rendering/report.json --backend webgl2
```

The shared strict CI verifier now requires **36 cases**, zero failures and zero
skips. Its default execution still serves HTTP fixtures and requires actual
selected-backend execution. No acceptance condition was disabled.

`--offline` separately permits the existing `set_content` fixture transport
without HTTP. It does not remove required-backend assertions. This supports
local environments where fixture navigation is restricted but WebGL2 rendering
works. Such a run still explicitly skips unavailable WebGPU-only tests, so it
cannot pass the complete CI verifier merely by testing another API.

Local software-driver reproduction in this environment uses the installed
Chromium executable and an Xvfb display:

```sh
CHROMIUM_PATH=/usr/bin/chromium \
RENDERING_BROWSER_FLAGS='--enable-gpu --enable-features=Vulkan --ignore-gpu-blocklist' \
xvfb-run -a python tools/browser-rendering-tests.py \
  --require-webgl2 --software-gpu --offline --headed
```

These flags belong only to the test command, not shipped application startup.
The report identifies the actual adapter and fixture transport. Reports with
unavailable-backend failures or skips are retained as such; they are not converted
into successful GPU qualification. See the delivery validation report for the
completed candidate results and exact hashes.

## Boundaries

This remains a WebGPU-first **hybrid** renderer with HTML/CSS selectable and
ordered fallbacks. Native text/editing/accessibility/widgets and unsupported CSS
remain browser-painted. Exact tested HTML comparisons do not certify universal
Microsoft VB6 Windows visuals. Software-adapter tests and retained-work counters
do not establish a physical-device whole-IDE speedup, sustained FPS, power use
or end-to-end input latency. Final WebGPU execution and current-head CI still
need to complete before a verified remote merge.

## Completed local validation

The combined candidate passed **3,018 Node tests**, including **79 rendering
unit tests**. Both the headed and headless WebGL2-required offline runs recorded
**35 passed, zero failed and one explicitly skipped WebGPU-device-loss case**.
The required WebGL2 painter executed, including the actual context-loss recovery,
texture replacement, control states, exported calculator and new edge cases.
The adapter was Google SwiftShader through ANGLE/Vulkan, not physical hardware.
Both reports have eight exact whole-IDE comparisons (Canvas2D and WebGL2 at
DPR 1, 1.25, 1.5 and 2), all with zero changed pixels. Primitive comparisons cover
DPR 1, 1.25, 1.5, 2, 3 and 4; the new background/checkbox case covers five DPRs
and unchecked, checked and indeterminate input states.

Core browser integration passed **36/36**; classic HTML passed **14/14**;
issue #39 inline visual/interaction checks passed **25/25**, and its inline
caption-state checks passed **3/3**. These inline checks do not claim the larger
HTTP/file-origin cross-browser matrix ran locally. A preliminary headless run
without the required virtual display/driver configuration could not initialize
WebGL2 and correctly failed its required-backend assertions; it is not counted
as a successful run. Its failure report is retained in the evidence package.

While this local candidate was tested, the remote PR advanced independently to
`69cdf968d328259b5cac9ccbf0967c6c3e57f3f0`, including resize-observation work and
a staged background patch. This delivery remains explicitly based on the
recorded earlier head plus the main merge above; it must be merged/reviewed
against newer remote changes, not force-pushed over them. The accompanying Git
bundle and patches are local handoff artifacts, not proof of remote publication.

## Final reconciliation for publication

The unpublished `55934004c1149edc024c98625b8a6bec99c0992e` handoff is reconciled
with remote renderer `34740322df5b256bb1d769073ee246bb4839d171` and main
`e7cfde0a219569f4ab5bd5abadb2d337b6722efb`. This retains the newer deferred
ResizeObserver registration, body/alpha composition, native preview URL safety,
and native String interoperability. It is not a reset to the earlier handoff.

The background painter retains the newer deduplicated coverage-pixel halo needed
for independently rounded image positioning, together with the local arithmetic
residue correction. Both sets of tests remain: the local bounded-coverage test
checks the upstream three-device-pixel halo rather than its superseded one-pixel
implementation. Exact pixel comparison tolerances remain zero.

All browser cases from both branches are retained: the shared strict verifier
requires **38 cases**, zero failures and zero skips. The reconciled source passed
**3,180 Node tests** locally. Consult the final PR checks and artifacts for the
exact published-source GPU and cross-browser results; earlier local/WebGL-only
results are not a substitute for required WebGPU execution.

A local Chromium 144 repeated-switch investigation found native HTML partial-
raster edge differences after removing the overlay (603 pixels on a designer
boundary plus two preview pixels). Speculative application-side isolation and
promotion hints were tested and discarded; no such additional CSS is shipped.
The explicit software-GPU test profile instead uses Chromium's full-raster and
full-compositor-completion switches, documented by Google Chrome's launcher:
https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md#rendering--gpu
This controls native reference capture without hiding pixels, changing the
required painter, or increasing the zero-pixel tolerance. Flags are recorded in
the report. They do not affect production or default physical-adapter measurement.
Normal-browser behavior and local-adapter performance remain separate evidence.

The user-facing release is WebGPU-first hybrid rendering with the classic
HTML/CSS path and configurable fallbacks. It does not assert fully GPU-only
painting, native Windows golden equivalence or physically measured speedup.

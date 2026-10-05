# Dual-renderer release

## Release-candidate configuration

WebGPU is the preferred UI painter. HTML/CSS remains selectable in
**Tools → Options → Rendering**, with ordered fallback choices (WebGPU, WebGL2,
Canvas2D) and an unconditional final HTML safety path. The default order is
WebGPU → WebGL2 → Canvas2D → HTML. Existing saved HTML preferences are respected.
The implementation paints supported geometry with the selected canvas backend
and retains browser-native surfaces for exact native editing, accessibility,
text, controls and unsupported CSS. It is a **hybrid renderer**, not a replacement
browser layout engine or a claim of a completely GPU-only IDE.

The earlier classic HTML bevel/list work is included, with HN/Jordan Scales/98.css
source attribution and the full MIT notice retained in the source and shipped CSS.

## Final integration changes

- Reconciles main `a098f73921a624e30c26a3aad07c76a14e10073e`, including current
  native Date, call/region, input, debugger, IntelliSense and RDO/data-provider changes. Generated
  bundles are rebuilt from combined sources rather than resolved by discarding
  either branch's generated output.
- Event-driven CSSOM and Web Animations invalidation: stylesheet rule insertion,
  deletion/replacement, rule properties/selectors, adopted-sheet assignment,
  media/disabled changes, programmatic animation start/pause/cancel, scrubbing
  and keyframe/timing changes. No idle polling. Realm-scoped descriptors are
  shared between subscribers and restored on the last release; native declaration
  identity, method results, errors and asynchronous replacement promises remain
  intact. Renderer layer writes never trigger an invalidation loop.
- Per-build element measurement reuse, cached local stacking order, one reusable
  DOM Range, unchanged WebGPU uniform-upload suppression, and no synchronous
  WebGL limits/error query on every unchanged opaque draw. Geometry is not cached
  across independent scene builds, so scroll/resize updates remain accurate.
- Shadow-root hosts fall back to native painting rather than hiding untraversed
  shadow content under a solid overlay.
- **Measure Rendering / Cancel Measurement / Save Report** in the classic Options
  tab. Measures the actual local backend on a bounded sealed-primitive workload
  without changing document contents or renderer/project preferences. Raw CPU
  submission samples and optional WebGPU pass timestamps are reported separately.
  GPU timestamps are requested only where supported and are never inferred from
  CPU clocks. Normal production frames allocate no queries or readback buffers.

Additional completion fixes cover keyboard-active/checked/validity/popover states,
late stylesheet resource events, adopted stylesheet getter/index accesses and
saved-array mutators, observed closed shadow hosts, and persisted page lifecycle
restoration. Foreign descriptor changes survive subscription teardown; observation
capabilities are exposed in renderer diagnostics. First-frame failure and HTML
fallback clear scene, atlas and observer resources. Cancellation is checked again
after yielding to the event loop.

Native-text geometry builds no longer read or serialize computed font shorthands
for every element. Atlas text loads those metrics lazily into the same invalidated
style snapshot. A same-browser cold-style comparison preserved all 1,497 drawing
commands; six alternating rounds measured 255.1 ms versus 244.6 ms median totals
for ten builds. This bounded, noisy CPU microbenchmark is not a whole-IDE or
hardware-GPU speedup certification.

## Acceptance evidence

The local combined source passed **2,577 Node tests (55 rendering tests)** and
**21 browser cases with 8 GPU-dependent cases explicitly skipped** in the restricted
local browser. The strict GPU workflow rejects fallback output and runs all
**29 browser cases** independently for WebGPU/WebGL2 in headed/headless Chromium.
The CI artifacts on the final PR head are the authoritative GPU results.

New coverage includes 15 actual shipped control implementations in normal,
changed/disabled/checked and focused text-selection states; classic, Windows
Standard and high-contrast themes; fractional DPI; a narrow mobile viewport;
a real detached Properties window with live backend changes and independent
cleanup; and the shipped standalone calculator with exact screenshot comparisons,
input execution and renderer disposal. Existing six-DPI primitive framebuffer
readback, four-DPI IDE goldens, device/context loss, race/lifetime and retained
scene/texture regression gates are retained unchanged.

## Measurement boundaries

The automated GPU environment uses **software SwiftShader**, not a physical GPU.
The reports certify only the tested API/pixel cases. They do **not** certify all
native Windows VB6 pixels, hardware acceleration, whole-IDE speedup, input latency,
sustained FPS, power consumption or physical desktop/mobile performance. The local
measurement tool makes real adapter/timestamp evidence obtainable without reporting
those unsupported claims as completed certification.

Pre-captured native CSSOM methods and saved declaration references can bypass
instrumentation. Indexed edits through the `adoptedStyleSheets` getter and saved
array push/splice/etc are observed; direct index writes through a previously saved
array reference still need `renderer.invalidateStyles()`. Custom elements and
observed open/closed shadow hosts stay native. A built-in element with an
unobservable closed shadow root created before observation must be marked
`data-vb-native-render` by its integration.
A physical native-Windows reference matrix and replacing every native-painted
surface remain broader compatibility goals, not completed release claims.

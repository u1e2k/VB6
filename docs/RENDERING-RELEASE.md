# Dual-renderer integration

## Configuration

WebGPU is the preferred UI backend. **Tools → Options → Rendering** keeps
HTML/CSS available and selects ordered WebGL2/Canvas2D fallbacks, pixel snapping,
native or experimental atlas text, and an explicit policy for exported apps.
The default chain is WebGPU → WebGL2 → Canvas2D → HTML/CSS. HTML is always the
terminal safety path. Existing saved HTML preferences, Cancel and undo remain
respected. Backend selection applies live without replacing the editor/project.

The standalone `dist/vb6-rendering.js` library and the same modular painters are
integrated into the IDE, runtime, detached documents and standalone HTML exports.
Frames use the actual device pixel ratio; device/memory limits trigger a reported
fallback instead of silent resolution downscaling. Context/device loss and stale
startup results release resources and advance through the selected fallbacks.

## Rendering architecture and performance

This is a **hybrid DOM/GPU renderer**, not a DOM-free UI or browser layout engine.
GPU painters draw supported backgrounds, clipped geometry, borders, classic
bevel layers and optional text atlases. DOM layout, accessibility, editing/IME,
native text/widgets/icons, existing graphics canvases and unsupported CSS remain
native. Native islands and partially transparent paints are not falsely reported
as GPU-painted surfaces. The native HTML path is intentionally retained.

Exact retained-scene comparison reuses immutable geometry, packed instances and
draw batches. Unchanged output skips submission; image revisions, dimensions and
canvas identities invalidate image uploads independently. Scene construction
reuses per-build measurements, stacking information and a DOM Range. Native text
avoids unnecessary font serialization. Redundant uniforms and synchronous WebGL
queries are avoided. These mechanisms do not by themselves prove a whole-IDE
speedup over the browser's HTML compositor.

Event-driven mutation, CSSOM, input, resize and animation observation wakes paint
when required and returns to idle afterward. Newly encountered ResizeObserver
targets register in a coalesced task outside an active resize-delivery loop.
Failure, backend replacement and disposal cancel and clear pending registrations.
See [RENDERING-RESIZE-LIFECYCLE.md](RENDERING-RESIZE-LIFECYCLE.md).

**Measure Rendering / Cancel Measurement / Save Report** runs a bounded workload
on the actual local adapter without changing project or renderer preferences.
It preserves raw CPU submission samples and optional real WebGPU pass timestamps.
Normal frames do not allocate diagnostic query/readback buffers. Adapter identity,
software fallback and timer quantization remain explicit; GPU time, presentation
latency, FPS and CPU submission time are not interchangeable measurements.

## Integration and attribution

The integration preserves main `e7cfde0a219569f4ab5bd5abadb2d337b6722efb` (native
String interoperability) and `bd4f9cfbb753cf18cdc78d89744f31789a6e5b28` (agent
recovery/compaction and diagnostics lifecycle), along with prior visual-fidelity,
native debugger, editor/IME, agent and data-provider changes. The unpublished
`55934004` continuation is reconciled with the newer remote resize/background
corrections, retaining both sets of regression tests. Generated outputs are rebuilt
from combined source, never selected from one side of a merge conflict.

Jordan Scales' HN/98.css staircase-bevel attribution and complete MIT notice remain
in source, distributed CSS and release packages. Independent CSSOM, Web Animations,
DOM, CSSWG, WebGPU and layout-batching guidance is attributed at the relevant code.
No third-party fonts are included by this change. Classic mnemonic marks use a
scoped filled strip; native glyphs, inline layout, prose underlines and high-contrast
fallback are preserved.

## Acceptance and reproducibility

The shared `tools/verify-rendering-report.py` gate requires **38 distinct passed
cases, zero failed and zero skipped** for each required GPU API. x64, ARM64 and
container matrices exercise WebGPU/WebGL2 in headed/headless Chromium. Each requires
actual API execution, exact framebuffer/presentation pixels and reproducible
outputs. Consult the run on the PR's exact head; older 19/30/34-case runs are not
substitutes for current-source qualification.

Coverage includes six-DPI primitives/holes/clips/textures, four-DPI whole-IDE
comparisons against HTML, repeated mnemonic switching, actual runtime controls
and changed/disabled/selected states, multiple themes, mobile layout, detached
Properties ownership, standalone calculator execution, CSSOM/animation wakeups,
resize reentrancy, alpha compositing, retained scenes/textures, loss recovery,
settings/measurement cancellation, persisted-page lifecycle and cleanup. The
reconciled handoff adds sparse hover-event invalidation, no-op Options retention,
same-backend settings submission before promise resolution, narrow fractional
background-edge preservation and square-checkbox normal/checked/indeterminate
paint. Radio buttons and keyboard/accessibility behavior are retained.

The screenshot comparator is independently checked against scalar calculations,
including single-channel and sparse changes. The software-GPU oracle disables
partial raster and waits for compositor completion so native HTML tile reuse is
not confused with GPU paint differences. These Chromium test flags are recorded
in reports, never shipped to applications or imposed on the default physical-
adapter measurement path. Pixel tolerance remains zero.

```
npm run build
npm test
python tools/test_rendering_pixels.py
python tools/browser-rendering-tests.py --require-webgpu --software-gpu
python tools/verify-rendering-report.py reports/rendering/report.json --backend webgpu
```

Restricted local browser runs explicitly skip unavailable APIs; those skips are
not GPU qualification. Automated adapters are normally software SwiftShader.
This evidence does **not** certify complete native Windows VB6 golden-image parity,
a fully GPU-only IDE, physical desktop/mobile acceleration, sustained frame pacing,
power consumption or an end-to-end performance improvement over HTML/CSS.

Pre-captured native CSSOM methods/declarations and direct writes through previously
saved adopted-sheet arrays can bypass observation; integrations can explicitly
call `renderer.invalidateStyles()`. A built-in closed shadow root created before
observation requires `data-vb-native-render`. These limitations remain documented
rather than presented as complete browser-paint emulation.

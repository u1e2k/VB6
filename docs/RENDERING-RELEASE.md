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
when required and returns to idle afterward. The October 6 lifecycle correction
defers newly encountered ResizeObserver targets to a coalesced task outside an
active resize-delivery loop. It cancels and clears pending registrations during
failure, backend replacement and disposal. See [RENDERING-RESIZE-LIFECYCLE.md](RENDERING-RESIZE-LIFECYCLE.md).

**Measure Rendering / Cancel Measurement / Save Report** runs a bounded workload
on the actual local adapter without changing project or renderer preferences.
It preserves raw CPU submission samples and optional real WebGPU pass timestamps.
Normal frames do not allocate diagnostic query/readback buffers. Adapter identity,
software fallback and timer quantization remain explicit; GPU time, presentation
latency, FPS and CPU submission time are not interchangeable measurements.

## Integration and attribution

The source incorporates main `728a9201806a4d455113867d2778c3262666a05b`, including
its visual-fidelity CSS, caption/menu behavior and portable generated bundles,
as well as the preceding scalar runtime, editor/IME, agent, native interoperability
and data-provider work. Generated outputs are rebuilt from the combined source,
not selected from one side of a merge conflict.

Jordan Scales' HN/98.css staircase-bevel attribution and complete MIT notice remain
in source, distributed CSS and release packages. Independent CSSOM, Web Animations,
DOM, CSSWG, WebGPU and layout-batching guidance is attributed at the relevant code.
No third-party fonts are included by this change. Classic mnemonic marks use a
scoped filled strip to avoid automatic underline raster drift; native glyphs,
inline layout, prose underlines and high-contrast fallback are preserved.

## Acceptance and reproducibility

The shared `tools/verify-rendering-report.py` gate requires **34 passed cases,
zero failed and zero skipped** for each required GPU API. x64, ARM64 and container
matrices exercise WebGPU/WebGL2 in headed/headless Chromium. Each requires actual
API execution, exact framebuffer/presentation pixels and reproducible generated
outputs. Consult the run on the PR's exact head; historical 19/30/33-case runs are
not substitutes for current-source qualification.

Coverage includes six-DPI primitives/holes/clips/textures, four-DPI whole-IDE
comparisons against HTML, repeated mnemonic switching, actual runtime controls
and changed/disabled/selected states, multiple themes, mobile layout, detached
Properties ownership, standalone calculator execution, CSSOM/animation wakeups,
resize reentrancy, alpha compositing, retained scenes/textures, loss recovery,
settings/measurement cancellation, persisted-page lifecycle and cleanup.
The screenshot comparator's counts, errors and difference bounds are separately
checked against scalar calculations, including single-channel and sparse changes.
Neither pixel tolerance nor failure handling is relaxed.

```
npm run build
npm test
python tools/test_rendering_pixels.py
python tools/browser-rendering-tests.py --require-webgpu --software-gpu
python tools/verify-rendering-report.py reports/rendering/report.json --backend webgpu
```

Restricted local browser runs explicitly skip unavailable APIs; those skips are
not GPU qualification. Automated adapters are normally software SwiftShader.
The evidence does **not** certify complete native Windows VB6 golden-image parity,
a fully GPU-only IDE, physical desktop/mobile acceleration, sustained frame pacing,
power consumption or an end-to-end performance improvement over HTML/CSS.

Pre-captured native CSSOM methods/declarations and direct writes through previously
saved adopted-sheet arrays can bypass observation; integrations can explicitly
call `renderer.invalidateStyles()`. A built-in closed shadow root created before
observation requires `data-vb-native-render`. These limitations remain documented
rather than silently presented as complete browser-paint emulation.

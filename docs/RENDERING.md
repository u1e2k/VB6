# UI rendering backends

## Status and scope

The UI renderer is a **hybrid DOM/GPU implementation**. Supported classic
backgrounds, solid border edges, axis-aligned gradients, zero-blur shadows and
classic staircase background layers become clipped instanced GPU quads. Eligible
text can use a cached browser-shaped atlas. This is not an HTML screenshot,
`foreignObject` snapshot or full-screen bitmap uploaded every frame.

The DOM remains the layout, input, accessibility and editing authority. Native
text is the default. Inputs, selection/IME, the code editor, SVG icons, pictures,
tables, existing graphics canvases, focus outlines and unsupported CSS remain
native. Transparent holes expose those browser pixels; fractional border strips
retain native rasterization where CSS and GPU rounding differ. GPU-atlas text is
experimental, not a substitute for native editing.

Strict software-GPU framebuffer and IDE comparisons have passed. **This does not
certify complete native VB6 parity, GPU-only rendering, physical-device performance
or a whole-IDE speedup.** See [RENDERING-VALIDATION.md](RENDERING-VALIDATION.md) for
measured results, source revisions and remaining gates.

## Classic Options dialog

Open **Tools → Options → Rendering**. WebGPU is the preferred default in this
feature branch; HTML/CSS remains selectable. The first and second fallback
selectors define an ordered list. Duplicate entries and the preferred backend
are removed; HTML/CSS is always the final safety net. The default chain is:

```
WebGPU → WebGL2 → Canvas2D → HTML / CSS
```

Switching backends applies without reloading or recreating the project, editor,
controls or debugger. HTML removes the overlay and disconnects paint observation.
Cancel does not change the policy. Text and pixel-snapping choices are independent.
The status reports requested and active backends plus failed-attempt reasons;
it never labels a Canvas2D fallback as WebGPU.

IDE preferences use `vb6-studio-web.rendering.v1`; corrupt or denied storage does
not stop startup. **Use these settings in exported applications** explicitly
writes `project.settings.rendering` and participates in the Options undo
transaction. Otherwise the change is only an IDE preference. Exported apps
without an explicit policy prefer WebGPU with the default fallback chain.
General → Graphics still configures separate VB drawing surfaces.

## Runtime and window lifecycle

`ApplicationHost` retains a renderer for its owner document. Hosts in the same
document share one reference-counted renderer. Disposing one host does not remove
another's layer. `rendering: false` opts out of automatic retention. The first
host establishes policy; explicit `setOptions()` changes it for all document owners.

Standalone HTML embeds the same renderer with the runtime. The browser/Electron
IDE uses the same integration. Native Win32 AOT/GDI controls are not replaced.
Detached IDE documents have document-bound canvases, contexts and device
acquisition, inherit live policy changes, and release resources on reattach/close.
Renderer installation neither opens windows nor changes MDI settings.

Device/context loss advances through configured fallbacks. Each attempt uses a
new canvas because incompatible context types cannot share one. Generation checks
discard late startup results. Forced colors use HTML/CSS; printing hides the
overlay. Teardown and first-frame failure disconnect mutation/resize observers,
clear retained nodes/scenes, cancel callbacks and dispose buffers/textures without
destroying another renderer's shared WebGPU device.

## Reusable API

The dependency-free modules are exposed through `src/rendering/entry.js` and the
standalone `dist/vb6-rendering.js` global `VB6Rendering`. The DOM adapter has no
IDE or VB runtime dependency.

```js
const session = VB6Rendering.retainRenderer(document, {
  backend: 'webgpu',
  fallbacks: ['webgl2', 'canvas2d', 'html'],
  text: 'native',
  pixelSnap: true
});
await session.renderer.ready;
console.log(session.renderer.getStats());
await session.renderer.setOptions({ backend: 'html' });
session.release(); // Idempotent; last owner tears down the renderer.
```

`createPainter(backend, canvas)` and `PaintScene` support standalone non-DOM use.
Coordinates are CSS pixels and colors are unpremultiplied sRGB. Rectangles, clips,
two-color axis gradients and atlas regions produce premultiplied output.
`scene.native()` explicitly clears alpha for native islands; it is not a claim
that those pixels were GPU-painted. Low-level painters install no event loop.
`scene.seal()` creates an immutable geometry snapshot that painters can reuse.

Texture pages provide `canvas`, `width`, `height` and `revision`. Increment
`revision` after changing pixels within an existing source canvas. Replacing the
source canvas or changing its dimensions also invalidates the texture upload.
Image-only changes preserve retained geometry and draw-batch caches.

## Resolution, invalidation and retention

Backing stores use the actual device pixel ratio, including fractional scaling
and DPR 4, without arbitrary DPR-2/DPR-3 caps. Device limits or the 32-megapixel
allocation budget cause explicit fallback rather than silent downscaling.
Adjacent snapped edges share a rounded device boundary. Native holes round outwards
to preserve antialiased glyph edges.

Mutation/input/scroll/theme/font events coalesce into one pending animation-frame
callback. ResizeObserver tracks encountered elements and removes obsolete targets,
including when CSSOM geometry changes without an attribute mutation. CSS
transition/animation events wake rendering; while document animations are active,
styles are resampled and frames scheduled as needed. Rendering returns to idle
when they complete. Arbitrary CSSOM color-only changes and programmatic animation
starts without a wake-up event still require explicit style invalidation; do not
assume every browser paint trigger is observed.

Each scene build is compared exactly with the retained immutable snapshot,
including command order, clips, colors, texture identities and dimensions. No
probabilistic hash or approximate tolerance decides equality. Identical geometry
reuses its snapshot, packed instances, GPU upload and compatible draw batches.
Unchanged pixels skip submission entirely. Image revisions/source replacements
are tracked separately. `renderer.renderNow({force: true})` explicitly submits
for diagnosis/measurement; ordinary `renderNow()` may skip unchanged output.

This avoids redundant uploads/submissions, not all DOM reads or scene construction.
Computed styles/parsed paints are cached. Buffers grow geometrically, consecutive
compatible primitives batch, and atlas pages/resources are bounded and released
when unused. Production frames do not wait on `queue.onSubmittedWorkDone()`.

`getStats()` reports requested/active backend, adapter, fallback attempts,
`frames` (actual submissions), `sceneBuilds`, `unchangedFrames`, native-island
counts, CPU scene-build/submission percentiles and allocation/upload/draw counters.
These are not GPU timestamps, presentation latency or FPS. An idle UI submitting
zero frames is expected, not evidence of a fixed fabricated FPS.

## Reproduction and acceptance

```
npm run build
npm test
npm run test:rendering:browser
python tools/browser-rendering-tests.py --require-webgpu --software-gpu
python tools/browser-rendering-tests.py --require-webgl2 --software-gpu
```

Tests require Python Playwright and Pillow. `CHROMIUM_PATH` selects the browser;
`--headed` enables a visible window (use Xvfb on Linux CI). Restricted local mode
may use `set_content` and reports unavailable GPUs as skipped. Strict mode serves
localhost and fails unless the selected API actually draws. Software-driver flags
are test-only, not production configuration or physical-device qualification.

The permanent workflow separately tests WebGPU and WebGL2 in headed and headless
configurations. It covers direct framebuffer readback, presentation screenshots,
exact primitive/clip/texture pixels at DPR 1/1.25/1.5/2/3/4 and exact existing-HTML
IDE comparisons at DPR 1/1.25/1.5/2. **The IDE fixture gate requires zero changed
pixels**, not an error budget. Other cases cover Options behavior, fallback/loss,
startup races, ownership, resize/animation/idle cleanup, retained image replacement
and isolated forced-IDE/10,000-quad CPU workloads. Reports are in `reports/rendering`.

The user's full target additionally needs approved native VB6/control-state
references, representative physical desktop/mobile measurements against HTML/CSS,
and completion of the remaining GPU-painted surfaces. Passing these bounded
fixtures must not be described as universal pixel-perfect or GPU-only rendering.

# UI rendering backends

## Status and scope

The UI renderer is a **hybrid DOM/GPU implementation**, not a claim that every
pixel of the IDE is drawn exclusively by WebGPU. The existing DOM remains the
layout, input, accessibility and editing authority. Supported classic backgrounds,
solid border edges, axis-aligned gradients and zero-blur shadows become clipped,
instanced GPU quads. Eligible text can use a cached, browser-shaped texture atlas.
This is not an HTML screenshot, `foreignObject` snapshot, or full-screen bitmap
uploaded every frame.

Native text is the default for font fidelity. Inputs, selection/IME, the code
editor, SVG icons, pictures, tables, existing graphics canvases, focus outlines
and CSS effects outside the painter's coverage remain native. Transparent holes
in the visual layer reveal those exact browser pixels. Fractional CSS border
edge strips retain native rasterization where CSS and GPU rounding differ.
GPU text is experimental and is not a substitute for native editing.

**Do not interpret a passing software-GPU CI run as physical-GPU performance
certification, native Microsoft VB6 pixel parity, complete CSS coverage, or a
proven speedup over HTML/CSS.** Retaining the DOM adds work: the CPU still does
browser layout and constructs a paint list. A complete independent GPU UI engine
requires replacing that layout/paint contract, not merely changing the canvas API.

## Classic Options dialog

Open **Tools → Options → Rendering**. The preferred backend defaults to WebGPU.
Select WebGPU, WebGL2, Canvas2D, or HTML / CSS. The first and second fallback
selectors specify an ordered list; duplicates and the preferred backend are
removed. HTML / CSS is always the final safety net. The default is:

```
WebGPU → WebGL2 → Canvas2D → HTML / CSS
```

Selecting HTML removes the visual canvas entirely. A backend switch takes effect
without reloading or recreating the project, code editor, controls or debugger.
Cancel never changes the policy. The native text and pixel-snapping choices are
independent. The status area reports the requested and active backend and the
reason for failed attempts; it never labels a Canvas2D fallback as WebGPU.

The preference is stored in `vb6-studio-web.rendering.v1`. Storage denial or
corrupt settings do not stop startup. **Use these settings in exported
applications** explicitly writes `project.settings.rendering` into the project;
it participates in the existing Options undo transaction. Without that checkbox,
the setting is an IDE preference rather than a project edit. New applications
without an explicit policy default to WebGPU with the default fallback order.
The older General → Graphics setting still configures VB drawing surfaces, which
are separate from the UI painter.

## Runtime and window lifecycle

`ApplicationHost` retains a renderer for its owner document. Multiple hosts share
one reference-counted renderer; disposing one host does not remove the others'
visual layer. Pass `rendering: false` to opt out of automatically retaining the UI
renderer. The first host in a shared document establishes its policy; an explicit
`renderer.setOptions()` changes that document's policy for all owners.

Exported standalone HTML automatically embeds the same renderer with the runtime.
The browser/Electron IDE uses the same integration. This does not replace the
Win32 AOT/GDI target's native controls.

Detached IDE windows receive their own document-bound canvas, context and device
acquisition. They inherit live policy changes from the main IDE and release their
resources when reattached or closed. Installing rendering does not open any
windows or change MDI mode. Native selection, focus, event handlers, keyboard
shortcuts and accessibility nodes remain in the original DOM.

A lost WebGPU device advances to the next configured fallback. A lost WebGL2
context does likewise. A new canvas is created for each backend because a canvas
cannot switch between incompatible context types. Late startup results are
rejected by a generation check and disposed. Forced-colors mode uses HTML/CSS;
printing temporarily hides the overlay. Page teardown removes observers,
listeners, scheduled callbacks, buffers, textures and contexts without destroying
other renderers' shared WebGPU device.

## Reusable API

`dist/vb6-rendering.js` exposes `VB6Rendering`. The dependency-free ES modules are
in `src/rendering/entry.js`; the DOM adapter has no IDE or VB runtime dependency.

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
session.release(); // Idempotent; last owner tears the renderer down.
```

Use `createPainter(backend, canvas)` and `PaintScene` for a reusable non-DOM
renderer. All coordinates are CSS pixels and colors are unpremultiplied sRGB.
`PaintScene.add()` supports rectangles, clipping, two-color axis gradients and
atlas texture regions. Painters output premultiplied color. `scene.native()` is
an explicit alpha-clearing operation for the hybrid adapter, not a placeholder
claim of GPU rendering. Low-level painters do not install an event loop.

## Resolution and performance

The UI framebuffer uses the actual device pixel ratio, including fractional
scaling and DPR 4. There is no arbitrary DPR-2/DPR-3 cap in this UI renderer.
Dimensions above the device limit or the 32-megapixel allocation budget cause
fallback rather than silent downscaling. Pixel-snapped adjacent edges use the
same rounded device-pixel boundary. Native islands round their clear rectangles
outward so antialiased glyph edges are not clipped.

Rendering is demand-driven: mutation/input/scroll/resize/theme/font events
coalesce into at most one pending animation-frame callback. There is no perpetual
animation loop and no `queue.onSubmittedWorkDone()` in the production frame path.
Computed styles and parsed paints are cached. GPU buffers grow geometrically
and are reused. Consecutive compatible primitives batch into instanced draw
calls. Atlas pages are bounded, uploaded only when their revision changes, and
released when no longer referenced.

`getStats()` reports active/requested backend, adapter information, fallback
attempts, frame count, scene/native-island counts, CPU scene-building and CPU
submission percentiles, draw calls, allocation and upload counters. These are
not GPU timestamp measurements or FPS. An inactive IDE submitting zero frames
is expected; a fabricated steady FPS would be misleading.

## Reproduction and acceptance gates

```
npm run build
npm test
npm run test:rendering:browser
npm run test:rendering:gpu
```

The browser tests require Python Playwright and Pillow. `CHROMIUM_PATH` selects
the executable. The first command can use `set_content` in a restricted browser;
GPU-unavailable cases are explicitly reported as skipped. The GPU command serves
localhost, requires actual WebGPU and WebGL2 initialization, executes shaders,
and fails rather than counting fallback output as GPU evidence.

The suite records exact cross-backend solid/clip/texture pixels at DPR 1, 1.25,
1.5, 2, 3 and 4; HTML comparison images at multiple DPI scales; Options
cancel/apply/export; demand scheduling; asynchronous startup races; shared
ownership; GPU device/context loss; and forced-rebuild/batched-quad CPU metrics.
Artifacts are in `reports/rendering/`. The UI screenshot guard is a regression
budget, not a universal pixel-perfect claim; the report separately states whether
all captured IDE pixels actually match.

Before certifying the user's full target, retain these separate gates:

* Compare approved native VB6 reference images, all themes and control states,
  editor selection/IME, nested popups, scrolling, multiwindow and mobile layouts.
* Execute the renderer on representative physical Windows/macOS/mobile GPUs and
  report end-to-end latency, GPU time, memory and power versus HTML/CSS.
* Complete or explicitly retain the native islands; do not describe the current
  hybrid implementation as an exclusively WebGPU-rendered IDE.

The PR must not be merged merely because WebGPU exists or the unit suite is green
when the requested complete pixel/performance certification is still outstanding.

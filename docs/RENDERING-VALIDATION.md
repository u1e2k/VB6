# Rendering qualification — 2026-10-05

**Status: draft; not approved for merge.** The implementation is a WebGPU-first hybrid UI renderer, not a full independent GPU UI. Physical-hardware performance and complete pixel parity are not certified.

## Verified implementation

WebGPU is the requested default in the feature branch. The classic Tools → Options → Rendering tab retains HTML/CSS, offers WebGL2 and Canvas2D fallbacks, applies settings live, and separately controls embedding settings in exported applications. The renderer is integrated with the IDE, runtime, detached documents and generated standalone apps. See [RENDERING.md](RENDERING.md) for architecture, API and boundaries.

The full integrated Node suite passed **1,460 tests** locally and in the source-publication workflow. Local browser checks confirm settings cancel/apply/export, asynchronous failure handling, ownership cleanup and demand-driven idle behavior. Canvas2D versus the existing HTML IDE fixture had **zero changed pixels at DPR 1, 1.25, 1.5 and 2**. Local WebGPU/WebGL2 are unavailable and must not be counted as successful GPU executions; reference-only pixel cases are reported as skipped.

## Strict GPU execution remains blocked

The completed strict run [37300456342](https://github.com/wieslawsoltes/VB6/actions/runs/37300456342), testing source `ee96a9928368d57257765df93c23f92df4e2898e`, failed. Its downloaded `rendering-framebuffer-evidence` artifact reports **2 passed / 14 failed** test cases. The WebGPU availability case returned `A valid external Instance reference no longer exists.` Required WebGPU pixel and performance cases consequently failed; they did not pass using a fallback.

An earlier explicit-Vulkan-compositor run [37299509999](https://github.com/wieslawsoltes/VB6/actions/runs/37299509999) successfully initialized WebGPU on **SwiftShader**, compiled the shader and exercised real device/context loss. However, its WebGPU primitive screenshots were blank and failed exact comparison at all six tested DPR values. Its idle and 10,000-quad checks also failed. This is software-GPU evidence, not physical-device qualification.

The later strict run retained exact Canvas2D-versus-HTML images at all four IDE DPI settings. WebGL2 matched at DPR 1, 1.25 and 2, but **two pixels differed at DPR 1.5**. Earlier zero-difference captures therefore do not establish universal exact parity.

The test harness now includes direct GPU texture-to-buffer readback, independently of compositor screenshots, plus explicit initialization errors and skip counts. The latest strict run did not reach successful WebGPU readback because initialization failed. A visually identical IDE screenshot with a blank overlay is not proof that WebGPU painted the interface.

## Merge gates still open

1. Resolve WebGPU adapter/device/presentation failures and pass the strict primitive, texture, clipping, loss and workload tests without fallback.
2. Validate all runtime controls and states, editor selection/IME, menus/popups, scrolling, themes and detached windows against approved visual references. The current HTML fixture is not a native Microsoft VB6 Windows reference.
3. Measure representative physical desktop/mobile GPUs against HTML/CSS: frame pacing, interaction latency, CPU and GPU time, memory and sustained performance. CPU submission timings on SwiftShader are insufficient.
4. Finish remaining native-painted surfaces before describing the renderer as fully WebGPU-rendered. Native text, editors, controls, icons and unsupported CSS currently remain DOM-painted.

No physical-GPU speedup or complete pixel-perfect rendering is claimed. Keep PR #21 in draft until the requested gates are met.

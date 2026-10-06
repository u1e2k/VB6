# Dual-renderer validation — October 6, 2026

## Current acceptance contract

`tools/verify-rendering-report.py` requires **38 distinct cases, zero failures and
zero skips** for each selected GPU API. WebGPU/WebGL2 run independently in headed
and headless Chromium on x64, ARM64 and lightweight Linux containers. A fallback
cannot satisfy a required-backend case. Generated distributions must reproduce
exactly from the merged authored source.

Coverage includes independent GPU framebuffer readback and presentation pixels
at six device-pixel ratios; four-ratio whole-IDE HTML reference comparisons;
repeated mode switches; eight-ratio background edges; actual controls, themes,
selection, disabled/checked/indeterminate states; mobile layout; detached windows;
standalone calculator execution; CSSOM/animation/resize wakeups; actual device and
context loss; ownership, cancellation and teardown; retained geometry and replaced
textures; and the reconciled hover and same-backend Options regressions.

The screenshot comparator itself has independent scalar verification. Zero-pixel
comparisons remain zero-pixel comparisons; no reference is replaced with GPU
output, no region is masked, and no difference tolerance is introduced.

## Reconciled source

The release combines local `55934004`, remote renderer `34740322`, main `e7cfde0a`
(native debugger and String interoperability), and subsequent main `bd4f9cfb`
(agent recovery/compaction and diagnostics lifecycle). Conflicting generated
output is rebuilt, not chosen from one side. Both the newer deferred ResizeObserver
registration and the local pointer/settings/checkbox corrections are retained.
See [the continuation record](RENDERING-CONTINUATION-2026-10-06.md) for source
lineage and narrow native-edge preservation details.

Local validation before the final `bd4f9cfb` integration passed **3,180 Node tests**,
**14 classic HTML browser cases**, and the required-WebGL2 suite in both headed
and headless Chromium: **37 passed, zero failed, one explicitly skipped WebGPU
device-loss case** each. These local skips are not GPU certification. The
published-source runs linked from [PR #21](https://github.com/wieslawsoltes/VB6/pull/21)
are the final-head acceptance evidence; earlier 19/30/34-case reports are historical.

## Reproducible software-adapter screenshots

A local Chromium 144 investigation reproduced a changing native HTML border at
fractional DPI even after the overlay was removed. Speculative permanent
application promotion/isolation hints were discarded. The explicit software-GPU
test profile uses `--disable-partial-raster` and
`--run-all-compositor-stages-before-draw` to capture complete native raster and
compositor output. These switches are documented in the
[Google Chrome launcher guidance](https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md#rendering--gpu),
are recorded in every report, and affect only this requested test profile.
Application CSS and normal/hardware measurement paths do not get these flags.

## Performance and coverage boundaries

The renderer skips identical output, retains geometry uploads and batches, and
tracks texture revisions/source identity separately. Tests require a 10,000-quad,
60-frame workload to reuse one geometry upload and one compatible draw batch.
These structural assertions are not fabricated FPS or proof of whole-IDE speedup.
The classic measurement tool reports actual adapter identity, raw CPU submission
samples and optional real GPU pass timestamps, with quantization and software
adapters explicit. Production frames allocate no diagnostic readbacks.

This release is **WebGPU-first hybrid DOM/GPU rendering** with HTML/CSS retained.
Native layout, accessibility, editing/IME, native text/widgets/icons and unsupported
CSS remain browser-painted. Passing these bounded software-adapter fixtures does
not certify fully GPU-only painting, every native Microsoft VB6 Windows pixel,
physical desktop/mobile acceleration, sustained FPS, input latency or power use.
Representative physical-hardware comparisons and native Windows reference matrices
remain broader qualification work, not completed claims of this merge.

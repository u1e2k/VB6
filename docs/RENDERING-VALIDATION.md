# Rendering qualification — 2026-10-05

## Historical qualification and current release scope

**The strict software-GPU pixel gate has passed. The full GPU-only rendering and
physical-device performance goals have not been certified. The final integration is described in [RENDERING-RELEASE.md](RENDERING-RELEASE.md).**

The attributed classic HTML/CSS improvements are already merged separately in
[PR #36](https://github.com/wieslawsoltes/VB6/pull/36), commit
`2b4f9dd50fc20c36f2a48d3c8586e4063277ff69`. This rendering branch incorporates that
release without losing its current debugger, form-input, native-call or region
changes. Main's UI renderer preference was not changed by PR #36.

## First complete strict GPU pass

[Run 37356581025](https://github.com/wieslawsoltes/VB6/actions/runs/37356581025),
source `37e94823d0c8811dcd17a5cc0e642176362d033e`, passed all four independent jobs:
WebGPU/headless, WebGPU/headed, WebGL2/headless and WebGL2/headed. Each job requires
its selected backend to execute rather than accepting a fallback as success.
Generated distributions were reproducible in all four jobs.

The downloaded WebGPU/headless report contains **18 passed, 0 failed, 0 skipped**
browser cases. It records:

- Exact solid, clip, transparent-hole and texture framebuffer/presentation pixels
  at DPR 1, 1.25, 1.5, 2, 3 and 4. Direct texture readback is separate from the
  screenshot check, so a blank overlay cannot pass solely by exposing HTML.
- Zero changed pixels in all 12 IDE comparisons: Canvas2D, WebGL2 and WebGPU
  against the existing HTML fixture at DPR 1, 1.25, 1.5 and 2.
- Options cancel/apply/export, ordered fallback, asynchronous startup ownership,
  actual device/context loss and final cleanup.
- One hundred unchanged UI render requests with **zero submitted frames**, the
  same retained geometry snapshot and 100 recorded unchanged-frame skips.
- A forced render submits once; CSSOM width changes trigger resize observation;
  a finite CSS background animation reaches its correct final color and returns
  to zero idle submissions. Switching to HTML clears observed-node resources.

The historical initialization/blank-frame failures in runs 37300456342 and
37299509999 do not describe this passing source. The last two-pixel fractional
IDE discrepancy also existed with the overlay hidden. A scoped classic mnemonic
`text-decoration-skip-ink: none` rule fixed it; the pixel comparison still requires
**zero** changed pixels. General prose underlines and native fonts were not replaced.

## Retained texture-source follow-up

Source `ff944059d27f2188071faedddf45af47e31516c7` additionally fixes stale images
when a page's canvas is replaced without changing its dimensions or revision.
Both GPU texture caches now compare the source object as well as revision and
size. Two unit regressions and a nineteenth browser case require exact red-to-green
texture replacement while sealed geometry is uploaded only once.

The integrated source passes **2,386 Node tests** locally; the texture-publication
workflow also passed its full build and Node suite. Inspect the GPU workflow on
the PR's current head for the follow-up's complete 19-case backend results. The
18-case run above is explicitly the earlier retained-scene baseline, not evidence
that the subsequent texture case ran there.

## Performance evidence and limitations

All measurements below are from the first passing WebGPU/headless report,
Chromium 143.0.7499.4 on Linux, **Google SwiftShader software adapter**. They are
not physical GPU timing, presentation latency, sustained FPS or power measurements.

| Workload | Recorded result |
| --- | --- |
| 10,000 sealed opaque quads, 60 frames | One draw per frame; one buffer allocation, geometry pack, batch build and geometry upload across all frames |
| CPU submission for that workload | Median about 0.10 ms; 95th percentile about 0.30 ms |
| Actual 1,498-command IDE, forced scene rebuild | CPU build median about 11.4 ms; 95th percentile about 21.9 ms |
| Unchanged live UI fixture | Zero GPU submissions for 100 identical render requests |

The forced whole-IDE build cost is material. Avoiding redundant submissions and
uploads is useful, but these results do **not** establish a whole-IDE speedup over
HTML/CSS or a high-refresh-rate frame budget. No speedup is inferred from a forced
rebuild benchmark that accidentally skips painting: that test uses `force: true`.

## Remaining acceptance gates

1. Qualify complete runtime/control states, themes, editor selection/IME,
   popups, scrolling, detached windows and mobile layouts against approved
   references. Existing HTML screenshots are not native Microsoft VB6 goldens.
2. Measure representative physical desktop/mobile GPUs against HTML/CSS for
   scene/layout CPU cost, GPU time, frame pacing, interaction latency, memory and
   sustained performance. Software adapter CPU timings cannot substitute.
3. Complete the remaining GPU-painted surfaces before calling this a fully
   WebGPU-rendered IDE. Layout, accessibility, native editing, text, icons,
   existing graphics canvases and unsupported CSS still rely on DOM/native paint.
4. The final integration adds CSSOM and script-created animation observation.
   Pre-captured native references and direct indexed adopted-sheet array edits
   still require the explicit invalidation hook; see the release document.

See [RENDERING.md](RENDERING.md) for API and settings. Keep the qualification boundaries separate: passing software-GPU cases does not
constitute physical-hardware or native Windows visual certification. This release
ships the validated dual-renderer integration, not a claim that these broader
compatibility goals are complete.

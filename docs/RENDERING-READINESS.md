# Rendering integration readiness — 2026-10-06

The previous candidate `7f2c1777` did not pass the full repository matrix. Its
isolated pixel passes were insufficient: WebKit reported ResizeObserver delivery
errors, reference autosave could call programmatic metadata hooks, and the native
IDE preview could race between srcdoc and registered-URL navigations.

Implementation `c62755e0ac1ab0f9e97c5945543def33bab0f8b5` incorporates main
`5e9a3191ff04d00b13e4f100c48e219a836b7a4b`, preserves both the dual-renderer and
advanced-GDI README sections, and rebuilds all generated applications from the
combined source. Publication run:
https://github.com/wieslawsoltes/VB6/actions/runs/37422198799

## Corrections

- MDI ResizeObserver notifications schedule one owning-window animation frame.
  Explicit user reflows remain synchronous and cancel a queued reflow. Unchanged
  caption SVGs and geometry attributes are retained instead of replacing observed
  elements during the observer delivery loop. Disposal cancels pending work,
  including a valid frame handle of zero. Five unit regressions cover these cases.
- Persisted pagehide does not release Studio's retained renderer ownership.
  Repeated BFCache-style suspension/restoration remains usable; a later final
  pagehide releases renderer resources. This is a lifecycle-event contract test,
  not certification of every browser's real BFCache eligibility.
- Source and expression completion cancel deferred composition assistance on
  Escape. Expression blur and editor disposal also clear deferred work; normal
  post-composition assistance remains tested.
- Autosave copies explicit reference/type-library metadata through the existing
  bounded passive-data validator before JSON serialization. Callable or accessor
  metadata is rejected without executing it or replacing the prior stored
  workspace; non-enumerable JSON hooks are not copied. Ordinary project payloads
  and valid native-reference descriptors are retained. This does not make all
  arbitrary JavaScript project objects or Proxy traps safe to execute.
- Native IDE preview registration is selected through loadRuntimeDocument before
  navigation begins. The native host never assigns and then removes srcdoc.
  Stale asynchronous replies cannot navigate a replaced frame or stop a new run.
  Sandbox attributes, CSP and the root-only native bridge are unchanged.

## Exact screenshot baseline

The repeated-switch test had captured a transient initial HTML compositor frame.
The reported 626-pixel mismatch could occur before any GPU switch, in another
HTML-only screenshot. The fixture now waits for three consecutive identical
HTML-only frames (bounded to 30 attempts), records the capture hashes and initial
pixel differences, and freezes that native reference for all following switches.
It never takes GPU output as the reference, replaces a reference after switching,
ignores changing regions or increases the zero-pixel tolerance. The permanent
mnemonic strip correction and all existing framebuffer assertions remain.

## Evidence and scope

The twelve changed authored files were byte-compared with the reviewed local
implementation after publication. The pre-main-integration local suite passed
2,621 Node tests, all six focused composition/reference browser cases, and the
rendering suite's 23 locally supported cases; eight unavailable GPU cases remain
explicit skips in that restricted environment. The integrated current-head CI
results, not these local skips or prior candidates, determine merge readiness.
The strict software-GPU suite now requires 31 passed, zero failed and zero skipped
in each ARM64/container backend and display configuration. Its extra case covers
Studio renderer ownership across persisted lifecycle events.

This continues to be a WebGPU-first hybrid UI with retained native editing,
accessibility and unsupported surfaces. Software-driver tests do not establish a
physical-device speedup, a completely GPU-only UI or native Microsoft VB6 golden
image equivalence. See RENDERING-RELEASE.md and RENDERING-VALIDATION.md for the
broader compatibility and measurement boundaries.

## Sources

Relevant source comments attribute ResizeObserver delivery to W3C, page-transition
and iframe navigation behavior to WHATWG, and screenshot-stability practice to
Playwright. Existing HN/Jordan Scales/98.css bevel attribution and the MIT notice
remain in authored and distributed CSS.

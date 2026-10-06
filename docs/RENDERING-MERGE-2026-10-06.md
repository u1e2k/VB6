# Dual-renderer merge qualification — October 6, 2026

## Qualified application source

The final application implementation is commit
`54a4dd6f7acc92e522797501e40e09bd53c3f2b1`, tree
`6cbd4532e9c352c68c7c41d6b1c99856851d1642`. It incorporates main
`b70becd023f4b72122ed0e193830f098349c845a`, including current OCX source controls,
property pages and container contracts, without losing the prior rendering API.
All 64 prior renderer/runtime exports and all 70 current-main exports remain
available. All 27 generated IDE/runtime/sample/OCX-lab fingerprints verify.

The final documentation/CI cleanup incorporates main's README-only commit
`eedeabaabe3e4c50b24fee25a9464f725b90b5cf` and preserves its README exactly.
It changes no application, test, build, package, or generated-output bytes.
The exact final head and merge result are recorded in
[PR #21](https://github.com/wieslawsoltes/VB6/pull/21).

## Completed pre-merge GPU qualification

| Configuration family | Run | Result |
| --- | --- | --- |
| x64 WebGPU/WebGL2, headed/headless | [37527648272](https://github.com/wieslawsoltes/VB6/actions/runs/37527648272) | All four jobs passed |
| ARM64 WebGPU/WebGL2, headed/headless | [37527648038](https://github.com/wieslawsoltes/VB6/actions/runs/37527648038) | All four jobs passed |
| Linux container WebGPU/WebGL2, headed/headless | [37527647986](https://github.com/wieslawsoltes/VB6/actions/runs/37527647986) | All four jobs passed |
| Complete Validate workflow | [37527648060](https://github.com/wieslawsoltes/VB6/actions/runs/37527648060) | Passed |

Every GPU job passed **38 distinct cases, zero failures and zero skips**:
**456 case executions across 12 configurations**. Each report includes 12 exact
whole-IDE comparisons against HTML, **144 comparisons total with zero changed
pixels**. These are repeated cross-configuration checks, not 144 unique scenes.
Required APIs executed actual draws; a fallback cannot satisfy the gate. Direct
framebuffer readback, presentation, fractional DPI, controls/states, retained
resources, device/context loss and lifecycle tests remain in the test suite.

All 12 downloaded GPU archives passed SHA-256 and ZIP-integrity verification;
the extracted reports also passed the shared report validator. Pixel tolerances,
assertions and reference images were not relaxed. The tested adapters are
**SwiftShader software adapters**, not physical GPU qualification.

## Additional source and integration checks

The complete Node suite passed **4,393 tests**, with no failed/skipped/cancelled
tests, locally, from a clean source-only extraction and during source publication.
The local browser checks passed 36 core scenarios, 14 classic HTML scenarios,
60 IntelliSense compatibility scenarios, and 12 OCX source-lab checks. Restricted
local rendering reported 30 passes and eight explicit unavailable-GPU skips;
those skips are not counted in the strict GPU evidence above.

The published implementation was independently compared against the locally
assembled source: **1,075 source/application files, zero differences**. Both public
API inventories and the WebGPU default were checked. Jordan Scales/HN/98.css
attribution and the complete MIT notice remain in source, shipped controls CSS
and the standalone IDE; no font files were added.

## CI policy after qualification

Merged [PR #66](https://github.com/wieslawsoltes/VB6/pull/66) deliberately retains
only **Validate** and **Pages**. After the successful GPU qualification above,
the three temporary renderer workflows are removed. The retained workflows are
byte-identical to main; all specialized test programs remain available. The
final documentation/CI-only head must pass Validate before the normal PR merge.
Older rendering documents describing permanent GPU matrices record the pre-merge
qualification arrangement; this document supersedes that workflow description.

Manual specialized verification remains available:

```sh
npm run build
npm test
python tools/test_rendering_pixels.py
python tools/browser-rendering-tests.py --require-webgpu --software-gpu
python tools/verify-rendering-report.py reports/rendering/report.json --backend webgpu
python tools/browser-rendering-tests.py --require-webgl2 --software-gpu
python tools/verify-rendering-report.py reports/rendering/report.json --backend webgl2
```

Python Playwright, Pillow and a supported browser/driver are required. The exact
software-test flags and adapter identity are recorded in each report.

## Configuration and evidence boundaries

**Tools → Options → Rendering** selects the preferred WebGPU UI painter or the
retained HTML/CSS path. Ordered defaults are WebGPU → WebGL2 → Canvas2D → HTML/CSS,
with HTML always the safety path. Saved HTML preferences are respected. The same
library supports IDE/runtime, standalone HTML and detached-document ownership.
See [RENDERING.md](RENDERING.md) for settings, API and local measurement controls.

This is **hybrid DOM/GPU rendering**. Layout, editing/IME, accessibility, native
text/widgets/icons and unsupported CSS remain browser-native. Bounded pixel
correctness and retained-resource tests do not certify a DOM-free IDE, universal
native Microsoft VB6 golden-image parity, physical desktop/mobile speedup,
sustained frame pacing, input latency, power use or whole-IDE performance gains.
The measurement tool reports actual local adapter, CPU and optional GPU-pass
results without converting software CI results into hardware claims.

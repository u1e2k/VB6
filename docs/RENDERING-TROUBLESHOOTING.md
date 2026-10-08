# GPU startup and recovery

See [renderer architecture and scope](RENDERING.md) for the hybrid DOM/GPU contract.

## When WebGPU falls back

Open **Tools → Options → Rendering**. **Current renderer** updates while the
backend initializes, succeeds or falls back. The preferred selector is a draft;
the status describes the saved policy and the renderer that is actually active.

**Retry Renderer** rechecks the saved backend order in the main and detached IDE
windows. It does not apply draft options, write preferences, edit the project or
change exported-application settings. Closing Options during a retry removes its
status listeners; renderer recovery may still finish independently.

**Save Diagnostics...** downloads a local JSON report with secure-context/API
availability, attempted backends and their nested adapter/context errors, current
adapter details when exposed, and recovery advice. It does not probe additional
GPU contexts or include project contents, credentials or the page URL. **Save
Report...** under Local measurement remains the separate timing report.

A null WebGPU adapter and unavailable WebGL2 context do not identify one definite
cause. Check HTTPS or localhost, browser graphics acceleration and browser/OS/GPU
driver support. Chromium exposes detailed feature and process failures at
`chrome://gpu` (Edge: `edge://gpu`). Changes to browser graphics settings may
require a browser restart. The page cannot enable a disabled or blocklisted GPU.
Do not use the test harness's software-driver/unsafe flags as production advice.

## Acquisition invariants

WebGPU tries high-performance, browser-default, low-power and finally a
browser-controlled compatibility request. Optional timestamp-query failure
reacquires an adapter without profiling. The requested texture extent is bounded
by the adapter's advertised limit and 16384; the existing 32-megapixel allocation
budget is unchanged. Output verification still rejects an unusable painter.

A shared per-window acquisition has a bounded lifetime. Timeout removes only
that cached operation; a late adapter cannot allocate a device and a late device
is destroyed without touching a newer shared device. A shorter consumer timeout
does not cancel another consumer's longer acquisition. WebGL2 retries only power
hints, preserves context-creation errors and never changes the canvas API.

## Regression checks

Run `npm run build`, `npm run test:rendering`, and the existing full rendering
suite. Additional real-API recovery cases run in the existing Validate matrix:

```sh
python tools/browser-rendering-recovery.py --require-webgpu --software-gpu
python tools/browser-rendering-recovery.py --require-webgl2 --software-gpu
```

Add `--headed` for visible-window execution. Reports and screenshots are under
`reports/rendering/recovery`. Required GPU runs fail rather than silently skip an
unavailable API. `--offline` inlines local bundles for restricted environments;
it does not waive a requested GPU requirement. Software-backed API execution is
correctness evidence, not physical-hardware performance certification.

References: [Chrome GPU troubleshooting](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips),
[WebGPU compatibility requests](https://developer.chrome.com/blog/new-in-webgpu-146),
[WebGL context attributes](https://registry.khronos.org/webgl/specs/latest/1.0/#5.2).

# Renderer resize-observer lifecycle

`renderNow()` may be invoked synchronously from application callbacks, including
an application's own `ResizeObserver` delivery. Registering newly encountered
scene elements at that point can add shallower observations inside an active
resize-delivery loop. Registration now runs in a coalesced task after delivery,
not a microtask, without delaying the requested paint itself.

The task snapshots only the latest scene's targets, registers new nodes and
unobserves departed ones. Identical target sets schedule no task. Switching to
HTML, failed startup and disposal cancel the pending task and release all target
references. Task identity plus renderer generation prevent a stale callback from
reinstalling observers or clearing a replacement backend's task.

The implementation is original. Relevant algorithm definitions are attributed in
`src/rendering/renderer.js`:

- https://www.w3.org/TR/resize-observer/#broadcast-active-observations
- https://www.w3.org/TR/resize-observer/#deliver-resize-loop-error

Five unit regressions cover deferred registration, coalescing/removal, unchanged
idle behavior, cancellation, stale callbacks and snapshot ownership. The added
browser acceptance case invokes a render from an external resize callback,
requires deferred registration, verifies subsequent geometry repaint, and checks
cleanup and uncaught browser errors. It uses the required selected GPU backend
in strict CI; fallback is not a successful GPU test. The shared report gate now
requires all 34 cases with no failures or skipped cases.

This is a lifecycle correction to the existing dual-renderer integration. It does
not replace native text/input/accessibility, change the renderer preference,
weaken pixel tolerances, or establish physical-hardware performance equivalence.

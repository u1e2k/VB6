# HTML rendering performance and attribution

The HTML/CSS renderer remains available and the classic IDE styling is unchanged.
This change reduces unnecessary work without replacing browser input/editing or
changing the layout of controls, selection handles, menus, or tool windows.

## Implementation

- The form designer reads every required rectangle before inserting selection
  outlines or tab-order markers. The content rectangle is read once per pass;
  view lookup is linear instead of a repeated full-array search.
- Dragging, resizing and keyboard movement refresh only selected control views.
  The no-argument `refreshControlPositions()` API still refreshes all views.
- ToolList reconciles its visible rows, retaining labels/icons and accessibility
  IDs. It does not rebuild the visible DOM on an unchanged paint. Rows leaving
  the viewport are released; its cache is bounded by the visible row count.
- Unchanged mnemonics/captions and native list options retain their nodes. Real
  caption, item, selection, enabled-state and tab-order changes still update.
  Input controls no longer rewrite the wrapper tab index twice per refresh.

The attempted selection-outline node cache was **not included**: local tests
found 1-channel-level antialiasing differences at fractional/high DPI. Batched
measurement retains the existing freshly painted outline behavior instead.

## Source attribution

Design guidance: Jeremy Wagner, Paul Lewis and Barry Pollard, **Avoid large,
complex layouts and layout thrashing**, web.dev, published March 20, 2015,
updated May 7, 2025:
<https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing>.
Read layout before writing it, and reduce unnecessary DOM work. References are
also placed beside the relevant source methods. All implementation and tests
are original code under this repository's MIT license, not copied snippets.
No third-party code or fonts were imported.

The user also supplied <https://news.ycombinator.com/item?id=49963404>. Its body
and author were not retrievable during this pass, so no suggestion or code is
attributed to that commenter and implementation of that specific feedback is
not claimed. The URL is retained for a subsequent verifiable review.

## Validation

Build first, then run:

```sh
npm run build
python tools/browser-html-retention.py
python tools/browser-html-retention.py --browser firefox
python tools/browser-html-retention.py --baseline /path/to/previous-IDE.html
```

The browser tests cover a 50,000-item list, node identity, accessibility and
selection updates, unchanged captions/options, batched geometry reads,
selective keyboard movement and screenshot comparisons at DPR 1, 1.25, 1.5, 2.
Reports are written to `reports/html-retention/report.json`. A baseline is
required for a before/after pixel claim. CI uses the unchanged base-branch IDE
build as that baseline and refuses any changed pixels in the tested fixture.

Local pre-integration evidence: all 10 cases passed; the unchanged 200-paint
list workload emitted zero DOM mutations. A 60-selected-control workload had
CPU p50 5.4 ms versus 14.5 ms before the change (40 draws per implementation).
These are individual same-browser observations, not general hardware speed
claims. The local source baseline predates current main; CI must validate the
integrated source and its exact base before merge. This HTML-only change does
not certify WebGPU, physical GPU performance or native Microsoft VB6 parity.

# HTML retention and designer measurement

Tool lists retain visible rows, labels, glyphs and accessibility identifiers.
An unchanged paint must make no live DOM mutation. The cache is bounded to the
visible range plus overscan; scrolling does not retain the entire item set.
Captions retain mnemonic text nodes when the source text is unchanged. Native
select options retain identity when a revision changes but their labels do not.
Selection, changed text/icons, tab order and accessible names remain live.

Designer selection painting measures the content origin once, indexes views by
identity, and collects control, tab-marker and anchor-parent rectangles before
writing any overlay nodes. The layout guide consumes the same snapshot,
including nested containers and fractional zoom. Fresh selection-outline nodes
retain the previous presentation; this is not an outline-node reuse experiment.

`refreshControlPositions()` retains its full-refresh contract. Its optional Set
of control IDs supports movement without refreshing unrelated controls when
automatic layout is disabled. Enabled automatic layout still refreshes all
solver-affected controls; keyboard and pointer paths do not apply a second full
refresh after reflow. Runtime, themes, detached documents and rendering backend
selection retain their existing contracts.

## Validation

Run `npm run build`, then `python tools/browser-html-retention.py`. Select an
installed engine with `--browser chromium`, `firefox`, or `webkit` (or
`VB6_BROWSER`). The existing Validate browser matrix runs all three engines;
no extra publication, recovery or repository-writing workflow is needed.
Reports and screenshots go to `reports/html-retention/<browser>`.

For a cross-build visual comparison, build the baseline separately and pass
`--baseline /absolute/path/to/baseline/VB6-Studio-Web.html`. Set
`HTML_BASELINE_SHA` to record its identity. Each build must settle independently.
The baseline is repeated separately to detect nondeterminism, and both repeated
baseline and current-versus-baseline comparisons require zero changed pixels
at DPR 1, 1.25, 1.5 and 2. No masking, tolerance or replacement golden is used.
Without `--baseline`, the suite verifies stable presentation, not cross-build
pixel equivalence. The routine CI command intentionally does not prohibit
future deliberate appearance changes by treating every PR base as a golden.

The 50,000-row fixture requires zero mutations over 200 unchanged paints and
checks identity, labels, selection, glyph changes, scrolling and accessibility.
Designer fixtures check read-before-write batching, nested anchor guides,
selective/full refresh and preserved form handles. Paired CPU observations are
same-session measurements, not a universal speed, GPU or native-VB6 claim.

## Source attribution

Application-specific implementation; no third-party code or fonts copied.
The read-before-write strategy follows Jeremy Wagner, Paul Lewis and Barry
Pollard's web.dev guidance on layout thrashing:
https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing

The originally supplied HN item, https://news.ycombinator.com/item?id=49963404,
was not available during the original investigation. Its author and advice are
not inferred, and this implementation is not attributed to that unknown text.

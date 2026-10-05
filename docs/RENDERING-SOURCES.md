# Rendering and HTML performance sources

These are references for design decisions, not imported implementations. The
changes in this repository are original application-specific code under its MIT
license; no third-party source snippets or font files were copied.

## Read/write batching and stable HTML nodes

Jeremy Wagner, Paul Lewis and Barry Pollard, **Avoid large, complex layouts and
layout thrashing**, web.dev, published March 20, 2015, updated May 7, 2025:
<https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing>.

The form designer measures selection rectangles before inserting overlays.
ToolList retains visible rows instead of recreating their DOM on every paint.
Control captions and native select options keep existing nodes while unchanged.
The canvas renderer batches style-cache invalidation with frame construction and
disconnects its MutationObserver in HTML-only mode. These changes apply the
article's read-before-write guidance; the article does not establish performance
numbers or visual compatibility for this application.

## WebGPU pixel coordinates and canvas texture lifetime

W3C GPU for the Web Community Group, **WebGPU**, editor's draft:
<https://gpuweb.github.io/gpuweb/#coordinate-systems> and
<https://gpuweb.github.io/gpuweb/#automatic-expiry-task-source>.

The two GPU painters clip at physical pixel centers. WebGPU readback is encoded
in the same command submission as its draw, using the same canvas texture before
its automatic expiry. Startup checks actual pixels, not just API availability.

## Headless GPU testing

Jason Mayes and François Beaufort, **Supercharge Web AI testing**, Chrome for
Developers, updated January 16, 2024:
<https://developer.chrome.com/blog/supercharge-web-ai-testing>.

GPU driver and compositor flags are confined to the test runner. The software
adapter mode is explicit and recorded in reports. Successful SwiftShader tests
are not evidence of physical-hardware speed or full native VB6 pixel parity.
The browser runner supports headed execution for presentation checks and a
normal, non-software-forced mode for hardware qualification.

## User-supplied Hacker News reference

Requested source: <https://news.ycombinator.com/item?id=49963404>.
The comment body and author were not retrievable during this implementation.
No statement or implementation is attributed to its author, and this document
does not claim that the specific HN recommendations have been implemented.
The independently verified references above are cited beside the code they
informed. The original HN URL is retained here for a subsequent verifiable review.

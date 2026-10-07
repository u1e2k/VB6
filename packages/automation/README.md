# @vb6/automation

Standalone trusted Automation registry, lifecycle, tagged VB values, bounded wire
codec and adapter for `@vb6/com-ole`. No DOM, IDE, registry lookup or native activation
is required. MIT licensed; ESM for Node 22+ and modern browsers.

The repository's `npm run package:com-ole` stages the complete static import closure
into the tarball. The source checkout entry intentionally points at the canonical
runtime implementation; distribute the produced tarball, not this directory alone.

Stable imports are the root API and `/values`, `/wire`, `/com`. `/internal/*` exists
only for the exact-version native companion to share the same classes rather than
shipping duplicate `VBArray`, `Cell`, `VBError` or registry identities. It is not a
version-stable application API.

Use `AutomationRegistry.register` with trusted factories, `registerActive` for
explicit existing-object access, and `registerMoniker` for exact case-sensitive
host-owned capability names. A session snapshots the registry. `session.close()`
waits for late acquisition cleanup and releases every adopted adapter. GetObject
never resolves unregistered file paths, URLs, scripts, COM classes or OS monikers.

`registerComClass(registry, progId, factory)` consumes one owned COM interface from
the factory. The bridge retains canonical `IUnknown` identity per VM session and
preserves tagged numeric values, typed array bounds, ByRef cells and enumeration.

## Common HTTP, XML and stream components

The root API also exports `CommonAutomation`, `HttpTransport`, `HttpRequest`,
`AdoStream`, `createCommonAutomationRegistry`, `xmlDocumentAdapter` and
`VirtualFileSystem`. These components use this package's canonical registry and
VB values, not a second object model. Supply a host HTTP transport and optional
virtual filesystem to the registry factory. Importing does not perform I/O.

MSXML XMLHTTP/ServerXMLHTTP and WinHTTP aliases support browser-compatible HTTP;
ADODB.Stream supports binary/text data, charset conversion and virtual files.
MSXML DOMDocument aliases provide XML parsing/editing, XPath and typed binary
values through opaque Automation nodes. XML activation requires a standards DOM:
browsers supply it, while Node hosts inject DOMParser/XMLSerializer through
`xmlEnvironment` (and XPath evaluation on the returned document).

The complete runtime installs these factories with its existing DataContext.
Shared HTTP cancellation, explicit host policy, CORS/CSP, omitted ambient cookies
and rejected redirects still apply. Native operating-system services and binary
COM activation are not implied. See `docs/COMMON-AUTOMATION.md` in the repository
for aliases, examples, saved data-definition integration and precise limits.

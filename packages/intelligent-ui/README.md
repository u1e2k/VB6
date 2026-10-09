# @vb6/intelligent-ui

A dependency-free, renderer-neutral streaming UI compiler and bounded reactive
runtime. The package does not import the VB6 IDE, its project model, its VM,
provider SDKs, or a UI framework. It includes a keyed DOM renderer, an optional
Worker client, and an app-side MCP Apps transport.

## Use the package

Build from the repository with `npm run build:intelligent-ui`, then
`npm run pack:intelligent-ui`. Install the resulting `.tgz` in another project,
or copy the package's `src` directory as native ES modules. The `dist` directory
contains a browser global bundle, Worker bundle, stylesheet, and MCP App HTML.
The included `examples/demo.html` uses these local files without a server.

```js
import {UISurface} from '@vb6/intelligent-ui';
import '@vb6/intelligent-ui/styles.css';

const surface = new UISurface(document.querySelector('#answer'), {
  onAction(action) {
    // Review the exact action and apply YOUR application's authorization.
    // Rendering a button is not permission to execute its proposed action.
    console.log(action);
  }
});
await surface.update(`
{@body const [seats, setSeats] = DIL.useState(8)}
<slider label="Seats" min={1} max={40} step={1}
  value={seats} onChange={v => setSeats(v)} />
<metric label="Monthly total" value={seats * 29} unit="USD" />
<button onClick={() => GenUI.issueNewTurn("Explain " + seats + " seats")}>Ask</button>
`);
// Later, including while generation is in progress:
await surface.update(nextSource, {partial: true, data: inspectedData});
// On unmount:
surface.dispose();
```

Supply `workerSource` with the **contents** of `dist/intelligent-ui-worker.js`
to move compilation and evaluation off the UI thread. It is a classic Blob
Worker; no dynamic imports, network, `eval`, or generated JavaScript are needed.
When Workers cannot be constructed or eight are already active, the same bounded
interpreter runs locally. A Worker that fails after construction or exceeds its
three-second watchdog is terminated; its actions are not replayed automatically.
The view retains its last rendered output and offers Restart.

## Language and data

The syntax is inspired by the public OpenUI analysis, **not a reproduction of
OpenAI's private DIL compiler or wire format**. Source is parsed into inert JSON
instructions. The expression language resembles a small JavaScript subset; it is
not evaluated by JavaScript's `eval` or `Function`.

Supported source includes text and basic Markdown; literal code fences;
whitelisted component tags; interpolations; `const` derived expressions;
`DIL.useState`; `DIL.useAppData()`; `if`/`else if`/`else`; and keyed `each` blocks.
Callbacks use expression-bodied arrows. Arrays, objects, arithmetic, conditions,
a limited set of collection/string methods, and explicitly listed `Math` functions
are available. `==` and `!=` intentionally use strict equality. Template literals,
JavaScript statements, imports, ambient globals and arbitrary methods are rejected.
Unknown components/properties and incomplete source have explicit diagnostics.

Call `catalogDescription()` for the authoritative component/property catalog.
It includes layout, typography, inputs, forms, tabs, details, metrics, paginated
sortable tables, SVG bar/line charts, links and reference affordances. The four
`VB6*` primitives have semantic DOM fallbacks in the standalone package; the IDE
supplies factories backed by its actual `BrowserControl` implementation.

`data` is caller-supplied, bounded JSON. Own-property access only is permitted.
Images do not initiate requests unless an embedder supplies an explicit
`allowResource(url) === true` policy. `AsyncImage`/`AsyncImageGroup` and entity or
citation references require a host resolver/factory; there is no built-in search,
image generation, or fabricated citation database. `AppBlock` is recognized and
kept inert: the default renderer never executes arbitrary HTML/JavaScript. A host
can supply an independently isolated renderer as a trusted factory. Do not mount
untrusted raw HTML in the host document or assume iframe CSP blocks self-navigation.

## Actions and state

`GenUI.issueNewTurn`, `copy`, `openUrl`, `callTool`, `updateContext`, and
`openEntityDetail` are available only during explicit event dispatch. They return
bounded action intents; the core performs **no** tool calls, project writes,
network requests, navigation or provider requests. `normalizeAction` checks the
intent before host handling. URLs must be HTTP(S) and cannot contain credentials.

State is keyed by lexical scope and declared name. Streaming prefixes preserve
already edited values; keyed loops preserve identity when reordered. A completed
source removes abandoned state. Failed evaluation retains the last good state and
view. Stale event versions are rejected. Snapshots contain only bounded local
state, not closures, credentials or host objects. Persistence is an embedder choice.

`StreamingCompiler` accepts prefixes/chunks and distinguishes program changes
from constant-only changes. Parsing is a bounded full-prefix pass, not an
incremental token parser. `UISurface` coalesces partial updates and `DOMRenderer`
applies keyed operations rather than replacing the complete subtree. Changed
Markdown/table/chart contents are regenerated inside their own component.

## Renderer-neutral integration

```js
import {UIRuntime, DOMRenderer, createCatalog} from '@vb6/intelligent-ui';
const catalog = createCatalog({Temperature: {value: 'number'}});
const runtime = new UIRuntime({catalog});
const renderer = new DOMRenderer(root, {
  factories: {
    Temperature: ({document}) => {
      const node = document.createElement('output');
      return {node, update: props => { node.textContent = props.value + ' °C'; }};
    }
  },
  onEvent: (id, args) => {
    const result = runtime.dispatch(id, args, runtime.version);
    renderer.apply(result.operations);
    reviewActions(result.actions);
  }
});
renderer.apply(runtime.update('<Temperature value={21} />').operations);
```

Trusted factories are application code, outside the model's capability boundary.
They own their DOM, resource policies and disposal. Pass the same `catalog` to
`UISurface` for custom components in both Worker and local modes.

## MCP

`McpUIService` owns bounded per-principal documents and exact inspected-tool
bindings. The embedding MCP server authenticates callers, validates tool schemas,
checks cancellation and permissions, and calls `service.run`. Never use model
arguments or `clientInfo` as an authenticated principal. The IDE adapter implements
these checks and invalidates bindings on a workspace reload.

The exported MCP App uses `ui://vb6/intelligent-ui`,
`text/html;profile=mcp-app`, `_meta.ui.resourceUri`, the `2026-01-26` lifecycle,
partial/final tool input, structured tool results, host theme updates, resize,
reviewed messages/context, links, host-proxied tools and teardown. Text/JSON tool
results remain usable when a client does not render Apps. The service does not
implement an MCP transport itself.

This package includes an **app-side client**, not a generic browser host for
third-party MCP Apps. Such a host must implement the MCP Apps sandbox proxy and
separate-origin requirements and enforce the declared CSP/permissions. The app
checks message source, supports an explicit host origin, bounds requests, and
rejects unsupported methods. Only inline/fullscreen availability is advertised;
downloads, picture-in-picture and arbitrary app-exposed tools are not implemented.

## Bounds and validation

Source: 100,000 characters (IDE MCP tool source: 32,000); nesting: 40;
rendered instruction nodes: 2,000; evaluation: 100,000 steps; collection length:
2,000; aggregate UI data, local state and rendered payload: bounded separately.
The DOM renderer also budgets composite table/chart/Markdown content; tables cap
visible cells and paginate. Custom factories must enforce their own limits.

Run `npm test` inside the packaged directory for the standalone smoke test.
Repository tests are `npm run test:intelligent-ui` and
`npm run test:intelligent-ui:browser`; see `docs/INTELLIGENT-UI.md` for integration
coverage and the distinction between real transport and opaque-document tests.

## References

Original implementation inspired by:
- https://www.openui.com/blog/how-chatgpt-intelligent-ui-works
- https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx
- https://github.com/modelcontextprotocol/ext-apps/blob/main/src/spec.types.ts

No OpenAI private source, OpenUI source, or external runtime dependency is bundled.

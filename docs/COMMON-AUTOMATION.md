# Common Automation and data-source integration

The browser runtime implements common COM-shaped HTTP, XML and stream objects as
portable JavaScript adapters. They run through the existing Automation session,
DataContext and virtual filesystem; they are not binary COM DLLs. The separately
installed Windows companion remains the path for real installed COM components.
See [COM/OLE](COM-OLE.md) for native consent and ownership, and
[data sources](DATA-SOURCES.md) for connections, commands and bound controls.

## Available object families

| Family | Implemented path |
| --- | --- |
| `Microsoft.XMLHTTP`, `MSXML2.XMLHTTP` | HTTP open/send/abort, headers, ready state, text/Byte-array/stream/XML response |
| `MSXML2.ServerXMLHTTP` | The HTTP path plus timeouts, waitForResponse and request URL option |
| `WinHttp.WinHttpRequest.5.1` | HTTP path, timeouts/wait and response/error event metadata |
| `MSXML2.DOMDocument` | Browser XML DOM, node identity/editing, XPath, namespaces, attributes, collections, parse errors and typed binary values |
| `MSXML2.FreeThreadedDOMDocument`, `Microsoft.XMLDOM` | Aliases of the portable document adapter, not a separate native threading model |
| `ADODB.Stream` | Text/binary stream, charset conversion, positions, copy, virtual files and read-only HTTP sources |

MSXML HTTP and document families accept the implemented `.3.0`, `.6.0` and `60`
aliases. The exported `COMMON_HTTP_CLASSES` and `COMMON_XML_CLASSES` enumerate exact
names. An explicitly supplied native `automation` registry takes precedence over
portable factories. Existing ADO/DAO/RDO, Dictionary and FileSystemObject paths
are retained; they are not replaced by the new HTTP implementation.

## Shared transport, lifecycle and hosting

A DataContext owns one HTTP transport used by its HTTP data providers and common
Automation objects. The usual VM and ApplicationHost `dataFetch` injection applies
to both paths. A host can supply `dataHttpAuthorize({url, method})`; returning false
denies the request before fetch. The policy can return a promise. Setting the host
option `commonAutomation: false` disables these portable factories without
removing DataEnvironment or separately granted native Automation.

The shared transport rejects redirects and opaque responses, omits ambient
cookies, bounds request/response data and propagates cancellation. Browser CORS,
CSP, mixed-content and network restrictions still apply. No proxy or policy bypass
is installed. Synchronous VB `send` waits for completion through the asynchronous
interpreter rather than blocking the browser thread. Asynchronous mode exposes
ready-state/events and explicit completion waiting where supported.

Closing DataContext or stopping the VM cancels pending common HTTP operations and
closes its Automation session. A late response cannot overwrite a replacement
request. A timeout does not trigger a retry: the server might already have acted.
Raw HTTP failures use VB errors; HTTP status errors remain visible through `status`.
JSON data providers additionally reject unsuccessful statuses before producing a
recordset. Runtime bearer credentials remain in the existing DataContext credential
path, not copied into common-object metadata or saved project definitions.

The reusable `@vb6/automation` root exports `CommonAutomation`, the registry factory,
HTTP transport/request classes, ADO stream class, XML document adapter and shared
`VirtualFileSystem`. Importing these APIs does not perform I/O. Example:

```js
import {
  HttpTransport, createCommonAutomationRegistry, VirtualFileSystem,
  automationInvoke, unbox
} from '@vb6/automation';

const transport = new HttpTransport({
  fetch: globalThis.fetch.bind(globalThis),
  authorize: ({url}) => new URL(url).origin === 'https://api.example.test'
});
const session = createCommonAutomationRegistry({
  transport, fs: new VirtualFileSystem()
}).createSession();
try {
  const request = await session.create('MSXML2.ServerXMLHTTP.6.0');
  await automationInvoke(request, 'open', 1, ['GET', 'https://api.example.test/data', false]);
  await automationInvoke(request, 'send', 1);
  console.log(unbox(await automationInvoke(request, 'responseText', 2)));
} finally {
  transport.cancel();
  await session.close();
  transport.close();
}
```

Use `RuntimeAPI.CommonAutomation` in the generated runtime. Standalone Node XML
activation needs injected standards `DOMParser` and `XMLSerializer` constructors
through `xmlEnvironment`; XPath also requires that DOM's `evaluate` implementation.
The package does not bundle a second DOM or require one merely to import it.

## HTTP and stream use in VB

```vb
Dim request As Object, stream As Object
Set request = CreateObject("MSXML2.ServerXMLHTTP.6.0")
request.setTimeouts 3000, 3000, 5000, 5000
request.Open "GET", "https://api.example.test/text", False
request.send
If request.status <> 200 Then Err.Raise vbObjectError + 1, , "HTTP request failed"

Set stream = CreateObject("ADODB.Stream")
stream.Type = adTypeBinary
stream.Open
stream.Write request.responseBody
stream.Position = 0
stream.Type = adTypeText
stream.Charset = "utf-8"
Debug.Print stream.ReadText
stream.SaveToFile "/download.txt", adSaveCreateOverWrite
stream.Close
```

`/download.txt` is a project virtual file, not a path on the host operating system.
Read/write, CopyTo, SetEOS, SkipLine, Flush, Close and charset changes use stream
state/access checks. CopyTo keeps an existing destination tail unless explicitly
truncated. Character sets include Unicode/UTF-16LE, UTF-16BE, UTF-8, Windows-1252,
ASCII and ISO-8859-1. Unsupported encodings are diagnosed. Byte-array responses use
the VM's typed array contract; text EOF remains Null instead of becoming a string.

## XML use

```vb
Dim document As Object, item As Object, bytes() As Byte
Set document = CreateObject("MSXML2.DOMDocument.6.0")
document.async = False
If Not document.loadXML("<items><item id='1'>First</item></items>") Then
    Err.Raise vbObjectError + 2, , document.parseError.reason
End If
Set item = document.selectSingleNode("//item[@id='1']")
Debug.Print item.text, item.ownerDocument Is document
item.setAttribute "selected", "true"
Set item = document.createElement("bytes")
item.dataType = "bin.base64"
item.text = "AAEC/w=="
bytes = item.nodeTypedValue
Debug.Print bytes(3)
```

Returned documents, nodes and collections are opaque Automation objects, not
exposed browser DOM references. Node identity, live child collections, snapshot
XPath selections, default Item access and For Each are preserved. Rebinding an
already initialized Object/Variant loop variable does not invoke its old object's
default setter. `responseXML` returns the same kind of document adapter. XML POST
bodies serialize the document rather than coercing a DOM reference into a string.

Load errors clear the document and populate parseError. Parser wording can differ
between browsers. Exact native line/column/file-position diagnostics are not
provided; unsupported location fields remain zero. DTDs and external entities are
rejected, and `resolveExternals = True` cannot enable them. No HTML insertion,
stylesheet execution, schema validation or arbitrary native moniker loading occurs.

## Saved service definitions and binding

The canonical public fields are connection `url` and command `text`. Existing
`baseUrl` and `path` aliases are accepted and normalized; contradictory aliases are
rejected. String parameter/field types such as `integer`, `string`, `boolean` and
`binary` normalize to ADO data types. In this data-definition vocabulary, `integer`
is ADO Integer / a VB Long, not the 16-bit VB Integer storage type.

Command-local `method`, `rowsPath`, `fields`, `pagination`, `query`, `body`,
`response` and `valueField` reach execution without modifying connection defaults.
Required parameters are checked before I/O. Requery and Clone retain the originating
command's request options. Root JSON scalar arrays become a one-column recordset
(`Value` by default); an empty array retains a usable empty schema. JSON objects
become records. Unsafe field paths, stored secrets and cross-origin command URLs
are rejected during definition normalization rather than failing later as a
misleading missing URL.

```vb
Dim ids As Object, story As Object
Set ids = DataEnvironment.GetTopStoryIds()
Do While Not ids.EOF
    Set story = DataEnvironment.GetStoryById(CLng(ids.Fields(0).Value))
    Debug.Print story.Fields("title").Value
    story.Close
    ids.MoveNext
Loop
ids.Close
```

The owning project must define those commands. They are ordinary DataEnvironment
commands, not special Hacker News API functions. Controls can bind to the stable
`rsCommandName` recordset before command execution, or to a DataEnvironment plus
DataMember. Re-execution updates that same recordset so bound DataGrid/TextBox
controls retain their subscriptions. No manual COM HTTP fallback is required.

## Validation and boundaries

Run `node --test tests/common-*.test.mjs tests/data-service-definitions.test.mjs`
and `node tools/test-com-ole-packages.mjs` for source and independently installed
package coverage. `python tools/browser-common-automation-tests.py` tests real
loopback HTTP, source/bundled runtimes, form binding and inline/modular exports;
set `VB6_BROWSER` to Chromium, Firefox or WebKit's lowercase name.
Windows tests `tools/interop/test-common-automation.mjs` and
`tools/interop/test-common-xml.mjs` exercise installed MSXML/WinHTTP classes in each
requested bitness. If ADODB.Stream activation is disabled by an ActiveX killbit,
the report labels its native stream oracle unavailable, sets native stream
conformance false and still requires actual HTTP comparison. It never bypasses the
killbit or counts identical activation failures as agreement.

These are implemented common workflows, not complete COM, ADO, MSXML or licensed
VB6 certification. XML input is bounded to 4 MiB, 10,000 parsed nodes and depth 128;
XPath/list snapshots to 10,000 nodes; shared Automation sessions to 128 adopted
objects. HTTP/stream bytes are bounded to 20 MiB, with a separate 1,000,000-element
VB Byte-array limit. Keep large data as streams rather than demanding larger arrays.
Native thread/apartment behavior, proxy/TLS/client certificates, Windows challenge
and integrated authentication, Record-bound/async stream opening, XSLT/schema/DTD,
and unsupported DOM interfaces require additional provider work. These JS services
do not silently add COM imports to freestanding native or compute executables.

## Primary API references

- [ADO Stream object](https://learn.microsoft.com/en-us/office/client-developer/access/desktop-database-reference/stream-object-ado)
- [ADO Stream Type](https://learn.microsoft.com/en-us/office/client-developer/access/desktop-database-reference/type-property-ado-stream)
- [MSXML documentation](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ms753751(v=vs.85))

The implementation and its tests define the supported portable boundary; official
native API descriptions are not evidence that every native behavior is implemented.

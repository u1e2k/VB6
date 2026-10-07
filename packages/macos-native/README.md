# VB6 native macOS compiler

Experimental VB6-to-Apple-Silicon compiler, native runtime and AppKit host. The shared VB6 parser and intermediate representation are lowered to C++17, then Apple Clang emits an arm64 Mach-O executable. The generated application does not embed JavaScript, Electron, a browser, Wine or MSVBVM60.DLL.

## Export from the IDE

Choose **File → Make Project.app (macOS Apple Silicon)…**. This is independent of Windows AOT, Microsoft VB6 runtime, VB.NET and HTML export.

**Download Source Build Kit** works without a Mac connection. Extract the ZIP on macOS and run `node build.mjs`. The kit contains generated native source, the runtime SDK and build scripts; it is not an executable.

**Build .app ZIP** uses an explicitly approved local Mac compiler. In a terminal on the Mac, with Node.js 22+ and Xcode Command Line Tools installed:

```sh
npm run macos:bridge -- --origin https://wieslawsoltes.github.io
# For the local development server instead:
npm run macos:bridge -- --origin http://127.0.0.1:8080
```

Use the exact origin of the IDE. Paste the printed bridge URL and session token into the dialog, then approve the individual build by typing `YES` in the terminal. A standalone `file:` IDE requires explicit `--allow-file-origin`, which permits opaque file origins rather than identifying one particular file. Prefer an exact HTTP(S) origin when available. Browser local-network restrictions may require using the locally served IDE or the source-kit path.

The token is not saved in the project or settings. Closing the dialog cancels the request; project changes prevent stale downloads. A visible **Save ZIP** link supports manual retry. Neither the bridge nor the IDE executes the generated application.

## Command-line and reusable package

From the repository:

```sh
node tools/build-macos-native.mjs
node tools/build-macos.mjs MyProject.vb6web --source-only --out ProjectSource
# On macOS with Xcode Command Line Tools:
node tools/build-macos.mjs MyProject.vbp --out NativeOutput
```

The source-only destination must be new. Executable builds produce a signed `.app`, `.app.zip` and JSON build report. Node.js is a build-time requirement, not an application dependency.

Build first, then package with `npm pack ./packages/macos-native`. The packed compiler is independently usable and has no repository-relative imports. This command does not publish it to npm.

```js
import {createMacOSBuildKit} from '@vb6-studio/macos-native';
import {buildMacOSProject} from '@vb6-studio/macos-native/node';
import {createMacOSBridge} from '@vb6-studio/macos-native/bridge';

const kit = createMacOSBuildKit(project, {
  name: 'MyApplication',
  bundleIdentifier: 'org.example.myapplication',
  minimumVersion: '11.0',
  optimization: 2
});
const report = await buildMacOSProject(project, {
  compiler: kit.options,
  out: '/path/to/native-output',
  jobs: 4
});
// createMacOSBridge requires an application-supplied authorization callback.
// Its default callback denies compilation. Never blindly approve untrusted input.
```

## Runtime and platform contracts

VB6 Integer/Boolean are 16-bit, Long is 32-bit, Currency is a scaled 64-bit value, and strings are counted UTF-16. These widths do not change with the LP64 host. Native objects use typed, generation-checked handles rather than truncated Cocoa pointers. File records are serialized explicitly instead of using host struct layout.

Project-defined `Implements` contracts support private method implementations, named and optional arguments, default/indexed properties, get/let/set, checked interface casts and ByRef aliases. Canonical object identity is retained across interface views; their reverse cache is weak. These are source-level VB contracts, not a Windows COM ABI.

The local compiler resolves Apple Clang through the installed Xcode SDK. It stages source privately, invokes tools without shell interpolation, caches runtime objects by source/toolchain, verifies the arm64 image and code signature, and preserves executable modes and original signed ZIP bytes. The browser checks archive structure and hashes, not the cryptographic code signature.

Default signing is ad-hoc. **Ad-hoc signing is not notarization, Gatekeeper approval or Developer ID signing.** Configure a signing identity on the trusted local builder, never through project data. Distribution requires the developer's own signing and notarization process. Native programs are not sandboxed by this compiler.

## Validation and remaining boundaries

`npm run test:macos` tests compiler contracts, archive validation, bridge denial/cancellation, offline package extraction and cross-platform source determinism. `npm run test:macos:browser` tests IDE downloads, cancellation and stale-project protection over HTTP and file origins.

`node tools/test-macos-native.mjs` executes sanitized native values, generated programs, interface dispatch and view-lifetime tests. On Apple Silicon it additionally compiles, signs and executes the native app; creates 33 AppKit control types with selected event/API assertions; verifies a real bridge download; and checks runtime-cache reuse and durable reusable-API output. Linux execution and synthetic browser protocol fixtures are never labelled as macOS acceptance.

This backend does **not** certify full VB6 semantics or universal Win32 compatibility. Windows DLL/OCX binaries and arbitrary COM objects are not loaded. Full `Class_Terminate` semantics, design-time FRX/resource fidelity, all control members/events, locale behavior, native database/COM integration and GUI visual parity remain unfinished or unqualified. Unknown native declarations produce diagnostics; a successful compilation alone is not proof that every runtime path is supported.

See [the repository export guide](../../docs/MACOS-EXPORT.md) for architecture, security, verification and compatibility details.

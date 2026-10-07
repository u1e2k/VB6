# VB6 native macOS compiler

Experimental native C++17/Apple Clang backend for Apple Silicon. Uses the shared VB6 parser and IR and an independent C++ runtime with Objective-C++ AppKit controls. The generated application does not embed JavaScript, Electron, a browser, Wine or MSVBVM60.DLL.

## Build and use

From the repository:

```sh
node tools/build-macos-native.mjs
node tools/build-macos.mjs MyProject.vb6web --source-only --out ProjectSource
# On macOS with Xcode Command Line Tools:
node tools/build-macos.mjs MyProject.vbp --out NativeOutput
```

The source-only destination must be new. Executable builds produce a signed `.app`, `.app.zip` and JSON build report. No generated application is executed by the exporter. Node.js 22+ is required to compile; the finished application uses native system frameworks.

Package with `npm pack ./packages/macos-native` after building. The packed compiler is independently usable; it does not import repository-relative files. It is not automatically published to npm.

```js
import {createMacOSBuildKit} from '@vb6-studio/macos-native';
import {buildMacOSProject} from '@vb6-studio/macos-native/node';
const kit = createMacOSBuildKit(project, {optimization: 2});
const report = await buildMacOSProject(project, {out: '/path/to/new-output'});
```

## Contracts

VB6 Integer, Boolean, Long and Currency retain classic widths on the LP64 host. Native objects use generation-checked handles, not truncated pointers. Native source and resources are staged in a private directory. Apple Clang is resolved through the installed Xcode SDK; tool arguments are not shell-interpolated. The runtime cache is keyed by source and toolchain. The resulting Mach-O architecture, segment protections, system-library dependencies and code signature are checked before publication.

Default signing is ad-hoc. A verified ad-hoc signature is **not** notarization, Gatekeeper approval, or Developer ID signing. Distribution requires the developer's own signing identity and notarization process. No credentials are read or uploaded by this package.

## Validation and boundaries

`node tools/test-macos-native.mjs` compiles and executes sanitized value and generated-program tests. On Apple Silicon it additionally builds/runs the signed application and actual AppKit controls/events/API tests. A Linux pass is never recorded as macOS acceptance.

This backend does not certify full VB6 semantics or universal Win32 compatibility. Windows DLL/OCX binaries and arbitrary COM objects are not loaded. Supported Declare calls are source-level adapters and unsupported declarations fail with diagnostics. Full Class_Terminate lifetime semantics, Implements interface dispatch, design-time FRX/resource fidelity, all control members/events, locale behavior, native database/COM integration, and GUI visual parity still require further implementation and conformance evidence. Do not deploy an unqualified migration solely because it compiles.

# Windows executable targets

There are three **different** Windows targets. The compiler/linker, build pipelines and modern host are maintained in JavaScript. The new [freestanding AOT target](WIN32-AOT.md) closes the no-extraction boundary for its supported typed subset; it is not full VB6 or a WebGPU renderer. Neither target is a new JavaScript implementation of the Windows kernel, Microsoft compiler, Chromium, or Direct3D.

| Target | Output | Runtime | Graphics |
| --- | --- | --- | --- |
| Freestanding AOT | One PE32/x86 EXE; no extraction | Windows system DLLs; no bundled engine or VB6 runtime | Native controls and GDI; experimental typed subset |
| Modern portable | One distributed Windows `.exe`, x64 or ARM64 | Embedded Electron/Chromium/Node; extracts private runtime files on launch | WebGPU primitives; DOM controls/text; explicit Canvas2D fallback option |
| Classic VB6 | Genuine PE32/x86 `.exe` from a licensed local VB6 compiler | External `MSVBVM60.DLL` and the application's dependencies | Original VB6 controls and graphics, not WebGPU |

**Electron target is not a no-extraction implementation:** Electron's portable target is a self-extracting executable, not a statically linked, entirely memory-resident single-image binary. It needs no separately installed browser, Node, WebView2, or Electron, but writes temporary runtime files and persistent user data. `--no-extract` is rejected instead of claiming this property. Windows UI/graphics binaries in the bundled platform are native code; the project-specific host, adapters and build tools are JavaScript.

## Modern portable builds

From the repository root, with Node.js 22 or later:

```sh
npm --prefix desktop ci
npm run build:windows
npm run build:windows -- --project examples/calculator.vb6web --out release/calculator
npm run build:windows -- --project MyApp.vbp --source-root . --graphics auto
npm run build:windows -- --arch arm64 --out release/windows-arm64
```

The build defaults to `--graphics webgpu`: startup displays an actionable error when no compatible adapter is available. Use `--graphics auto` to allow Canvas2D, or `--graphics canvas2d` explicitly. Hardware support is not guaranteed by packaging. WebGPU accelerates the existing graphics surface; this is not an all-GPU rewrite of controls, text, images or the IDE. Production builds do not override driver blocklists or disable Chromium sandboxing.

`.vb6web`, `.vb6proj`, JSON and Standard EXE `.vbp` inputs are supported. A VBP is imported through the existing browser compiler and therefore retains that compiler's compatibility boundaries. Use the classic target for original compiler semantics. `--source-root` makes the permitted source tree explicit; symlink traversal is not used. `--stage-only` creates the complete staged app without requiring Electron build tools. `--dir` is a developer-only unpacked build, **not** the single-file deliverable.

Each portable build writes the EXE, SHA-256 sums and JSON build evidence. The NSIS launcher may be x86 even for an x64/ARM64 payload; the build report distinguishes those architectures. Official Electron runtime and electron-builder versions are pinned in `desktop/package.json`. Production signing requires the developer's own Windows signing identity; the CI artifacts are unsigned development builds.

### Native windowing

Exported application top-level forms use real Electron `BrowserWindow` windows (Win32 HWNDs on Windows), retaining one JavaScript VM and the same live control DOM rather than copying form state to separate VMs. Implemented integration includes independent windows, caption changes, geometry in VB twips, show/hide, minimize/maximize/restore, focus events, resizing, modal disabling/restoration, native popup menus, native message/file dialogs, input dialogs, close cancellation through `QueryUnload`, and form reuse after unload. The host exposes validated window commands, including fullscreen and always-on-top, through a context-isolated preload. MDI children remain inside their native MDI parent; they are not native Win32 MDI child HWNDs. Arbitrary Win32 `Declare`, HWND control compatibility, OLE and ActiveX hosting are not provided by this modern target.

The IDE itself is packaged as a native window. Its debugger preview retains the existing sandboxed iframe and uses a document-specific CSP with script hashes; that iframe cannot access the native bridge. The existing live-DOM detachment host now uses reserved native desktop windows for tool groups, documents and modeless tools. Properties/code detachment, original editor identity, OS-close restoration, MDI-only restoration and direct child-IPC rejection are tested on x64 and ARM64. This is not a claim of pixel-exact native IDE parity. Application execution through exported EXEs uses the native form adapter described above.

Only manifest-listed assets are served over the secure local `vb6://app` protocol, with integrity checks, blocked remote navigation/network requests, sandboxed renderers, no renderer Node integration, and a main-frame-only IPC bridge. Native file access occurs through explicit open/save dialogs. Project code must still be treated as untrusted input to the language runtime.

## Classic VB6 runtime builds

This target uses a **separately installed, licensed Microsoft VB6 compiler** to make an x86 executable that uses the existing `MSVBVM60.DLL` runtime. It does not route code through the browser parser or the freestanding AOT compiler, and it does not rename a browser bundle to `.exe`. Installing the runtime alone does not provide a source compiler.

The build machine needs Windows, Node.js 22 or later, the licensed VB6 toolchain, and the project's registered 32-bit development dependencies. The resulting application needs Windows, the VB6 runtime and its application dependencies; it does **not** need Node, Electron or this repository. No Microsoft compiler, runtime DLL, OCX, license or third-party component is downloaded, bundled or registered by these tools.

### Build from the IDE

Choose **File > Make Project1.exe (Microsoft VB6 Runtime)…** (using your project name). The existing **Win32 AOT** command remains independent. Choose **Preserve project setting**, **Microsoft native code**, or **Microsoft P-code**; both Microsoft modes use the VB6 runtime.

For direct EXE download, run the IDE and compiler bridge on the **same Windows machine**. From the repository root, open an interactive terminal and start the bridge with the exact IDE origin and your installed compiler:

```powershell
npm run classic:bridge -- --origin http://127.0.0.1:8080 --compiler "C:\Program Files (x86)\Microsoft Visual Studio\VB98\VB6.EXE"
```

Use `npm run serve` in another terminal to serve the built IDE at that origin. The compiler can also be configured through `VB6_COMPILER`; otherwise the bridge checks the conventional VB98 installation directory. An origin is the scheme, host and port only: `localhost` and `127.0.0.1`, or different ports, are different origins. Use the origin printed in the export dialog for a differently hosted IDE.

Paste the bridge's printed token into the dialog, leave the bridge URL at `http://127.0.0.1:8768/classic` unless using `--port`, and click **Build EXE**. Review the project name, mode and native references in the Windows terminal, then type `YES` to approve this build. The IDE downloads the verified EXE. A compiler error leaves the dialog open with bounded compiler diagnostics. **Cancel** aborts a pending approval/build and prevents a late download. Changing the project during a build also prevents downloading a stale result.

Tokens exist only for the current connection/dialog and are cleared on cancellation or completion; they are not saved into projects or build reports. Requests cannot select compiler paths, output paths, shell commands or process arguments. The bridge accepts only loopback connections, validates `Host` and exact allowed `Origin`, and requires the token. It allows one approval/build at a time. It never executes the resulting EXE.

The bridge is **not a compiler sandbox**. VB6 may load registered native designers, COM servers, add-ins or OCX components while compiling. Approve trusted projects only. File-origin IDEs require the explicit bridge option `--allow-file-origin`; this admits the opaque `null` origin, which cannot uniquely identify one local file. Prefer a served HTTP/HTTPS IDE and an exact origin. Browser local-network restrictions may still require permission; no browser security setting is disabled by this tool.

### Build without a connected compiler

In the same dialog choose **Download Build Archive**. The ZIP contains native source/resource files, `classic-build.json`, a README and a standalone `build.mjs`. It is a **source build archive, not an executable**; its manifest records `compiled: false`. Extract it on the Windows build machine and run:

```powershell
node build.mjs --compiler "C:\Program Files (x86)\Microsoft Visual Studio\VB98\VB6.EXE"
```

The extracted driver needs no npm installation or repository checkout. It also accepts `VB6_COMPILER` and `--timeout`. Alternatively, open the included `source/<project>.vbp` directly in Microsoft VB6. The selected code-generation mode is already recorded in the staged VBP. Each script invocation compiles in a fresh temporary directory and publishes to a new `release/build-*` directory with the EXE, SHA-256 and build report; old output cannot masquerade as a successful new build.

### CLI and source compatibility

```powershell
$env:VB6_COMPILER = 'C:\Program Files (x86)\Microsoft Visual Studio\VB98\VB6.EXE'
npm run build:classic -- --project examples/classic/HelloRuntime.vbp --codegen native --out release/classic-native
npm run build:classic -- --project examples/classic/HelloRuntime.vbp --codegen pcode --out release/classic-pcode
npm run build:classic -- --project MyApp.vbp --source-root C:\Sources --encoding windows-1250 --out release/myapp
npm run build:classic -- --project examples/calculator.vb6web --stage-only
npm run build:classic -- --inspect C:\Apps\ExistingVB6App.exe
```

`--codegen preserve` is the default. Native/P-code overrides, the output filename/directory and automatic version increment are changed in the **staged VBP only**. Original project state is not edited. Raw `.vbp` builds preserve the original source bytes, relative paths, designers and references. `--source-root` bounds permitted source paths; symlink traversal is rejected. `--encoding` defaults to `windows-1252` for raw VBP input and must match its actual ANSI encoding.

Browser-project CLI builds, IDE builds, bridge requests and build archives share `prepareClassicProject`. Imported project encoding and unmodified native source/hidden attributes and opaque FRX/RES data are retained by the native source exporter. New modules inherit the imported project's ANSI encoding. The staged VBP is configured without re-encoding unknown record bytes; its line endings are normalized to CRLF. Missing referenced compiler source or resource files, escaping paths, Unicode/BOM source and mixed non-ASCII code pages are diagnosed before compilation. The build machine's Windows ANSI code page must match the project's recorded encoding; the tools do not transliterate text or change Windows locale settings.

New browser-authored intrinsic controls are lowered to native designer records rather than emitting generic editor-only defaults as properties of every control. Imported native control/designer records retain their existing representation. The Microsoft compiler and the installed native components remain authoritative for source and designer compatibility.

Standard EXE and ActiveX EXE projects are accepted. Select a single native project rather than a project group; ActiveX DLL/OCX outputs are not EXE targets. Native COM/type-library/OCX references require the original registered 32-bit components. A portable browser OCX adapter or JSON property bag is not a native binary or persistence stream. Browser-only anchoring/auto-layout and portable data-source definitions are rejected rather than silently dropped; use explicit classic resize/data code or the browser/modern target. Browser themes do not replace native Windows appearance, and browser virtual-filesystem files must be deployed separately when needed.

All compiler drivers invoke `/make`, `/out` and `/outdir` without a shell, use fresh output, enforce a timeout and verify a PE32/x86 executable importing `MSVBVM60.DLL`. The IDE also verifies the response SHA-256 before download. A zero exit code without a fresh valid EXE fails. CLI destination EXEs are not overwritten; use a fresh output directory. `--stage-only` works without Windows or a compiler and explicitly reports `compiled: false`. The bridge limits project requests to 20 MiB and executable responses to 64 MiB.

`--inspect` reads metadata without executing an EXE. PE/import/hash checks are structural and transport-integrity checks, **not** proof of publisher authenticity, safe execution or a complete dependency audit. Static imports do not reveal late-bound COM, dynamic library loads or all OCX dependencies. Existing EXEs execute on Windows with their original runtime/dependencies; they do not execute inside the browser VM.

Microsoft lists the base 32-bit VB6 runtime, including `MSVBVM60.DLL`, as shipping in supported Windows versions. Additional controls/libraries and localization files may require deployment and appropriate rights; see Microsoft's support statement below. A single application EXE can still depend on installed components and is not described as a self-contained embedded-runtime EXE.

## Validation

`npm test` runs the full Node suite. `npm run test:classic` selects the classic source, CLI, PE, bridge, encoding, cancellation and compiler-output contracts. The compiler-output fixtures are explicitly synthetic; they are not runnable Microsoft-compiled programs or evidence that the licensed compiler ran.

`npm run test:classic:browser` checks the standalone IDE's separate AOT/runtime commands, compilation-mode selection, exact binary downloads, bounded errors, token cleanup, cancellation and late-download prevention. The existing read-only **Validate** workflow runs these UI checks in Chromium, Firefox and WebKit with HTTP-origin/browser WebCrypto behavior and runs the classic host contracts on Windows. The other existing Validate jobs retain their native AOT execution, COM/OLE, Windows system, Electron-host, layout, theme and application-export checks. No dedicated licensed-VB6 workflow is currently configured.

For an owner-run licensed compiler check on a trusted Windows build machine, use a fresh output directory:

```powershell
npm run verify:classic -- --project examples/classic/HelloRuntime.vbp --out C:\VB6Validation\hello-runtime --compiler "C:\Program Files (x86)\Microsoft Visual Studio\VB98\VB6.EXE" --compile --allow-native-code --ide-smoke
```

This verifies byte-preserving import/export, compiles original and round-tripped copies in both code-generation modes and records fresh executable evidence. The optional `--ide-smoke` runs only the unmodified self-terminating HelloRuntime fixture through the licensed IDE and verifies its marker; it does not execute arbitrary exported programs. Omitting compilation records `compilerStatus: not-run`, not success. Real application deployment, registered third-party dependencies and original-VB6 behavior still need the project's Windows acceptance tests. Neither synthetic tests nor a missing licensed toolchain are universal compatibility certification.

## Upstream references

- Electron native windows: https://www.electronjs.org/docs/latest/api/window-open
- Electron security guidance: https://www.electronjs.org/docs/latest/tutorial/security
- electron-builder portable target: https://www.electron.build/nsis/
- Microsoft VB6 runtime support statement: https://learn.microsoft.com/en-us/previous-versions/visualstudio/visual-basic-6/visual-basic-6-support-policy
- VB6 command-line build task documentation: https://nantcontrib.sourceforge.net/release/0.85/help/tasks/vb6.html

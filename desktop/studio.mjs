import {createNativeWindowTransport} from './window-transport.mjs';
import {createNativeRuntimeDocumentLoader} from './runtime-document.mjs';
import {loadRuntimeDocument} from '../src/ide/runtime-document.js';

/** F5 and design Immediate share the host-approved document loader. Preserve
 * the earlier embedding hook as an adapter, not a second navigation policy.
 * Native URL validation, frame/session identity, CSP and sandboxing remain
 * enforced before navigation; never create a transient srcdoc document.
 * https://www.electronjs.org/docs/latest/tutorial/security
 * https://html.spec.whatwg.org/multipage/iframe-embed-object.html#the-iframe-element
 */
export function installNativePreview(studio, bridge) {
  studio.runtimeDocumentLoader = createNativeRuntimeDocumentLoader(bridge);
  studio.loadRuntimeDocument = (frame, html) => {
    const token = studio.bridgeToken;
    return loadRuntimeDocument(studio, frame, html, {
      isCurrent: () => studio.runtimeFrame === frame && studio.bridgeToken === token,
      onError: error => { studio.stop(); studio.status('Native preview failed: ' + error.message); }
    });
  };
}
const studio = globalThis.vb6Studio;
if (studio) {
  studio.browserWindows.transport = createNativeWindowTransport(globalThis,globalThis.vb6Native,error=>studio.status('Native tool window: '+error.message));
  installNativePreview(studio, globalThis.vb6Native);
}

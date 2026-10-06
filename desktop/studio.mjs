import {createNativeWindowTransport} from './window-transport.mjs';

/** Select the preview transport before navigation begins. Creating srcdoc and
 * removing it after run() returns schedules a competing about:blank navigation
 * and briefly subjects the inline document to the controller's strict CSP.
 * https://html.spec.whatwg.org/multipage/iframe-embed-object.html#the-iframe-element
 * The frame keeps its existing sandbox; no native bridge enters the preview.
 */
export function installNativePreview(studio, bridge) {
  studio.loadRuntimeDocument = async (frame, html) => {
    const current = () => studio.runtimeFrame === frame && frame.isConnected;
    try {
      const url = await bridge.runtimeDocument(html);
      if (current()) frame.src = url;
    } catch (error) {
      // A delayed rejection from an ended run must not stop its replacement.
      if (current()) { studio.stop(); studio.status('Native preview failed: ' + error.message); }
    }
  };
}
const studio = globalThis.vb6Studio;
if (studio) {
  studio.browserWindows.transport = createNativeWindowTransport(globalThis,globalThis.vb6Native,error=>studio.status('Native tool window: '+error.message));
  installNativePreview(studio, globalThis.vb6Native);
}

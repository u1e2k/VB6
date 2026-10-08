import {macOSBridgeURL, normalizeMacOSBuildRequest, MACOS_LIMITS, MACOS_PROTOCOL} from './protocol.js';
import {verifyMacOSAppArchive} from './archive.js';
// Observe late results/rejections without letting a transport which ignores AbortSignal
// retain the IDE's export session. Disposal is best-effort and never holds cancellation.
function discardBody(body, reason) {
  if (!body) return;
  try {Promise.resolve(body.cancel(reason)).catch(() => {});} catch {}
}
function abortable(signal, operation, discardLate) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {reject(signal.reason); return;}
    let settled = false;
    const finish = (complete, value) => {
      if (settled) return;
      settled = true; signal.removeEventListener('abort', stop); complete(value);
    };
    const stop = () => finish(reject, signal.reason);
    signal.addEventListener('abort', stop, {once: true});
    try {
      Promise.resolve(operation()).then(value => {
        if (settled) {try {discardLate?.(value);} catch {} return;}
        finish(resolve, value);
      }, error => finish(reject, error));
    } catch (error) {finish(reject, error);}
  });
}
async function limitedResponse(response, maximum, signal) {
  const advertised = response.headers.get('content-length');
  if (advertised !== null && (!/^\d+$/.test(advertised) || Number(advertised) > maximum)) {
    const error = new Error('Compiler response exceeds the size limit.');
    discardBody(response.body, error); throw error;
  }
  const reader = response.body?.getReader(); if (!reader) throw new Error('Compiler returned no response body.');
  let size = 0, completed = false; const chunks = [];
  try {
    for (;;) {
      const item = await abortable(signal, () => reader.read());
      if (item.done) {completed = true; break;}
      if (!(item.value instanceof Uint8Array)) throw new TypeError('Compiler response must contain byte chunks.');
      size += item.value.length;
      if (size > maximum) throw new Error('Compiler response exceeds the size limit.');
      if (item.value.length) chunks.push(item.value);
    }
    signal.throwIfAborted();
    if (advertised !== null && Number(advertised) !== size) throw new Error('Compiler response body length does not match Content-Length.');
  } finally {
    if (!completed) {
      try {Promise.resolve(reader.cancel(signal.reason)).catch(() => {});} catch {}
    }
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) {bytes.set(chunk, at); at += chunk.length;}
  return bytes;
}
/** A single explicit loopback session. Tokens never enter project or persisted state. */
export class MacOSCompilerClient {
  #url; #token; #connection; #capabilities; #fetch;
  constructor(fetcher = globalThis.fetch?.bind(globalThis)) {this.#fetch = fetcher;}
  get connected() {return !!this.#capabilities;}
  disconnect() {this.#connection?.abort(); this.#connection = null; this.#url = this.#token = this.#capabilities = null;}
  async #request(body, {signal, binary = false, timeout = 15000} = {}) {
    const connection = this.#connection, url = this.#url, token = this.#token;
    if (!connection || !this.#fetch) throw new Error('Connect to the local macOS compiler first.');
    const deadline = new AbortController();
    const requestSignal = AbortSignal.any([connection.signal, deadline.signal, ...(signal ? [signal] : [])]);
    // A referenced, explicitly disposed timer also bounds an injected transport
    // with no event-loop handles. Successful or cancelled operations clear it.
    const timer = setTimeout(() => deadline.abort(new DOMException('Native compiler request timed out.', 'TimeoutError')), timeout);
    try {
      const response = await abortable(requestSignal, () => this.#fetch(url, {
        method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token},
        body: JSON.stringify(body), credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal: requestSignal
      }), late => discardBody(late.body, requestSignal.reason));
      if (connection !== this.#connection) {discardBody(response.body); throw new Error('Compiler connection changed.');}
      const type = response.headers.get('content-type') || '', isArchive = binary && response.ok && /^application\/zip(?:;|$)/i.test(type);
      const bytes = await limitedResponse(response, isArchive ? MACOS_LIMITS.archiveBytes : 128 * 1024, requestSignal);
      requestSignal.throwIfAborted();
      if (connection !== this.#connection) throw new Error('Compiler connection changed.');
      if (isArchive) return {bytes, headers: response.headers};
      if (!/^application\/json(?:;|$)/i.test(type)) throw new Error('Invalid compiler response type.');
      const value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
      if (!response.ok || value.error) {
        const info = value.error || {}, error = new Error(info.message || 'Native build request failed (' + response.status + ').');
        error.compilerLog = String(info.compilerLog || '').slice(0, 65536); error.diagnostics = Array.isArray(info.diagnostics) ? info.diagnostics : []; throw error;
      }
      if (binary) throw new Error('Compiler did not return a native application archive.');
      return value.result;
    } finally {clearTimeout(timer);}
  }
  async connect(endpoint, token, {signal} = {}) {
    this.disconnect(); const url = macOSBridgeURL(endpoint);
    if (typeof token !== 'string' || !/^[\x21-\x7e]{32,512}$/.test(token)) throw new Error('Paste the compiler token printed in the macOS terminal.');
    this.#url = url; this.#token = token; this.#connection = new AbortController(); const connection = this.#connection;
    try {
      const caps = await this.#request({method: 'capabilities'}, {signal});
      if (caps?.version !== MACOS_PROTOCOL || caps.target !== 'macos-arm64' || caps.arch !== 'arm64' || caps.runtime !== 'AppKit') throw new Error('Incompatible macOS compiler bridge.');
      if (caps.available !== true) throw new Error(caps.reason || 'The macOS compiler is unavailable.');
      if (!Number.isInteger(caps.timeout) || caps.timeout < 1000 || caps.timeout > 1800000) throw new Error('Invalid compiler timeout contract.');
      this.#capabilities = Object.freeze({...caps}); return this.#capabilities;
    } catch (error) {if (connection === this.#connection) this.disconnect(); throw error;}
  }
  async build(project, options = {}, {signal} = {}) {
    if (!this.connected) throw new Error('Connect to the local macOS compiler first.');
    const request = normalizeMacOSBuildRequest({method: 'build', project, options}), connection = this.#connection;
    const response = await this.#request({method: 'build', ...request}, {signal, binary: true, timeout: this.#capabilities.timeout + 75000});
    if (response.headers.get('x-vb6-target') !== 'macos-arm64') throw new Error('Compiler returned the wrong target.');
    const verificationSignal = AbortSignal.any([connection.signal, ...(signal ? [signal] : [])]);
    const report = await abortable(verificationSignal, () => verifyMacOSAppArchive(response.bytes, request.options));
    if (report.sha256 !== response.headers.get('x-vb6-sha256') || report.executableSha256 !== response.headers.get('x-vb6-executable-sha256')) throw new Error('Native application SHA-256 verification failed.');
    signal?.throwIfAborted(); connection.signal.throwIfAborted(); if (connection !== this.#connection) throw new Error('Compiler connection changed.');
    return {bytes: response.bytes, report};
  }
}

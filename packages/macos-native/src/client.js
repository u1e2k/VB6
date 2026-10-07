import {macOSBridgeURL, normalizeMacOSBuildRequest, MACOS_LIMITS, MACOS_PROTOCOL} from './protocol.js';
import {verifyMacOSAppArchive} from './archive.js';
async function limitedResponse(response, maximum) {
  const advertised = response.headers.get('content-length');
  if (advertised !== null && (!/^\d+$/.test(advertised) || Number(advertised) > maximum)) {await response.body?.cancel(); throw new Error('Compiler response exceeds the size limit.');}
  const reader = response.body?.getReader(); if (!reader) throw new Error('Compiler returned no response body.');
  let size = 0; const chunks = [];
  try {
    for (;;) {const item = await reader.read(); if (item.done) break; size += item.value.length;
      if (size > maximum) {await reader.cancel(); throw new Error('Compiler response exceeds the size limit.');} chunks.push(item.value);}
  } finally {reader.releaseLock();}
  const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) {bytes.set(chunk, at); at += chunk.length;} return bytes;
}
/** A single explicit loopback session. Tokens never enter project or persisted state. */
export class MacOSCompilerClient {
  #url; #token; #connection; #capabilities; #fetch;
  constructor(fetcher = globalThis.fetch?.bind(globalThis)) {this.#fetch = fetcher;}
  get connected() {return !!this.#capabilities;}
  disconnect() {this.#connection?.abort(); this.#connection = null; this.#url = this.#token = this.#capabilities = null;}
  async #request(body, {signal, binary = false, timeout = 15000} = {}) {
    const connection = this.#connection;
    if (!connection || !this.#fetch) throw new Error('Connect to the local macOS compiler first.');
    const response = await this.#fetch(this.#url, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + this.#token},
      body: JSON.stringify(body), credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
      signal: AbortSignal.any([connection.signal, AbortSignal.timeout(timeout), ...(signal ? [signal] : [])])});
    if (connection !== this.#connection) throw new Error('Compiler connection changed.');
    const type = response.headers.get('content-type') || '', isArchive = binary && response.ok && /^application\/zip(?:;|$)/i.test(type);
    const bytes = await limitedResponse(response, isArchive ? MACOS_LIMITS.archiveBytes : 128 * 1024);
    connection.signal.throwIfAborted(); signal?.throwIfAborted();
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
    const report = await verifyMacOSAppArchive(response.bytes, request.options);
    if (report.sha256 !== response.headers.get('x-vb6-sha256') || report.executableSha256 !== response.headers.get('x-vb6-executable-sha256')) throw new Error('Native application SHA-256 verification failed.');
    signal?.throwIfAborted(); connection.signal.throwIfAborted(); if (connection !== this.#connection) throw new Error('Compiler connection changed.');
    return {bytes: response.bytes, report};
  }
}

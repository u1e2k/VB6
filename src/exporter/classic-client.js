import {classicBridgeURL, CLASSIC_PROTOCOL, CLASSIC_TARGET, CLASSIC_LIMITS} from './classic-options.js';
import {prepareClassicProject} from './classic-project.js';
import {verifyClassicExecutable} from './pe.js';

async function readLimited(response, limit) {
  const length = Number(response.headers.get('content-length'));
  if (length > limit) {await response.body?.cancel(); throw new Error('Compiler response exceeds the size limit.');}
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Compiler returned no response body.');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) {await reader.cancel(); throw new Error('Compiler response exceeds the size limit.');}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) {bytes.set(chunk, at); at += chunk.length;}
  return bytes;
}
/** Explicitly connected, ephemeral compiler authority. Never serialize this client. */
export class ClassicCompilerClient {
  #url; #token; #controller; #capabilities; #fetch;
  constructor(fetcher = globalThis.fetch?.bind(globalThis)) {this.#fetch = fetcher;}
  disconnect() {this.#controller?.abort(); this.#controller = null; this.#token = null; this.#url = null; this.#capabilities = null;}
  get connected() {return !!this.#capabilities;}
  async #request(body, {signal, binary = false, timeout = 15000} = {}) {
    const connection = this.#controller;
    if (!connection || !this.#fetch) throw new Error('Connect to the local Windows compiler first.');
    const response = await this.#fetch(this.#url, {method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + this.#token}, body: JSON.stringify(body),
      credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
      signal: AbortSignal.any([connection.signal, AbortSignal.timeout(timeout), ...(signal ? [signal] : [])])});
    if (connection !== this.#controller) throw new Error('Compiler connection changed.');
    const contentType = response.headers.get('content-type') || '';
    const executable = binary && response.ok && /^application\/vnd\.microsoft\.portable-executable(?:;|$)/i.test(contentType);
    const bytes = await readLimited(response, executable ? CLASSIC_LIMITS.executableBytes : 128 * 1024);
    connection.signal.throwIfAborted(); signal?.throwIfAborted();
    if (connection !== this.#controller) throw new Error('Compiler connection changed.');
    if (executable) return {bytes, headers: response.headers};
    if (!/^application\/json(?:;|$)/i.test(contentType)) throw new Error('Invalid compiler response type.');
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!response.ok || value.error) {
      const data = value.error || {}, error = new Error(data.message || 'Compiler request failed (' + response.status + ').');
      error.compilerLog = String(data.compilerLog || '').slice(0, 65536);
      error.diagnostics = Array.isArray(data.diagnostics) ? data.diagnostics : [];
      throw error;
    }
    if (binary) throw new Error('Compiler did not return an executable.');
    return value.result;
  }
  async connect(endpoint, token, {signal} = {}) {
    this.disconnect();
    const url = classicBridgeURL(endpoint);
    if (typeof token !== 'string' || !/^[\x21-\x7e]{32,512}$/.test(token)) throw new Error('Paste the compiler bridge token printed in the Windows terminal.');
    this.#url = url; this.#token = token; this.#controller = new AbortController();
    const connection = this.#controller;
    try {
      const caps = await this.#request({method: 'capabilities'}, {signal});
      if (caps?.version !== CLASSIC_PROTOCOL || caps.target !== CLASSIC_TARGET || caps.arch !== 'x86' || caps.runtime !== 'MSVBVM60.DLL') throw new Error('Incompatible Microsoft VB6 compiler bridge.');
      if (caps.available !== true) throw new Error(caps.reason || 'Microsoft VB6 compiler is unavailable on this host.');
      if (!Number.isInteger(caps.timeout) || caps.timeout < 1000 || caps.timeout > 3600000) throw new Error('Invalid compiler timeout contract.');
      this.#capabilities = Object.freeze({...caps}); return this.#capabilities;
    } catch (error) {if (connection === this.#controller) this.disconnect(); throw error;}
  }
  async build(project, options = {}, {signal} = {}) {
    if (!this.connected) throw new Error('Connect to the local Windows compiler first.');
    // The exact clone validated here is sent, not a live mutable project object.
    const connection = this.#controller;
    const snapshot = JSON.parse(JSON.stringify(project)), prepared = prepareClassicProject(snapshot, options);
    const result = await this.#request({method: 'build', project: snapshot, options: {name: prepared.manifest.name, codegen: prepared.manifest.codegen}},
      {signal, binary: true, timeout: this.#capabilities.timeout + 75000});
    if (result.headers.get('x-vb6-target') !== CLASSIC_TARGET) throw new Error('Compiler response has the wrong target.');
    const pe = verifyClassicExecutable(result.bytes), expected = result.headers.get('x-vb6-sha256');
    if (!/^[a-f0-9]{64}$/.test(expected || '')) throw new Error('Compiler response has no valid SHA-256 digest.');
    if (!globalThis.crypto?.subtle) throw new Error('Executable verification requires a secure browser context (HTTPS or localhost).');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', result.bytes));
    const sha256 = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
    if (sha256 !== expected) throw new Error('Executable SHA-256 verification failed.');
    signal?.throwIfAborted(); connection.signal.throwIfAborted();
    if (connection !== this.#controller) throw new Error('Compiler connection changed.');
    return {bytes: result.bytes, report: {...prepared.manifest, compiled: true, pe, sha256}};
  }
}

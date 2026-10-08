/** Explicit local compilation authority. HTTP data can never supply SDK source or host paths. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomBytes, timingSafeEqual, createHash} from 'node:crypto';
import {createMacOSBuildKit, normalizeMacOSBuildRequest, verifyMacOSAppArchive, MACOS_PROTOCOL, MACOS_LIMITS} from '../dist/index.js';
import {runTool, writeBuildKit, buildNativeKit} from './build-driver.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fault = (message, code, status = 400) => Object.assign(new Error(message), {code, status});
function originValue(value) {
  if (value === 'null') return value;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value) throw new Error('Configure exact HTTP(S) origins without paths.');
  return value;
}
function equal(a, b) {const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y);}
async function readBody(request) {
  const maximum = MACOS_LIMITS.projectBytes + 65536, advertised = request.headers['content-length'];
  if (advertised !== undefined && (!/^\d+$/.test(advertised) || Number(advertised) > maximum)) throw fault('Compiler request exceeds 20 MiB.', 'REQUEST_LIMIT', 413);
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length; if (size > maximum) throw fault('Compiler request exceeds 20 MiB.', 'REQUEST_LIMIT', 413);
    chunks.push(chunk);
  }
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks)));
}
function abortable(task, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason);
    signal.addEventListener('abort', stop, {once: true});
    Promise.resolve(task).then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}
async function probeCompiler() {
  if (process.platform !== 'darwin') throw new Error('Native application compilation requires macOS and Xcode Command Line Tools.');
  const compiler = await runTool('/usr/bin/xcrun', ['--sdk', 'macosx', '--find', 'clang++']);
  if (!path.isAbsolute(compiler)) throw new Error('Xcode did not return an absolute compiler path.');
  return {compilerVersion: await runTool(compiler, ['--version']), hostArch: process.arch};
}
async function compileKit(kit, options) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'vb6-macos-bridge-'));
  try {
    const input = path.join(temporary, 'kit'); await writeBuildKit(input, kit.files);
    const report = await buildNativeKit(input, {...options, out: path.join(temporary, 'out'), force: false, zip: true});
    const stat = await fs.lstat(report.zip);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MACOS_LIMITS.archiveBytes) throw fault('Invalid native compiler output.', 'OUTPUT_LIMIT');
    return new Uint8Array(await fs.readFile(report.zip));
  } finally {await fs.rm(temporary, {recursive: true, force: true});}
}
/** One request at a time, exact Host/Origin, token authentication, terminal consent,
 * bounded data, cancellation and signed-output inspection. Compiling is not a sandbox.
 * Dependencies are local test seams, not HTTP/project configuration.
 */
export async function createMacOSBridge({port = 8769, origins = [], token = randomBytes(32).toString('hex'),
  timeout = 600000, identity = '-', cache, jobs, authorize = async () => false} = {}, dependencies = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid compiler bridge port.');
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 600000) throw new Error('Compiler timeout must be 1000..600000 ms.');
  if (typeof token !== 'string' || !/^[\x21-\x7e]{32,512}$/.test(token)) throw new Error('Use a random ASCII token of at least 32 characters.');
  if (!Array.isArray(origins) || typeof authorize !== 'function') throw new TypeError('Origin array and authorization function required.');
  const allowed = new Set(origins.map(originValue)), shutdown = new AbortController();
  const compile = dependencies.compile || compileKit;
  let toolchain, unavailable;
  try {toolchain = await (dependencies.probe || probeCompiler)();} catch (error) {unavailable = error.message;}
  let active = null, busy = false, closing = false, closePromise;
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    const json = (status, value) => {
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'}); response.end(JSON.stringify(value));
    };
    const deny = (status, code, message) => json(status, {error: {code, message}});
    const origin = request.headers.origin;
    for (const key of ['host', 'origin', 'authorization']) {
      if (request.rawHeaders.filter((v, i) => i % 2 === 0 && v.toLowerCase() === key).length > 1) return deny(400, 'DUPLICATE_HEADER', 'Duplicate authority header.');
    }
    if (request.headers.host !== '127.0.0.1:' + server.address()?.port) return deny(403, 'HOST_DENIED', 'Loopback Host required.');
    if (origin !== undefined && !allowed.has(origin)) return deny(403, 'ORIGIN_DENIED', 'Browser origin is not approved.');
    if (origin !== undefined) {
      response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Expose-Headers', 'X-VB6-SHA256, X-VB6-Executable-SHA256, X-VB6-Target');
    }
    if (request.url !== '/macos') return deny(404, 'NOT_FOUND', 'Not found.');
    if (request.method === 'OPTIONS') {
      const headers = String(request.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      if (!origin || request.headers['access-control-request-method'] !== 'POST' || headers.some(h => !['authorization', 'content-type'].includes(h))) return deny(403, 'PREFLIGHT_DENIED', 'Preflight denied.');
      response.setHeader('Access-Control-Allow-Methods', 'POST'); response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      response.setHeader('Access-Control-Allow-Private-Network', 'true'); response.writeHead(204); response.end(); return;
    }
    if (request.method !== 'POST') return deny(405, 'METHOD_DENIED', 'POST required.');
    if (!equal(String(request.headers.authorization || ''), 'Bearer ' + token)) return deny(401, 'UNAUTHORIZED', 'Invalid compiler bridge token.');
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) return deny(415, 'CONTENT_TYPE', 'application/json required.');
    if (closing) return deny(503, 'CLOSED', 'Compiler bridge is closing.');
    if (busy) return deny(409, 'BUSY', 'Another macOS request or approval is in progress.');
    // Reserve before the asynchronous body read, including slow/chunked requests.
    busy = true;
    const cancelled = new AbortController();
    request.once('aborted', () => cancelled.abort());
    response.once('close', () => {if (!response.writableEnded) cancelled.abort();});
    const signal = AbortSignal.any([cancelled.signal, shutdown.signal, AbortSignal.timeout(timeout + 60000)]);
    active = (async () => {
      try {
        const value = await readBody(request); signal.throwIfAborted();
        if (value?.method === 'capabilities' && Object.keys(value).length === 1) {
          json(200, {result: {version: MACOS_PROTOCOL, target: 'macos-arm64', arch: 'arm64', runtime: 'AppKit',
            available: !!toolchain, reason: unavailable, timeout, hostArch: toolchain?.hostArch}}); return;
        }
        const prepared = normalizeMacOSBuildRequest(value);
        if (!toolchain) throw fault(unavailable || 'Compiler unavailable.', 'COMPILER_UNAVAILABLE', 503);
        const kit = createMacOSBuildKit(prepared.project, prepared.options);
        const manifest = {...kit.report, name: kit.options.name, sourceSha256: digest(kit.files['main.cpp']),
          projectSha256: digest(JSON.stringify(prepared.project)), signing: identity === '-' ? 'ad-hoc' : 'configured-identity'};
        const approvalSignal = AbortSignal.any([signal, AbortSignal.timeout(60000)]);
        if (await abortable(authorize(structuredClone(manifest), {signal: approvalSignal}), approvalSignal) !== true) throw fault('Local compilation was not approved.', 'CONSENT_DENIED', 403);
        signal.throwIfAborted();
        const bytes = await compile(kit, {identity, cache, jobs, timeout, signal});
        signal.throwIfAborted();
        if (!(bytes instanceof Uint8Array) || bytes.length > MACOS_LIMITS.archiveBytes) throw fault('Invalid or excessive native compiler output.', 'OUTPUT_LIMIT');
        const report = await verifyMacOSAppArchive(bytes, prepared.options); signal.throwIfAborted();
        if (response.destroyed || response.writableEnded) return;
        response.writeHead(200, {'Content-Type': 'application/zip', 'Content-Length': bytes.length,
          'X-VB6-Target': 'macos-arm64', 'X-VB6-SHA256': report.sha256, 'X-VB6-Executable-SHA256': report.executableSha256});
        response.end(bytes);
      } catch (error) {
        json(error.status || (signal.aborted ? 499 : 400), {error: {code: error.code || 'MACOS_BUILD', message: String(error.message).slice(0, 4096),
          compilerLog: String(error.output || '').slice(0, 32768), diagnostics: (Array.isArray(error.diagnostics) ? error.diagnostics : []).slice(0, 20).map(d => ({severity: d.severity, line: d.line, code: String(d.code || '').slice(0, 64), source: String(d.source || '').slice(0, 256), message: String(d.message || '').slice(0, 512)}))}});
      }
    })().finally(() => {busy = false; active = null;});
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000; server.maxRequestsPerSocket = 100;
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(port, '127.0.0.1', resolve);});
  return {server, token, url: 'http://127.0.0.1:' + server.address().port + '/macos', available: !!toolchain, reason: unavailable,
    close() {
      if (closePromise) return closePromise;
      closing = true; shutdown.abort();
      closePromise = (async () => {const stopped = new Promise(resolve => server.close(resolve)); server.closeAllConnections(); await active; await stopped;})();
      return closePromise;
    }};
}

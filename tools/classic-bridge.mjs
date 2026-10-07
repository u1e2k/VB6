import http from 'node:http';
import {randomBytes, timingSafeEqual, createHash} from 'node:crypto';
import {CLASSIC_TARGET, CLASSIC_PROTOCOL, CLASSIC_CODEGEN, CLASSIC_LIMITS} from '../src/exporter/classic-options.js';
import {verifyClassicExecutable} from './pe.mjs';
import {findCompiler} from './build-classic.mjs';
import {compileClassicProject, prepareClassicBuildRequest} from './classic-compile.mjs';

function originValue(value) {
  if (value === 'null') return value;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value) throw new Error('Configure exact HTTP(S) origins without paths.');
  return value;
}
function equal(a, b) {const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y);}
function errorCode(message, code, status = 400) {return Object.assign(new Error(message), {code, status});}
async function readBody(request) {
  let size = 0; const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > CLASSIC_LIMITS.projectBytes + 65536) throw errorCode('Classic request exceeds 20 MiB.', 'REQUEST_LIMIT', 413);
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
/** Loopback, exact Origin/Host, memory-only token, and explicit local approval.
 * Compiler paths and timeouts come from the host, never from project/HTTP data.
 * The compiler may load registered design-time components: approval is not a sandbox.
 */
export async function createClassicBridge({port = 8768, origins = [], token = randomBytes(32).toString('hex'), compiler, timeout = 120000, authorize = async () => false} = {}, dependencies = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid compiler bridge port.');
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 3600000) throw new Error('Invalid compiler timeout.');
  if (typeof token !== 'string' || !/^[\x21-\x7e]{32,512}$/.test(token)) throw new Error('Use a random ASCII token of at least 32 characters.');
  const allowed = new Set(origins.map(originValue)), shutdown = new AbortController();
  const compile = dependencies.compile || compileClassicProject;
  const platform = dependencies.platform || process.platform;
  let compilerPath, unavailable;
  try {if (platform !== 'win32') throw new Error('Microsoft VB6 compilation requires Windows.'); compilerPath = await findCompiler({compiler});}
  catch (error) {unavailable = error.message;}
  let active = null, busy = false, closing = false, closePromise;
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const json = (status, value) => {
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'}); response.end(JSON.stringify(value));
    };
    const origin = request.headers.origin;
    if (request.headers.host !== '127.0.0.1:' + server.address()?.port) {json(403, {error: {code: 'HOST_DENIED', message: 'Loopback Host required.'}}); return;}
    if (origin !== undefined && !allowed.has(origin)) {json(403, {error: {code: 'ORIGIN_DENIED', message: 'Browser origin is not approved.'}}); return;}
    if (origin !== undefined) {
      response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Expose-Headers', 'X-VB6-SHA256, X-VB6-Target');
    }
    if (request.url !== '/classic') {json(404, {error: {message: 'Not found.'}}); return;}
    if (request.method === 'OPTIONS') {
      const headers = String(request.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      if (!origin || !allowed.has(origin) || request.headers['access-control-request-method'] !== 'POST' || headers.some(h => !['authorization', 'content-type'].includes(h))) {json(403, {error: {message: 'Preflight denied.'}}); return;}
      response.setHeader('Access-Control-Allow-Methods', 'POST'); response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      response.setHeader('Access-Control-Allow-Private-Network', 'true'); response.writeHead(204); response.end(); return;
    }
    if (request.method !== 'POST') {json(405, {error: {message: 'POST required.'}}); return;}
    if (!equal(String(request.headers.authorization || ''), 'Bearer ' + token)) {json(401, {error: {code: 'UNAUTHORIZED', message: 'Invalid compiler bridge token.'}}); return;}
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {json(415, {error: {message: 'application/json required.'}}); return;}
    const cancelled = new AbortController();
    request.once('aborted', () => cancelled.abort());
    response.once('close', () => {if (!response.writableEnded) cancelled.abort();});
    const signal = AbortSignal.any([cancelled.signal, shutdown.signal]);
    try {
      if (closing) throw errorCode('Compiler bridge is closing.', 'CLOSED', 503);
      if (busy) throw errorCode('Another classic compilation or approval is in progress.', 'BUSY', 409);
      const value = await readBody(request);
      if (value?.method === 'capabilities' && Object.keys(value).length === 1) {
        json(200, {result: {version: CLASSIC_PROTOCOL, target: CLASSIC_TARGET, arch: 'x86', runtime: 'MSVBVM60.DLL', codegen: CLASSIC_CODEGEN, available: !!compilerPath, reason: unavailable, timeout}}); return;
      }
      if (!compilerPath) throw errorCode(unavailable, 'COMPILER_UNAVAILABLE', 503);
      // Recheck after the asynchronous body read to close concurrent-request races.
      if (busy) throw errorCode('Another classic compilation is in progress.', 'BUSY', 409);
      busy = true;
      active = (async () => {
        const prepared = prepareClassicBuildRequest(value);
        signal.throwIfAborted();
        if (await authorize(structuredClone(prepared.manifest), {signal}) !== true) throw errorCode('Local compilation was not approved.', 'CONSENT_DENIED', 403);
        signal.throwIfAborted();
        const result = await compile(prepared, {compiler: compilerPath, timeout, signal});
        signal.throwIfAborted();
        const bytes = Buffer.from(result.bytes);
        if (bytes.length > CLASSIC_LIMITS.executableBytes) throw errorCode('EXE exceeds 64 MiB.', 'OUTPUT_LIMIT');
        verifyClassicExecutable(bytes);
        if (response.destroyed || response.writableEnded) return;
        response.writeHead(200, {'Content-Type': 'application/vnd.microsoft.portable-executable', 'Content-Length': bytes.length,
          'X-VB6-SHA256': createHash('sha256').update(bytes).digest('hex'), 'X-VB6-Target': CLASSIC_TARGET});
        response.end(bytes);
      })();
      try {await active;} finally {active = null; busy = false;}
    } catch (error) {
      json(error.status || (signal.aborted ? 499 : 400), {error: {code: error.code || 'CLASSIC_BUILD', message: error.message, diagnostics: error.diagnostics, compilerLog: error.compilerLog}});
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000; server.maxRequestsPerSocket = 100;
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(port, '127.0.0.1', resolve);});
  return {server, token, url: 'http://127.0.0.1:' + server.address().port + '/classic', available: !!compilerPath, reason: unavailable,
    close() {
      if (closePromise) return closePromise;
      closing = true; shutdown.abort();
      closePromise = (async () => {
        const stopped = new Promise(resolve => server.close(resolve)); server.closeAllConnections();
        await active?.catch(() => {}); await stopped;
      })();
      return closePromise;
    }};
}

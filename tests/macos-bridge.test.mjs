import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createMacOSBridge} from '../packages/macos-native/src/bridge.mjs';
import {MacOSCompilerClient} from '../packages/macos-native/src/client.js';
import {macOSArchiveFixture, fixtureProject} from './macos-fixture.mjs';
const origin = 'http://127.0.0.1:8080', token = 'b'.repeat(64);
const caps = {version: 1, target: 'macos-arm64', arch: 'arm64', runtime: 'AppKit', available: true, timeout: 1000};
const json = value => new Response(JSON.stringify(value), {headers: {'content-type': 'application/json'}});
async function bridgeFor(t, options = {}, dependencies = {}) {
  const bridge = await createMacOSBridge({port: 0, origins: [origin], token, timeout: 1000, authorize: async () => true, ...options},
    {probe: async () => ({hostArch: 'synthetic-test-host'}), compile: async () => macOSArchiveFixture(), ...dependencies});
  t.after(() => bridge.close()); return bridge;
}
const post = (bridge, body, headers = {}, signal) => fetch(bridge.url, {method: 'POST', headers: {Origin: origin, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...headers}, body: JSON.stringify(body), signal});
const build = () => ({method: 'build', project: fixtureProject()});

test('synthetic native bridge/client roundtrip uses checked source and retains original archive bytes', async t => {
  let approvals = 0, compilations = 0;
  const bridge = await bridgeFor(t, {authorize: async manifest => {++approvals; assert.match(manifest.sourceSha256, /^[a-f0-9]{64}$/); assert.equal(manifest.target, 'macos-arm64'); manifest.name = 'CannotMutateKit'; return true;}},
    {compile: async (kit, options) => {++compilations; assert.equal(kit.options.name, 'NativeFixture'); assert.match(kit.files['main.cpp'], /initializeProgram/); assert.equal(options.identity, '-'); assert.ok(options.signal); return macOSArchiveFixture();}});
  const client = new MacOSCompilerClient((url, options) => fetch(url, {...options, headers: {...options.headers, Origin: origin}}));
  t.after(() => client.disconnect());
  await client.connect(bridge.url, bridge.token); const result = await client.build(fixtureProject());
  assert.equal(approvals, 1); assert.equal(compilations, 1); assert.deepEqual(result.bytes, macOSArchiveFixture());
  assert.equal(result.report.artifact, 'native-executable'); assert.equal(result.report.browserSignatureCryptographicallyVerified, false);
  assert.ok(!JSON.stringify(client).includes(token)); client.disconnect(); assert.equal(client.connected, false);
  await assert.rejects(client.build(fixtureProject()), /Connect/);
});
test('macOS bridge rejects foreign Origin, Host, token, methods and browser-supplied host authority', async t => {
  let builds = 0; const bridge = await bridgeFor(t, {}, {compile: async () => {++builds; return macOSArchiveFixture();}});
  for (const [headers, status] of [[{Origin: 'https://foreign.test'}, 403], [{Authorization: 'Bearer wrong'}, 401], [{'Content-Type': 'text/plain'}, 415]]) assert.equal((await post(bridge, {method: 'capabilities'}, headers)).status, status);
  const wrongHost = await new Promise((resolve, reject) => {const r = http.request(bridge.url, {method: 'POST', headers: {Host: 'foreign.test'}}, response => {response.resume(); resolve(response.statusCode);}); r.on('error', reject); r.end('{}');});
  assert.equal(wrongHost, 403); assert.equal((await fetch(bridge.url)).status, 405);
  for (const value of [{method: 'run'}, {...build(), commands: ['sh']}, {...build(), options: {identity: 'untrusted'}}, {...build(), options: {out: '/tmp/unsafe'}}, {...build(), options: {sources: ['arbitrary.mm']}}]) assert.equal((await post(bridge, value)).status, 400);
  assert.equal(builds, 0);
  const preflight = await fetch(bridge.url, {method: 'OPTIONS', headers: {Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type'}});
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal((await fetch(bridge.url, {method: 'OPTIONS', headers: {Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-host-path'}})).status, 403);
});
test('denied native build consent never invokes compiler', async t => {
  let calls = 0; const bridge = await bridgeFor(t, {authorize: async () => false}, {compile: async () => {++calls;}});
  const response = await post(bridge, build()); assert.equal(response.status, 403); assert.equal((await response.json()).error.code, 'CONSENT_DENIED'); assert.equal(calls, 0);
});
test('bridge body reservation and active compilation prevent concurrent approvals', async t => {
  const bridge = await bridgeFor(t); let first;
  const opened = new Promise(resolve => {first = http.request(bridge.url, {method: 'POST', headers: {Origin: origin, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}}, response => {response.resume(); resolve(response.statusCode);}); first.on('error', () => {}); first.flushHeaders(); first.write('{');});
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await post(bridge, build())).status, 409); first.end('"method":"capabilities"}'); assert.equal(await opened, 200);
});
test('native bridge aborts active compiler on disconnect and permits no late result', async t => {
  let start, stop; const started = new Promise(r => start = r), stopped = new Promise(r => stop = r);
  const bridge = await bridgeFor(t, {}, {compile: async (_kit, {signal}) => {start(); return new Promise((resolve, reject) => {signal.addEventListener('abort', () => {stop(); reject(signal.reason);}, {once: true});});}});
  const controller = new AbortController(), request = post(bridge, build(), {}, controller.signal);
  await started; assert.equal((await post(bridge, build())).status, 409); controller.abort(); await assert.rejects(request); await stopped;
});
test('bridge shutdown interrupts pending consent even when the consent implementation ignores abort', async t => {
  let start; const started = new Promise(r => start = r);
  const bridge = await bridgeFor(t, {authorize: () => {start(); return new Promise(() => {});}});
  const request = post(bridge, build()).catch(error => error); await started;
  await bridge.close(); assert.ok(await request instanceof Error);
});
test('unavailable native compiler and invalid output cannot be returned as executable downloads', async t => {
  const unavailable = await bridgeFor(t, {}, {probe: async () => {throw new Error('No Xcode test fixture');}});
  assert.equal((await (await post(unavailable, {method: 'capabilities'})).json()).result.available, false);
  assert.equal((await post(unavailable, build())).status, 503);
  for (const bytes of [new Uint8Array(8), macOSArchiveFixture('AnotherApplication')]) {
    const bridge = await bridgeFor(t, {}, {compile: async () => bytes}); assert.equal((await post(bridge, build())).status, 400);
  }
});
test('native compiler failure returns bounded diagnostic text without a binary success', async t => {
  const bridge = await bridgeFor(t, {}, {compile: async () => {throw Object.assign(new Error('Fixture compiler failure'), {output: 'x'.repeat(100000), diagnostics: [{source: 'MainModule', line: 2, code: 'MAC210', message: 'Fixture diagnostic'}]});}});
  const response = await post(bridge, build()); assert.equal(response.status, 400);
  const value = await response.json(); assert.equal(value.error.compilerLog.length, 32768); assert.equal(value.error.diagnostics[0].code, 'MAC210');
});
test('native client rejects server impersonation, wrong format, target, hashes and size declarations', async () => {
  for (const mode of ['json', 'target', 'digest', 'oversize']) {
    const client = new MacOSCompilerClient(async (_url, options) => {
      if (JSON.parse(options.body).method === 'capabilities') return json({result: caps});
      if (mode === 'json') return json({result: {compiled: true}});
      return new Response(macOSArchiveFixture(), {headers: {'content-type': 'application/zip', 'x-vb6-target': mode === 'target' ? 'win32' : 'macos-arm64', 'x-vb6-sha256': '0'.repeat(64), ...(mode === 'oversize' ? {'content-length': '999999999'} : {})}});
    });
    await client.connect('http://127.0.0.1:8769/macos', token); await assert.rejects(client.build(fixtureProject())); client.disconnect();
  }
  const wrong = new MacOSCompilerClient(async () => json({result: {...caps, version: 999}}));
  await assert.rejects(wrong.connect('http://127.0.0.1:8769/macos', token), /Incompatible/); assert.equal(wrong.connected, false);
  for (const endpoint of ['https://127.0.0.1:8769/macos', 'http://localhost:8769/macos', 'http://127.0.0.1:8769/macos?token=unsafe', 'http://127.0.0.1:8769/other']) await assert.rejects(wrong.connect(endpoint, token), /local compiler/);
});

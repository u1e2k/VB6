import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {runTool, NativeBuildError} from '../packages/macos-native/src/build-driver.mjs';

const execute = promisify(execFile);
const driver = new URL('../packages/macos-native/src/build-driver.mjs', import.meta.url).href;

// Run each process-lifetime fixture in isolation. The outer timeout is a failing
// watchdog, not a pass condition; the inner fixture always cleans up its child.
async function isolated(source) {
  return execute(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import {runTool, NativeBuildError} from ${JSON.stringify(driver)};
    ${source}
  `], {timeout: 6000, maxBuffer: 5 * 1024 * 1024});
}

test('native tool abort waits for actual exit even when the child ignores SIGTERM', async () => {
  const {stdout} = await isolated(`
    const controller = new AbortController(); let pid;
    try {
      await assert.rejects(runTool(process.execPath, ['-e',
        "process.on('SIGTERM',()=>{}); console.log(process.pid); setInterval(()=>{},100);"
      ], {signal: controller.signal, log: value => {
        pid = Number(value.trim()); controller.abort(new Error('Cancelled fixture build'));
      }}), error => error instanceof NativeBuildError && /cancel|abort/i.test(error.message));
      assert.ok(Number.isInteger(pid));
      assert.throws(() => process.kill(pid, 0), {code: 'ESRCH'}, 'compiler must be reaped before rejection');
      console.log('ABORT_REAPED');
    } finally {if (pid) {try {process.kill(pid, 'SIGKILL');} catch {}}}
  `);
  assert.match(stdout, /ABORT_REAPED/);
});

test('native tool preserves split multibyte UTF-8 diagnostics on each stream', async () => {
  const source = `
    const bytes = Buffer.from('λ');
    process.stdout.write(bytes.subarray(0,1));
    setTimeout(() => {
      process.stdout.write(bytes.subarray(1));
      process.stderr.write(bytes.subarray(0,1));
      setTimeout(() => process.stderr.write(bytes.subarray(1)), 20);
    }, 20);
  `;
  assert.equal(await runTool(process.execPath, ['-e', source]), 'λλ');
});

test('pre-aborted native tool request never starts a compiler', async () => {
  const controller = new AbortController(); controller.abort(new Error('No permission to begin'));
  await assert.rejects(runTool(process.execPath, ['-e', 'process.exit(0)'], {signal: controller.signal}),
    error => error instanceof NativeBuildError && /cancel|abort/i.test(error.message));
});

test('native tool stdout/stderr failure retains bounded diagnostic details and exit code', async () => {
  await assert.rejects(runTool(process.execPath, ['-e', "process.stderr.write('fixture failed'); process.exitCode=17"]),
    error => error instanceof NativeBuildError && error.code === 17 && error.output === 'fixture failed');
});

test('native tool rejects invalid options before starting any process', async () => {
  for (const [executable, args, options] of [
    ['relative/compiler', [], {}],
    [process.execPath, ['bad\0argument'], {}],
    [process.execPath, [], {timeout: 0}],
    [process.execPath, [], {log: 'not callable'}]
  ]) await assert.rejects(runTool(executable, args, options), TypeError);
});

test('native tool spawn failure rejects with a useful error rather than hanging', async () => {
  await assert.rejects(runTool('/nonexistent-vb6-native-tool-fixture', []),
    error => error instanceof NativeBuildError && /ENOENT/.test(error.message));
});

test('native tool logger exceptions terminate and reap the child instead of escaping the event callback', async () => {
  const {stdout} = await isolated(`
    let pid;
    try {
      await assert.rejects(runTool(process.execPath, ['-e',
        "console.log(process.pid); setInterval(()=>{},100);"
      ], {log: value => {pid=Number(value.trim()); throw new Error('Logger fixture failure');}}),
        error => error instanceof NativeBuildError && error.cause?.message === 'Logger fixture failure');
      assert.throws(() => process.kill(pid,0), {code:'ESRCH'});
      console.log('LOGGER_REAPED');
    } finally {if (pid) {try {process.kill(pid,'SIGKILL');} catch {}}}
  `);
  assert.match(stdout, /LOGGER_REAPED/);
});

test('native tool output limit is enforced before promise settlement and process cleanup', async () => {
  const {stdout} = await isolated(`
    let pid;
    try {
      await assert.rejects(runTool(process.execPath, ['-e',
        "console.log('PID:'+process.pid); setTimeout(()=>process.stdout.write('x'.repeat(5*1024*1024)),20); setInterval(()=>{},100);"
      ], {log: value => {const match=/PID:(\\d+)/.exec(value);if(match)pid=Number(match[1]);}}),
        error => error instanceof NativeBuildError && error.code === 'OUTPUT_LIMIT' &&
          Buffer.byteLength(error.output) <= 4*1024*1024);
      assert.throws(() => process.kill(pid,0), {code:'ESRCH'});
      console.log('OUTPUT_REAPED');
    } finally {if (pid) {try {process.kill(pid,'SIGKILL');} catch {}}}
  `);
  assert.match(stdout, /OUTPUT_REAPED/);
});

test('native tool timeout kills its owned POSIX descendant group and closes inherited pipes', {skip: process.platform === 'win32'}, async () => {
  const {stdout} = await isolated(`
    let pids=[];
    const descendant="process.on('SIGTERM',()=>{}); console.log('CHILD:'+process.pid); setInterval(()=>{},100);";
    const parent="const {spawn}=require('node:child_process'); console.log('PARENT:'+process.pid); process.on('SIGTERM',()=>{}); spawn(process.execPath,['-e',"+JSON.stringify(descendant)+"],{stdio:['ignore',1,2]}); setInterval(()=>{},100);";
    try {
      await assert.rejects(runTool(process.execPath, ['-e',parent], {timeout:1000,log:value=>{
        pids.push(...Array.from(value.matchAll(/(?:PARENT|CHILD):(\\d+)/g),m=>Number(m[1])));
      }}), error => error instanceof NativeBuildError && error.code === 'ETIMEDOUT' && error.killedBy === 'SIGKILL');
      assert.equal(pids.length,2);
      // The close event cannot occur while the descendant retains an inherited output pipe.
      assert.throws(() => process.kill(pids[0],0), {code:'ESRCH'});
      console.log('PROCESS_GROUP_CLOSED');
    } finally {for(const pid of pids){try{process.kill(pid,'SIGKILL');}catch{}}}
  `);
  assert.match(stdout, /PROCESS_GROUP_CLOSED/);
});

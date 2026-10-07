/** Abortable compiler process runner. Never executes compiler output. */
import {spawn} from 'node:child_process';
import path from 'node:path';
export function runCompiler(executable, args, { cwd, timeout = 120000, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason || new Error('VB6 compilation cancelled.')); return; }
    const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, stdio: 'ignore' });
    let expired = false, cancelled = false, killing = false;
    const kill = () => {
      if (killing) return; killing = true;
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/pid', String(child.pid), '/t', '/f'], { shell: false, windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
        killer.on('close', code => { if (code) child.kill(); });
      } else child.kill('SIGKILL');
    };
    const cancel = () => { cancelled = true; kill(); };
    const timer = setTimeout(() => { expired = true; kill(); }, timeout);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
    signal?.addEventListener('abort', cancel, {once: true});
    // Abort can arrive between the initial check and listener installation.
    if (signal?.aborted) cancel();
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', (code, exitSignal) => {
      cleanup();
      if (cancelled) reject(new Error('VB6 compilation cancelled.'));
      else if (expired) reject(new Error('VB6 compilation timed out; inspect the compiler log for missing references or UI prompts.'));
      else resolve({ code, signal: exitSignal });
    });
  });
}

/** Host-only compiler execution. Never included in an application export. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {prepareClassicProject} from '../src/exporter/classic-project.js';
import {bytesOf, decodeNativeText} from '../src/project/native-text.js';
import {CLASSIC_LIMITS} from '../src/exporter/classic-options.js';
import {verifyClassicExecutable} from './pe.mjs';
import {compilerArguments} from './build-classic.mjs';
import {runCompiler} from './classic-process.mjs';

export async function compileClassicProject(prepared, {compiler, timeout = 120000, signal, runner = runCompiler} = {}) {
  if (!compiler) throw new Error('Configure a licensed VB6.EXE on the local compiler host.');
  signal?.throwIfAborted();
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'vb6-classic-'));
  const source = path.join(stage, 'source'), bin = path.join(stage, 'bin'), log = path.join(stage, 'compiler.log');
  try {
    await fs.mkdir(bin, {recursive: true});
    for (const [relative, input] of Object.entries(prepared.files)) {
      signal?.throwIfAborted();
      const destination = path.resolve(source, relative.replace(/\\/g, '/'));
      if (!destination.startsWith(source + path.sep)) throw new Error('Unsafe classic source path.');
      await fs.mkdir(path.dirname(destination), {recursive: true});
      await fs.writeFile(destination, bytesOf(input), {flag: 'wx'});
    }
    const vbp = path.resolve(source, prepared.manifest.projectPath.replace(/\\/g, '/'));
    const status = await runner(compiler, compilerArguments({vbp, bin, log}), {cwd: path.dirname(vbp), timeout, signal});
    signal?.throwIfAborted();
    if (status.code !== 0 || status.signal) throw new Error('VB6 compiler failed (' + (status.code ?? status.signal) + ').');
    const executable = path.join(bin, prepared.manifest.name + '.exe');
    let stat;
    try {stat = await fs.lstat(executable);} catch {throw new Error('VB6 did not create a fresh executable. Review the compiler log and registered dependencies.');}
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > CLASSIC_LIMITS.executableBytes) throw new Error('Compiler output is not a regular EXE within the 64 MiB limit.');
    const bytes = await fs.readFile(executable), pe = verifyClassicExecutable(bytes);
    return {bytes, report: {...prepared.manifest, compiled: true, pe, sha256: createHash('sha256').update(bytes).digest('hex')}};
  } catch (error) {
    // Bounded compiler output is useful in the IDE, unlike an inaccessible temp path.
    try {
      const handle = await fs.open(log, 'r');
      try {const buffer = Buffer.alloc(65536), {bytesRead} = await handle.read(buffer, 0, buffer.length, 0); error.compilerLog = decodeNativeText(buffer.subarray(0, bytesRead), {encoding: prepared.manifest.encoding || 'windows-1252'}).text;}
      finally {await handle.close();}
    } catch {}
    throw error;
  } finally {await fs.rm(stage, {recursive: true, force: true});}
}
export function prepareClassicBuildRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !['method', 'project', 'options'].includes(key)) || value.method !== 'build') throw new Error('Invalid classic build request.');
  return prepareClassicProject(value.project, value.options);
}

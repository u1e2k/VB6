import {prepareClassicProject} from './classic-project.js';
import {bytesOf} from '../project/native-text.js';
import {inspectPE, verifyClassicExecutable} from './pe.js';

// This function's source is shipped as a standalone Node script. Keep dependencies
// local and source-independent; extracted-archive tests exercise that contract.
export async function runClassicArchive(rootURL) {
  const fs = await import('node:fs/promises'), path = await import('node:path');
  const {spawn} = await import('node:child_process'), {fileURLToPath} = await import('node:url');
  const {createHash} = await import('node:crypto'), os = await import('node:os');
  const options = {timeout: 120000}, args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') {console.log('node build.mjs [--compiler "C:\\...\\VB6.EXE"] [--timeout 120000]\nRequires Windows, Node 22+, licensed VB6 compiler and registered project dependencies.\nCompiler defaults to VB6_COMPILER or the standard VB98 installation. No EXE is executed.'); return;}
    const key = {'--compiler': 'compiler', '--timeout': 'timeout'}[args[i]];
    if (!key || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Invalid build option: ' + args[i]);
    options[key] = args[++i];
  }
  options.timeout = Number(options.timeout);
  if (!Number.isInteger(options.timeout) || options.timeout < 1000 || options.timeout > 3600000) throw new Error('Timeout must be 1000..3600000 ms.');
  if (process.platform !== 'win32') throw new Error('Microsoft VB6 compilation requires Windows. Copy this archive to your licensed VB6 build machine.');
  const root = path.dirname(fileURLToPath(rootURL));
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'classic-build.json'), 'utf8'));
  if (manifest.target !== 'classic-vb6' || manifest.arch !== 'x86' || typeof manifest.name !== 'string' ||
      !/^[^<>:"/\\|?*\x00-\x1f]{1,100}$/.test(manifest.name) || /[. ]$/.test(manifest.name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(manifest.name)) throw new Error('Invalid classic build manifest.');
  const source = path.join(root, 'source');
  if (typeof manifest.projectPath !== 'string' || path.win32.isAbsolute(manifest.projectPath)) throw new Error('Invalid project path.');
  const input = path.resolve(source, manifest.projectPath.replace(/\\/g, '/'));
  if (!input.startsWith(source + path.sep) || !(await fs.realpath(input)).startsWith(await fs.realpath(source) + path.sep)) throw new Error('Project escapes source directory.');
  const candidates = options.compiler || process.env.VB6_COMPILER ? [path.resolve(options.compiler || process.env.VB6_COMPILER)] :
    [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean).map(base => path.join(base, 'Microsoft Visual Studio', 'VB98', 'VB6.EXE'));
  let compiler;
  for (const candidate of candidates) {try {if ((await fs.stat(candidate)).isFile()) {compiler = candidate; break;}} catch {}}
  if (!compiler) throw new Error('Licensed VB6.EXE not found. Set VB6_COMPILER or use --compiler.');
  // Every invocation compiles in a fresh source/bin directory. Old EXEs cannot pass.
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'vb6-runtime-')), stagedSource = path.join(stage, 'source');
  const bin = path.join(stage, 'bin'), log = path.join(stage, 'compiler.log');
  let count = 0, total = 0, child;
  async function copy(from, to) {
    await fs.mkdir(to, {recursive: true});
    for (const entry of await fs.readdir(from, {withFileTypes: true})) {
      if (++count > 10000 || entry.isSymbolicLink()) throw new Error('Unsafe or oversized source tree.');
      const input = path.join(from, entry.name), output = path.join(to, entry.name);
      if (entry.isDirectory()) await copy(input, output);
      else if (entry.isFile()) {total += (await fs.stat(input)).size; if (total > 512 * 1024 * 1024) throw new Error('Source tree exceeds 512 MiB.'); await fs.copyFile(input, output);}
      else throw new Error('Unsupported source entry.');
    }
  }
  const kill = () => {
    if (!child?.pid || child.exitCode !== null) return;
    const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/pid', String(child.pid), '/t', '/f'], {shell: false, windowsHide: true, stdio: 'ignore'});
    killer.on('error', () => child.kill());
  };
  let interrupted = false;
  const interrupt = () => {interrupted = true; kill();};
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    await copy(source, stagedSource); await fs.mkdir(bin);
    const vbp = path.join(stagedSource, path.relative(source, input));
    if (interrupted) throw new Error('Compilation cancelled.');
    await new Promise((resolve, reject) => {
      child = spawn(compiler, ['/make', vbp, '/out', log, '/outdir', bin], {cwd: path.dirname(vbp), shell: false, windowsHide: true, stdio: 'ignore'});
      let expired = false;
      const timer = setTimeout(() => {expired = true; kill();}, options.timeout);
      child.on('error', error => {clearTimeout(timer); reject(error);});
      child.on('close', (code, signal) => {clearTimeout(timer); if (expired || interrupted || code !== 0 || signal) reject(new Error(expired ? 'Compilation timed out.' : interrupted ? 'Compilation cancelled.' : 'VB6 compiler failed: ' + (code ?? signal))); else resolve();});
    });
    const executable = path.join(bin, manifest.name + '.exe'), stat = await fs.lstat(executable);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024) throw new Error('Invalid compiler output.');
    const bytes = await fs.readFile(executable), pe = verifyClassicExecutable(bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const release = path.join(root, 'release'); await fs.mkdir(release, {recursive: true});
    const out = await fs.mkdtemp(path.join(release, 'build-'));
    await fs.writeFile(path.join(out, manifest.name + '.exe'), bytes, {flag: 'wx'});
    await fs.writeFile(path.join(out, manifest.name + '.sha256'), sha256 + '  ' + manifest.name + '.exe\n');
    await fs.writeFile(path.join(out, manifest.name + '.build.json'), JSON.stringify({...manifest, compiled: true, pe, sha256}, null, 2) + '\n');
    try {await fs.copyFile(log, path.join(out, 'compiler.log'));} catch (error) {if (error.code !== 'ENOENT') throw error;}
    console.log('Built ' + path.join(out, manifest.name + '.exe') + '\nSHA-256: ' + sha256 + '\nMSVBVM60.DLL and the project\'s 32-bit dependencies must be installed on the target machine.');
  } catch (error) {
    try {const h = await fs.open(log); try {const buffer = Buffer.alloc(65536), result = await h.read(buffer, 0, buffer.length, 0); console.error(buffer.subarray(0, result.bytesRead).toString('utf8'));} finally {await h.close();}} catch {}
    throw error;
  } finally {process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); await fs.rm(stage, {recursive: true, force: true});}
}

export function exportClassicArchive(project, options = {}) {
  const prepared = prepareClassicProject(project, options), files = Object.create(null);
  for (const [name, content] of Object.entries(prepared.files)) files['source/' + name] = bytesOf(content);
  files['classic-build.json'] = JSON.stringify(prepared.manifest, null, 2) + '\n';
  files['build.mjs'] = '// Generated standalone build driver; no Microsoft code or binaries.\n' +
    inspectPE.toString() + '\n' + verifyClassicExecutable.toString() + '\n' +
    '(' + runClassicArchive.toString() + ')(import.meta.url).catch(error => {console.error(error.message); process.exitCode = 1;});\n';
  files['README.txt'] = 'Microsoft VB6 runtime EXE build archive\r\n\r\n' +
    'This is source, not an executable. Extract on Windows with Node 22+ and your licensed VB6 compiler.\r\n' +
    'Run: node build.mjs --compiler "C:\\Program Files (x86)\\Microsoft Visual Studio\\VB98\\VB6.EXE"\r\n' +
    'Or set VB6_COMPILER and run: node build.mjs\r\n' +
    'Use source/' + prepared.manifest.projectPath + ' directly in Microsoft VB6 instead of the driver if preferred.\r\n' +
    'The selected compilation mode is already recorded in the VBP. Builds go to a fresh release/build-* directory.\r\n' +
    'Review and trust all source/references before compiling: native designers and COM controls may run during compilation.\r\n' +
    'No compiler, runtime DLL, OCX, npm dependency or browser engine is bundled or installed.\r\n' +
    'The final EXE needs the 32-bit Microsoft VB6 runtime and its native dependencies; it does not need Node.\r\n' +
    'Build output is verified as a PE32 x86 EXE importing MSVBVM60.DLL, never executed by this tool.\r\n\r\n' +
    prepared.manifest.warnings.join('\r\n') + '\r\n';
  return {files, manifest: prepared.manifest};
}

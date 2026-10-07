import {createInterface} from 'node:readline/promises';
import {stdin, stdout} from 'node:process';
import {createClassicBridge} from './classic-bridge.mjs';

const args = process.argv.slice(2), options = {origins: []};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--help') {console.log('node tools/serve-classic.mjs --origin http://127.0.0.1:8080 [--compiler C:\...\VB6.EXE] [--port 8768] [--timeout 120000] [--allow-file-origin]\nRequires a licensed Windows VB6 installation. Every build requires local terminal approval.'); process.exit(0);}
  else if (args[i] === '--allow-file-origin') options.origins.push('null');
  else if (['--origin', '--compiler', '--port', '--timeout'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
    const key = args[i].slice(2), value = args[++i];
    if (key === 'origin') options.origins.push(value); else options[key] = ['port', 'timeout'].includes(key) ? Number(value) : value;
  } else throw new Error('Unknown or missing compiler bridge argument. Use --help.');
}
if (!stdin.isTTY) throw new Error('Run the compiler bridge in an interactive terminal; every build requires local approval.');
if (!options.origins.length) throw new Error('Configure the exact IDE origin with --origin, or explicitly allow file origins.');
const terminal = createInterface({input: stdin, output: stdout});
let bridge;
try {
  bridge = await createClassicBridge({...options, authorize: async (manifest, {signal}) => {
    console.log('\nCompile ' + JSON.stringify(manifest.name) + ' (' + manifest.codegen + ', x86 MSVBVM60.DLL).\nReferences: ' + JSON.stringify(manifest.references) + '\nCompilation may load registered COM/OCX designers. Only approve trusted projects. The resulting EXE will NOT be run.');
    try {return (await terminal.question('Type YES to compile: ', {signal: AbortSignal.any([signal, AbortSignal.timeout(60000)])})).trim() === 'YES';} catch {return false;}
  }});
  if (!bridge.available) throw new Error(bridge.reason);
  console.log('Microsoft VB6 compiler bridge: ' + bridge.url + '\nToken (memory only): ' + bridge.token + '\nApproved origins: ' + options.origins.join(', '));
} catch (error) {terminal.close(); await bridge?.close(); throw error;}
let closing = false;
const close = async () => {if (closing) return; closing = true; terminal.close(); await bridge.close();};
process.on('SIGINT', () => void close()); process.on('SIGTERM', () => void close()); terminal.on('close', () => void close());

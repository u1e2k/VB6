/** Interactive local bridge. No unattended approvals or execution of generated apps. */
import {createInterface} from 'node:readline/promises';
import {stdin, stdout} from 'node:process';
import {buildMacOSPackage} from './build-macos-native.mjs';
const args = process.argv.slice(2), options = {origins: []};
for (let i = 0; i < args.length; ++i) {
  const arg = args[i];
  if (arg === '--help') {console.log('node tools/serve-macos.mjs --origin http://127.0.0.1:8080 [--port 8769] [--timeout 600000] [--jobs 4] [--cache DIRECTORY] [--identity ID] [--allow-file-origin]\nRequires macOS and Xcode Command Line Tools. Each build requires terminal approval. Generated apps are never executed.'); process.exit(0);}
  if (arg === '--allow-file-origin') options.origins.push('null');
  else if (['--origin', '--port', '--timeout', '--jobs', '--cache', '--identity'].includes(arg) && args[i + 1] && !args[i + 1].startsWith('--')) {
    const key = arg.slice(2), value = args[++i];
    if (key === 'origin') options.origins.push(value); else options[key] = ['port', 'timeout', 'jobs'].includes(key) ? Number(value) : value;
  } else throw new Error('Unknown or missing compiler bridge argument. Use --help.');
}
if (!stdin.isTTY) throw new Error('Run the macOS compiler bridge in an interactive terminal; every build requires approval.');
if (!options.origins.length) throw new Error('Configure the exact IDE origin with --origin, or explicitly allow file origins.');
buildMacOSPackage();
const {createMacOSBridge} = await import('../packages/macos-native/src/bridge.mjs');
const terminal = createInterface({input: stdin, output: stdout}); let bridge;
try {
  bridge = await createMacOSBridge({...options, authorize: async (manifest, {signal}) => {
    console.log('\nCompile ' + JSON.stringify(manifest.name) + ' for macOS arm64/AppKit.\nModules: ' + manifest.modules + '; procedures: ' + manifest.procedures + '\nSource SHA-256: ' + manifest.sourceSha256 + '\nNative adapters: ' + JSON.stringify(manifest.imports) + '\nOnly approve trusted source. Compilation is not a sandbox. The resulting app will NOT be run.');
    try {return (await terminal.question('Type YES to compile: ', {signal})).trim() === 'YES';} catch {return false;}
  }});
  if (!bridge.available) throw new Error(bridge.reason);
  console.log('macOS compiler bridge: ' + bridge.url + '\nToken (memory only): ' + bridge.token + '\nApproved origins: ' + options.origins.join(', '));
} catch (error) {terminal.close(); await bridge?.close(); throw error;}
let closing = false;
const close = async () => {if (closing) return; closing = true; terminal.close(); await bridge.close();};
process.on('SIGINT', () => void close()); process.on('SIGTERM', () => void close()); terminal.on('close', () => void close());

/** Verify the downloaded bytes without repacking the app or dropping Unix modes. */
import {readZip} from '../../../src/project/zip.js';
import {inspectMachO} from './mach-o.js';
import {macOSOptions} from './target.js';
import {MACOS_LIMITS} from './protocol.js';
export async function sha256Bytes(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('Binary verification requires HTTPS or localhost with Web Crypto.');
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
function unixModes(bytes) {
  // Native output is bounded below 4 GiB. ZIP64 is unnecessary and is not emitted.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), decoder = new TextDecoder('utf-8', {fatal: true});
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); --i) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) {end = i; break;}
  }
  if (end < 0) throw new Error('Missing native ZIP directory.');
  const count = view.getUint16(end + 10, true); let at = view.getUint32(end + 16, true);
  const modes = new Map();
  for (let i = 0; i < count; ++i) {
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) throw new Error('Invalid native ZIP directory.');
    const n = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true);
    if (at + 46 + n + extra + comment > end) throw new Error('Truncated native ZIP metadata.');
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + n)), mode = view.getUint32(at + 38, true) >>> 16;
    if ((mode & 0o170000) === 0o120000) throw new Error('Symbolic links are not accepted in native application exports.');
    const key = name.normalize('NFD').toLowerCase();
    if (modes.has(key)) throw new Error('macOS-normalized filename collision in application archive.');
    modes.set(key, mode); at += 46 + n + extra + comment;
  }
  return modes;
}
const xml = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[c]));
export async function verifyMacOSAppArchive(input, options = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 22 || bytes.length > MACOS_LIMITS.archiveBytes) throw new Error('Invalid or excessive macOS application archive.');
  const o = macOSOptions(options), root = o.name + '.app/', executable = root + 'Contents/MacOS/' + o.name;
  const files = await readZip(bytes, {maxExpandedBytes: MACOS_LIMITS.expandedBytes, maxFiles: MACOS_LIMITS.files, filenameEncoding: 'utf-8'});
  const modes = unixModes(bytes);
  for (const name of files.keys()) {
    if (name.startsWith('__MACOSX/')) continue; // AppleDouble metadata is retained, never evaluated.
    if (name !== executable && name !== root + 'Contents/Info.plist' && name !== root + 'Contents/_CodeSignature/CodeResources' && !name.startsWith(root + 'Contents/Resources/')) {
      throw new Error('Unexpected application archive member: ' + name);
    }
  }
  const binary = files.get(executable), plistBytes = files.get(root + 'Contents/Info.plist');
  if (!binary || !plistBytes || plistBytes.length > 65536) throw new Error('Application executable or Info.plist is missing.');
  if (!(modes.get(executable.normalize('NFD').toLowerCase()) & 0o111)) throw new Error('Application ZIP does not preserve executable permissions.');
  const plist = new TextDecoder('utf-8', {fatal: true}).decode(plistBytes);
  for (const [key, value] of Object.entries({CFBundleExecutable: o.name, CFBundleIdentifier: o.bundleIdentifier, CFBundlePackageType: 'APPL'})) {
    if (plist.split('<key>' + key + '</key>').length !== 2 || !new RegExp('<key>' + key + '</key>\\s*<string>' + xml(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</string>').test(plist)) {
      throw new Error('Native bundle metadata does not match the requested ' + key + '.');
    }
  }
  const image = inspectMachO(binary);
  if (!image.signature || !image.pie || image.dylibs.some(name => !name.startsWith('/System/Library/') && !name.startsWith('/usr/lib/'))) {
    throw new Error('Native application must be PIE, contain a signature, and use only system dynamic libraries.');
  }
  const requested = o.minimumVersion.split('.').map(Number); while (requested.length < 3) requested.push(0);
  if (image.build.minimumVersion !== requested.join('.')) throw new Error('Native executable has the wrong deployment target.');
  return Object.freeze({artifact: 'native-executable', compiled: true, name: o.name, architecture: 'arm64', format: 'Mach-O', bytes: bytes.length,
    sha256: await sha256Bytes(bytes), executableBytes: binary.length, executableSha256: await sha256Bytes(binary), image,
    signaturePresent: true, browserSignatureCryptographicallyVerified: false, notarized: false});
}

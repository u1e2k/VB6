/** Structural protocol fixture only: NOT a runnable or cryptographically signed executable. */
import {writeZip} from '../src/project/zip.js';
import {macOSInfoPlist} from '../packages/macos-native/src/target.js';
export function macOSImageFixture() {
  const bytes = new Uint8Array(1024), view = new DataView(bytes.buffer);
  const u32 = (offset, n) => view.setUint32(offset, n, true);
  const u64 = (offset, n) => view.setBigUint64(offset, BigInt(n), true);
  u32(0, 0xfeedfacf); u32(4, 0x0100000c); u32(12, 2); u32(16, 4); u32(20, 136); u32(24, 0x200000);
  u32(32, 0x19); u32(36, 72); bytes.set(new TextEncoder().encode('__TEXT'), 40);
  u64(56, 0x100000000); u64(64, 0x4000); u64(72, 0); u64(80, bytes.length); u32(88, 5); u32(92, 5);
  u32(104, 0x32); u32(108, 24); u32(112, 1); u32(116, 0x0b0000); u32(120, 0x0f0500);
  u32(128, 0x80000028); u32(132, 24); u64(136, 512);
  u32(152, 0x1d); u32(156, 16); u32(160, 768); u32(164, 256);
  bytes.set(new TextEncoder().encode('SYNTHETIC NONEXECUTABLE TEST FIXTURE'), 512);
  return bytes;
}
export function fixtureZip(files, modeForName = () => 0o100644) {
  const bytes = writeZip(files), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22, count = view.getUint16(end + 10, true); let at = view.getUint32(end + 16, true);
  for (let i = 0; i < count; ++i) {
    const length = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + length));
    view.setUint16(at + 4, 0x0314, true); view.setUint32(at + 38, modeForName(name) * 65536, true);
    at += 46 + length + extra + comment;
  }
  return bytes;
}
export function macOSArchiveFixture(name = 'NativeFixture', changes = {}) {
  const root = name + '.app/Contents/', executable = root + 'MacOS/' + name;
  return fixtureZip({[executable]: macOSImageFixture(), [root + 'Info.plist']: macOSInfoPlist({name}),
    [root + '_CodeSignature/CodeResources']: 'STRUCTURAL TEST FIXTURE ONLY', ...changes}, path => path === executable ? 0o100755 : 0o100644);
}
export const fixtureProject = () => ({schema: 1, name: 'NativeFixture', startup: 'Sub Main', modules: [{name: 'MainModule', kind: 'module', code: 'Option Explicit\nPublic Sub Main()\n  Debug.Print "fixture"\nEnd Sub'}]});

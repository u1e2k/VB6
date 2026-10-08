/** Apple Silicon target contract. VB6 Long/handles stay 32 bit on the LP64 host. */
export const MACOS_TARGET = Object.freeze({
  id:'macos-arm64', architecture:'arm64', triple:'arm64-apple-macos11',
  format:'Mach-O', executableExtension:'', bundleExtension:'.app',
  minimumVersion:'11.0', pointerBytes:8, integerBytes:2, longBytes:4,
  booleanBytes:2, currencyBytes:8, stringEncoding:'UTF-16',
  codegen:'native-c++17', controls:'AppKit', runtime:'vb6-native',
  frameworks:Object.freeze(['AppKit','Foundation'])
});
export class MacOSCompileError extends Error {
  constructor(message, source='', line=0, code='MAC001') {
    super(`${source ? source+':'+line+': ' : ''}${message}`);
    this.name='MacOSCompileError';
    this.diagnostics=[{severity:'error',source,line,code,message}];
  }
}
export function macOSOptions(options={}) {
  if (!options || typeof options!=='object' || Array.isArray(options)) throw new TypeError('macOS options must be an object');
  const arch=options.arch??'arm64', optimization=Number(options.optimization??2),
    minimumVersion=String(options.minimumVersion??'11.0'), bundleIdentifier=options.bundleIdentifier??'org.vb6studio.application';
  if(arch!=='arm64')throw new MacOSCompileError('The macOS native target requires --arch arm64');
  if(!Number.isInteger(optimization)||optimization<0||optimization>3)throw new MacOSCompileError('optimization must be 0, 1, 2 or 3');
  if(!/^(?:1[1-9]|[2-9][0-9])\.(?:0|[1-9][0-9]?)(?:\.(?:0|[1-9][0-9]?))?$/.test(minimumVersion))throw new MacOSCompileError('minimumVersion must be a macOS version at least 11.0');
  if(typeof bundleIdentifier!=='string'||bundleIdentifier.length>200||!/^([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z0-9][A-Za-z0-9-]*$/.test(bundleIdentifier))throw new MacOSCompileError('Invalid reverse-DNS bundleIdentifier');
  const name=options.name??'Application';
  if(typeof name!=='string'||!name.length||name.length>100||name==='.'||name==='..'||/[\x00-\x1f\x7f/\\:]/.test(name)||name.startsWith('-'))throw new MacOSCompileError('Invalid macOS application name');
  const maxArrayElements=options.maxArrayElements??16777216, maxCallDepth=options.maxCallDepth??512;
  if(!Number.isSafeInteger(maxArrayElements)||maxArrayElements<1||maxArrayElements>67108864)throw new MacOSCompileError('maxArrayElements must be between 1 and 67108864');
  if(!Number.isSafeInteger(maxCallDepth)||maxCallDepth<1||maxCallDepth>4096)throw new MacOSCompileError('maxCallDepth must be between 1 and 4096');
  return Object.freeze({arch,optimization,minimumVersion,bundleIdentifier,name,maxArrayElements,maxCallDepth});
}
const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function macOSInfoPlist(options={}) {
  const o=macOSOptions(options);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n'+
    Object.entries({CFBundleExecutable:o.name,CFBundleName:o.name,CFBundleDisplayName:o.name,CFBundleIdentifier:o.bundleIdentifier,CFBundlePackageType:'APPL',CFBundleShortVersionString:'1.0.0',CFBundleVersion:'1',LSMinimumSystemVersion:o.minimumVersion,NSPrincipalClass:'NSApplication'}).map(([k,v])=>`<key>${k}</key><string>${xml(v)}</string>`).join('\n')+
    '\n<key>NSHighResolutionCapable</key><true/>\n</dict></plist>\n';
}

/** Shared browser/host contract for the real Microsoft VB6 compiler target.
 * Host paths, credentials and process arguments are deliberately not project data.
 */
export const CLASSIC_TARGET = 'classic-vb6';
export const CLASSIC_PROTOCOL = 1;
export const CLASSIC_CODEGEN = Object.freeze(['preserve', 'native', 'pcode']);
export const CLASSIC_LIMITS = Object.freeze({projectBytes: 20 * 1024 * 1024, executableBytes: 64 * 1024 * 1024, files: 10000});

export function classicProductName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 100 ||
      /[<>:"/\\|?*\x00-\x1f]/.test(value) || /[. ]$/.test(value) || /\.exe$/i.test(value) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) {
    throw new Error('Use a Windows-safe executable name (1–100 characters, without a path or .exe extension).');
  }
  return value;
}

export function normalizeClassicOptions(options = {}, defaultName = 'Project1') {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid classic build options.');
  for (const key of Object.keys(options)) {
    if (!['name', 'codegen'].includes(key)) throw new Error('Unsupported classic build option: ' + key);
  }
  const name = classicProductName(options.name ?? defaultName);
  const codegen = options.codegen ?? 'preserve';
  if (!CLASSIC_CODEGEN.includes(codegen)) throw new Error('Select preserve, native or pcode compilation.');
  return {name, codegen};
}

export function classicBridgeURL(endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/classic') {
    throw new Error('Use the local compiler bridge URL http://127.0.0.1:PORT/classic.');
  }
  return url.href;
}

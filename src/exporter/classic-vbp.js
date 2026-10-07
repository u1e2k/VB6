import {bytesOf, encodeNativeText, commentAt} from '../project/native-text.js';
import {classicProductName, CLASSIC_CODEGEN} from './classic-options.js';

// Map bytes one-to-one, not TextDecoder('latin1'), which actually means CP1252.
function rawText(input) {
  const bytes = bytesOf(input), parts = [];
  for (let i = 0; i < bytes.length; i += 8192) parts.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return parts.join('');
}
export function classicFields(text) {
  const entries = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (/^\s*\[/.test(line)) break;
    if (/^\s*[';]/.test(line)) continue;
    const match = line.match(/^\s*([^=]+?)\s*=\s*(.*)$/);
    if (match) {
      const comment = commentAt(match[2], true);
      entries.push({key: match[1], value: (comment < 0 ? match[2] : match[2].slice(0, comment)).trim()});
    }
  }
  return entries;
}
export function classicField(text, key) {
  const values = classicFields(text).filter(e => e.key.toLowerCase() === key.toLowerCase());
  if (values.length > 1) throw new Error('Duplicate VBP field: ' + key);
  return values[0]?.value.trim().replace(/^"|"$/g, '') || '';
}
/** Preserve every unmodified byte including unknown records and designer sections.
 * Only output settings are changed, in the staged copy, never in the IDE project.
 */
export function configureClassicVBP(input, name, codegen = 'preserve', encoding = 'windows-1252') {
  const text = rawText(input), type = classicField(text, 'Type').toLowerCase();
  if (!['exe', 'oleexe'].includes(type)) throw new Error('Classic target requires Type=Exe or Type=OleExe; DLL/OCX projects are not EXEs');
  classicProductName(name);
  if (!CLASSIC_CODEGEN.includes(codegen)) throw new Error('Invalid code generation mode');
  const page = new TextDecoder(encoding).encoding;
  if (/^utf-/i.test(page)) throw new Error('Microsoft VB6 requires an ANSI project code page.');
  const encodedName = rawText(encodeNativeText(name, {encoding: page}));
  const patch = new Map([['exename32', `ExeName32="${encodedName}.exe"`], ['path32', 'Path32="."'], ['autoincrementver', 'AutoIncrementVer=0']]);
  if (codegen !== 'preserve') patch.set('compilationtype', 'CompilationType=' + (codegen === 'native' ? 0 : 1));
  for (const key of patch.keys()) classicField(text, key);
  const lines = [], seen = new Set(); let section = false;
  const appendMissing = () => {for (const [key, value] of patch) if (!seen.has(key)) {lines.push(value); seen.add(key);}};
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!section && /^\s*\[/.test(line)) {appendMissing(); section = true;}
    const key = !section && line.match(/^\s*([^=]+?)\s*=/)?.[1].toLowerCase();
    if (key && patch.has(key)) {lines.push(patch.get(key)); seen.add(key);} else lines.push(line);
  }
  appendMissing();
  return Uint8Array.from(lines.join('\r\n'), character => character.charCodeAt(0));
}

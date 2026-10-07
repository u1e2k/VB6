/** Browser-safe, bounded picture input for the native compiler. No URLs are
 * fetched, no image is decoded while compiling, and unused assets are not read. */
export const MAX_NATIVE_PICTURE_BYTES = 16 * 1024 * 1024;
const signatures = [
  ['png',[137,80,78,71,13,10,26,10]], ['jpeg',[255,216,255]],
  ['gif',[71,73,70,56]], ['bmp',[66,77]], ['ico',[0,0,1,0]],
  ['tiff',[73,73,42,0]], ['tiff',[77,77,0,42]]
];
export function decodeNativePicture(value, assets = {}) {
  if (value === '' || value === null || value === undefined || value === 0) return null;
  if (typeof value !== 'string') throw new TypeError('Native picture must name a project asset or contain an image data URL');
  let encoded, name = value;
  if (/^data:/i.test(value)) {
    const match = value.match(/^data:image\/[\w.+-]+;base64,([A-Za-z0-9+/=\s]*)$/i);
    if (!match) throw new TypeError('Native picture requires a base64 image data URL');
    encoded = match[1]; name = 'inline picture';
  } else {
    const asset = Object.hasOwn(assets, value) ? assets[value] : null;
    if (!asset || asset.encoding !== 'base64' || typeof asset.data !== 'string') throw new TypeError('Missing native picture asset: ' + value);
    encoded = asset.data;
  }
  if (encoded.length > Math.ceil(MAX_NATIVE_PICTURE_BYTES / 3) * 4 + 4096) throw new RangeError('Native picture exceeds the 16 MiB input limit');
  encoded = encoded.replace(/\s/g, '');
  if (!encoded || encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new TypeError('Invalid native picture base64: ' + name);
  const text = atob(encoded);
  if (text.length > MAX_NATIVE_PICTURE_BYTES) throw new RangeError('Native picture exceeds the 16 MiB input limit');
  const bytes = Uint8Array.from(text, c => c.charCodeAt(0));
  const format = signatures.find(([,signature]) => signature.every((byte,i) => bytes[i] === byte))?.[0];
  if (!format) throw new TypeError('Native picture format is not supported; use PNG, JPEG, GIF, BMP, ICO or TIFF: ' + name);
  // Validate ICO directory bounds before passing an individual image to User32.
  // General image stream decoding is delegated to the system GDI+ codec.
  let icons;
  if (format === 'ico') {
    if (bytes.length < 6) throw new TypeError('Truncated native icon directory');
    const view = new DataView(bytes.buffer), count = view.getUint16(4,true);
    if (!count || count > 1024 || 6 + count * 16 > bytes.length) throw new TypeError('Invalid native icon directory');
    icons = Array.from({length:count}, (_,i) => {
      const offset = 6+i*16, length = view.getUint32(offset+8,true), start = view.getUint32(offset+12,true);
      if (!length || start < 6+count*16 || start > bytes.length || length > bytes.length-start) throw new TypeError('Native icon image is outside the resource');
      return Object.freeze({width:bytes[offset]||256,height:bytes[offset+1]||256,bits:view.getUint16(offset+6,true),offset:start,length});
    });
  }
  return Object.freeze({name,format,bytes,...(icons?{icons:Object.freeze(icons)}:{})});
}
export function selectNativeIcon(picture, width = 32, height = width) {
  if (picture?.format !== 'ico') throw new TypeError('Native Icon requires an ICO resource');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 256 || height > 256) throw new RangeError('Invalid native icon dimensions');
  return [...picture.icons].sort((a,b) => (Math.abs(a.width-width)+Math.abs(a.height-height))-(Math.abs(b.width-width)+Math.abs(b.height-height)) || b.bits-a.bits)[0];
}

// A real QR code as RGBA pixels, drawn from the payload with an independent encoder, for the decoding specs.
import qrcode from 'qrcode-generator';
import type { PixelImage } from '../commissioning/qrDecode';

export function qrPixels(text: string, scale = 6, quiet = 4): PixelImage {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const modules = qr.getModuleCount();
  const side = (modules + quiet * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (!qr.isDark(row, col)) continue;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const at = (((row + quiet) * scale + y) * side + (col + quiet) * scale + x) * 4;
          data[at] = data[at + 1] = data[at + 2] = 0;
        }
      }
    }
  }
  return { data, width: side, height: side };
}

/** A known `MT:` payload and the manual codes of the Matter specification's examples. */
export const QR_PAYLOAD = 'MT:Y.K9042C00KA0648G00';
export const MANUAL_11 = '34970112332';
export const MANUAL_21 = '749701123365521327694';

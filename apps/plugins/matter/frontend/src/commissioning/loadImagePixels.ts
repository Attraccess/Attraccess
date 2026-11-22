import type { PixelImage } from './qrDecode';

/** Longest edge the decoder gets: a phone photo is scaled down, which also makes decoding fast. */
const MAX_EDGE = 1600;

/** Reads an image file into pixels in memory, through a canvas. The file is never uploaded or stored. */
export async function loadImagePixels(file: Blob): Promise<PixelImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('No canvas available.');
    context.drawImage(bitmap, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  } finally {
    bitmap.close();
  }
}

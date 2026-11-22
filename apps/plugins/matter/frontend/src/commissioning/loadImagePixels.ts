import { ImageTooLargeError, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from './imageLimits';
import type { PixelImage } from './qrDecode';

/** Longest edge the decoder gets: a phone photo is scaled down, which also makes decoding fast. */
const MAX_EDGE = 1600;

/**
 * The size of a picture from its header, through an `<img>` that is never painted (browsers decode its pixels only for
 * painting). The object URL is revoked as soon as the size is known.
 */
function imageSize(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The image could not be read.'));
    };
    image.src = url;
  });
}

/**
 * Reads an image file into pixels in memory, through a canvas. The file is never uploaded or stored. A file above
 * MAX_IMAGE_BYTES or a picture above MAX_IMAGE_PIXELS is refused with `ImageTooLargeError` before it is decoded; any
 * other picture is decoded straight to at most MAX_EDGE pixels on its long edge where the browser can resize while
 * decoding.
 */
export async function loadImagePixels(file: Blob): Promise<PixelImage> {
  if (file.size > MAX_IMAGE_BYTES) throw new ImageTooLargeError();
  const size = await imageSize(file);
  if (size.width * size.height > MAX_IMAGE_PIXELS) throw new ImageTooLargeError();
  const scale = Math.min(1, MAX_EDGE / Math.max(size.width, size.height, 1));
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  // A browser without the resize options ignores them and decodes at full size; drawImage scales then.
  const bitmap = await createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'medium' });
  try {
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

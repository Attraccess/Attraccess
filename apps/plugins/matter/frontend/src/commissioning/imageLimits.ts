/** A picture larger than this is refused before it is read: a QR code needs nothing near it. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** A picture with more pixels than this is refused before it is decoded (a 9000 × 9000 picture would need 324 MB). */
export const MAX_IMAGE_PIXELS = 40_000_000;

/** The picture is too large to be read safely in the browser. Nothing was decoded. */
export class ImageTooLargeError extends Error {
  constructor() {
    super('The image is too large.');
    this.name = 'ImageTooLargeError';
  }
}

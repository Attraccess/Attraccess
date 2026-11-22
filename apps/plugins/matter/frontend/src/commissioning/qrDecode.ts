export interface PixelImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Decodes the first QR code in an RGBA image. Runs in memory: the picture is never sent anywhere. jsQR is loaded on
 * first use, so it is not part of the page's main chunk. `inversion` `normal` looks only for dark-on-light codes,
 * which halves the work for camera frames; a picture is also tried inverted.
 */
export async function decodeQrFromPixels(
  image: PixelImage,
  inversion: 'normal' | 'both' = 'both',
): Promise<string | null> {
  const { default: jsQR } = await import('jsqr');
  const inversionAttempts = inversion === 'normal' ? 'dontInvert' : 'attemptBoth';
  return jsQR(image.data, image.width, image.height, { inversionAttempts })?.data ?? null;
}

/** The scanner and the image reader may hand over a text around the payload; only the setup code is kept. */
export function setupCodeFromScan(text: string): string {
  const match = /MT:[A-Z0-9.-]+/i.exec(text);
  return match ? match[0] : text.trim();
}

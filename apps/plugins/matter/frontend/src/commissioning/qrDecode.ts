import jsQR from 'jsqr';

export interface PixelImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Decodes the first QR code in an RGBA image. Runs in memory: the picture is never sent anywhere. */
export function decodeQrFromPixels(image: PixelImage): string | null {
  return jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

/** The scanner and the image reader may hand over a text around the payload; only the setup code is kept. */
export function setupCodeFromScan(text: string): string {
  const match = /MT:[A-Z0-9.-]+/i.exec(text);
  return match ? match[0] : text.trim();
}

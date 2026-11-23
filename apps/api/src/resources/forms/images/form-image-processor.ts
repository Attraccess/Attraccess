import { BadRequestException } from '@nestjs/common';
import { FORM_IMAGE_MAX_EDGE } from '@attraccess/application-models';
import sharp from 'sharp';

/** What is accepted as input; the decoder decides, not the declared MIME type. */
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
/** 50 megapixels: more than any phone camera, and a bound on the memory one decode takes. */
const MAX_INPUT_PIXELS = 50_000_000;
const JPEG_QUALITY = 85;
/** Images processed at the same time; the rest wait, so a few uploads cannot take every libuv thread or the RAM. */
export const FORM_IMAGE_PROCESSING_SLOTS = 2;

// Uploads are processed once each: sharp's operation cache would only hold memory.
sharp.cache(false);

/** A counting semaphore: at most `slots` tasks run at once, the others wait in order. */
export function limitConcurrency(slots: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running >= slots) await new Promise<void>((resolve) => waiting.push(resolve));
    else running += 1;
    try {
      return await task();
    } finally {
      // The slot passes straight to the next waiter, so `running` only drops when nobody waits.
      const next = waiting.shift();
      if (next) next();
      else running -= 1;
    }
  };
}

const processingSlot = limitConcurrency(FORM_IMAGE_PROCESSING_SLOTS);

export interface ProcessedFormImage {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
}

/**
 * Turns an uploaded photo into what is stored: upright by its EXIF orientation, stripped of all metadata (GPS
 * included), at most {@link FORM_IMAGE_MAX_EDGE} px on the long edge, as JPEG. Anything that does not decode as a
 * JPEG, PNG or WebP image is rejected.
 */
export function processFormImage(input: Buffer): Promise<ProcessedFormImage> {
  return processingSlot(() => processNow(input));
}

async function processNow(input: Buffer): Promise<ProcessedFormImage> {
  try {
    const source = sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS });
    const { format } = await source.metadata();
    if (!format || !ACCEPTED_FORMATS.has(format)) {
      throw new BadRequestException('The file is not a JPEG, PNG or WebP image.');
    }
    // No withMetadata(): sharp then drops EXIF, XMP, IPTC and ICC data. rotate() applies the orientation first.
    const { data, info } = await source
      .rotate()
      .resize({ width: FORM_IMAGE_MAX_EDGE, height: FORM_IMAGE_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height, mimeType: 'image/jpeg' };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('The file is not a readable JPEG, PNG or WebP image.');
  }
}

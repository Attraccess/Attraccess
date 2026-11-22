import { BadRequestException } from '@nestjs/common';
import { FORM_IMAGE_MAX_EDGE } from '@attraccess/application-models';
import sharp from 'sharp';

/** What is accepted as input; the decoder decides, not the declared MIME type. */
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const MAX_INPUT_PIXELS = 100_000_000;
const JPEG_QUALITY = 85;

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
export async function processFormImage(input: Buffer): Promise<ProcessedFormImage> {
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

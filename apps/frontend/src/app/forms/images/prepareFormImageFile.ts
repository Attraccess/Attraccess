import { FORM_IMAGE_MAX_EDGE } from '@attraccess/application-models';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '../../../components/imageUpload';
import { processImageWithAutoScale } from '../../../components/imageUpload/imageProcessing';
import { ImageUploadProblemError } from './imageUploadProblem';

const isAllowedType = (type: string) => (ALLOWED_MIME_TYPES as readonly string[]).includes(type);

/**
 * Checks a picked photo before it is uploaded. A JPEG, PNG or WebP over the size limit (a phone camera photo, often)
 * is shrunk in the browser first; anything else goes up as it is, since the server processes every image anyway.
 */
export async function prepareFormImageFile(file: File): Promise<File> {
  if (!isAllowedType(file.type)) throw new ImageUploadProblemError({ kind: 'type' });
  if (file.size <= MAX_FILE_SIZE) return file;

  let scaled: File;
  try {
    scaled = await processImageWithAutoScale(file, {
      maxWidth: FORM_IMAGE_MAX_EDGE,
      maxHeight: FORM_IMAGE_MAX_EDGE,
      maxBytes: MAX_FILE_SIZE,
      output: 'jpeg',
    });
  } catch {
    throw new ImageUploadProblemError({ kind: 'size' });
  }
  if (scaled.size > MAX_FILE_SIZE) throw new ImageUploadProblemError({ kind: 'size' });
  return scaled;
}

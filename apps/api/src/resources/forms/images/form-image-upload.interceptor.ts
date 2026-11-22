import {
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  type Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ApiBodyOptions } from '@nestjs/swagger';
import { StorageEnvSchema } from '../../../config/storage.config';
import { FileUploadValidationError } from '../../../common/errors/file-upload-validation.error';

/** The multipart field the image comes in. */
export const FORM_IMAGE_FIELD = 'image';

/** The multipart body of an image upload, for the API description. */
export const FORM_IMAGE_BODY: ApiBodyOptions = {
  schema: {
    type: 'object',
    required: [FORM_IMAGE_FIELD],
    properties: { [FORM_IMAGE_FIELD]: { type: 'string', format: 'binary' } },
  },
};

/**
 * Reads one image from the multipart body. An oversize file is a 400 like the other upload errors (multer's own
 * answer would be a 413), and it is cut off while it streams in, so it never fills the memory.
 */
export function FormImageUploadInterceptor(): Type<NestInterceptor> {
  const maxBytes = StorageEnvSchema.parse(process.env).MAX_FILE_SIZE_BYTES;
  const Multer = FileInterceptor(FORM_IMAGE_FIELD, { limits: { fileSize: maxBytes, files: 1 } });
  class FormImageUpload implements NestInterceptor {
    private readonly multer = new Multer();

    async intercept(context: ExecutionContext, next: CallHandler) {
      try {
        return await this.multer.intercept(context, next);
      } catch (error) {
        if (error instanceof PayloadTooLargeException) {
          throw new FileUploadValidationError(`File size exceeds maximum allowed size of ${maxBytes} bytes`);
        }
        throw error;
      }
    }
  }
  return FormImageUpload;
}

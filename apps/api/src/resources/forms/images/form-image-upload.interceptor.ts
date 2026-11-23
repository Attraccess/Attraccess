import {
  BadRequestException,
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
 * What a body may hold besides the one image: nothing. The parser stops at the first other field or part, so a body
 * full of form fields is refused before any of it is kept (the public phone endpoints read it before they check the
 * token).
 */
export const formImageUploadLimits = (maxBytes: number) => ({
  fileSize: maxBytes,
  files: 1,
  fields: 0,
  fieldSize: 1024,
  fieldNameSize: 100,
  parts: 1,
  headerPairs: 20,
});

/**
 * Reads one image from the multipart body. Every refusal of the parser is a 400 FileUploadValidationError like the
 * other upload errors (an oversize file would be a 413 from multer); an oversize file is cut off while it streams in,
 * so it never fills the memory.
 */
export function FormImageUploadInterceptor(): Type<NestInterceptor> {
  const maxBytes = StorageEnvSchema.parse(process.env).MAX_FILE_SIZE_BYTES;
  const Multer = FileInterceptor(FORM_IMAGE_FIELD, { limits: formImageUploadLimits(maxBytes) });
  class FormImageUpload implements NestInterceptor {
    private readonly multer = new Multer();

    async intercept(context: ExecutionContext, next: CallHandler) {
      try {
        return await this.multer.intercept(context, next);
      } catch (error) {
        if (error instanceof PayloadTooLargeException) {
          throw new FileUploadValidationError(`File size exceeds maximum allowed size of ${maxBytes} bytes`);
        }
        if (error instanceof BadRequestException) {
          throw new FileUploadValidationError(error.message);
        }
        const code = (error as { code?: unknown } | null)?.code;
        if (typeof code === 'string' && code.startsWith('LIMIT_')) {
          throw new FileUploadValidationError((error as Error).message);
        }
        throw error;
      }
    }
  }
  return FormImageUpload;
}

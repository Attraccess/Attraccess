import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ReadStream } from 'fs';
import {
  FormFieldType,
  ResourceFormAction,
  type FormImageRecord,
  type FormRecord,
  type FormFieldRecord,
} from '@attraccess/application-models';
import { ConfigService } from '@nestjs/config';
import { FileUploadValidationError } from '../../../common/errors/file-upload-validation.error';
import type { FileUpload } from '../../../common/types/file-upload.types';
import type { StorageConfigType } from '../../../config/storage.config';
import { ResourceFormsService } from '../forms.service';
import { FormImageDto } from './form-image.dto';
import { FormImageFileStorage } from './form-image-file-storage';
import { processFormImage } from './form-image-processor';
import { FORM_IMAGE_STORE, type FormImageStore } from './form-image-store.port';

/** Who looks at an image. */
export interface FormImageViewer {
  id: number;
  mayViewAll: boolean;
}

/** The context an image is uploaded for. */
export interface FormImageTarget {
  formId: number;
  fieldId: number;
  /** The user the image is for. */
  userId: number;
  /** Set for uploads by a signed-in user; null for reader handoff uploads. */
  uploadedByUserId: number | null;
  handoffId: string | null;
}

export const toImageDto = (image: FormImageRecord): FormImageDto => ({
  id: image.id,
  width: image.width,
  height: image.height,
});

/** Uploads, serves and deletes the processed images of image form fields (ATT-879). */
@Injectable()
export class FormImagesService {
  private readonly maxFileSize: number;
  private readonly allowedMimeTypes: readonly string[];

  constructor(
    @Inject(FORM_IMAGE_STORE) private readonly store: FormImageStore,
    private readonly files: FormImageFileStorage,
    private readonly forms: ResourceFormsService,
    configService: ConfigService,
  ) {
    const storage = configService.get<StorageConfigType>('storage');
    if (!storage) throw new Error("Storage configuration ('storage') not found. Check ConfigModule setup.");
    this.maxFileSize = storage.maxFileSize;
    this.allowedMimeTypes = storage.allowedMimeTypes;
  }

  /** The image field a signed-in user uploads to: of a form the action requires on the resource. */
  resolveField(resourceId: number, action: ResourceFormAction, formId: number, fieldId: number) {
    return this.forms.resolveImageField(resourceId, action, formId, fieldId);
  }

  /** Processes and stores an uploaded image for the target field. */
  async save(file: FileUpload | undefined, target: FormImageTarget): Promise<FormImageDto> {
    if (!file?.buffer) {
      throw new BadRequestException('Send the image in the "image" field of a multipart body.');
    }
    if (file.size > this.maxFileSize) {
      throw new FileUploadValidationError(`File size exceeds maximum allowed size of ${this.maxFileSize} bytes`);
    }
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new FileUploadValidationError(
        `File type ${file.mimetype} is not allowed. Allowed types: ${this.allowedMimeTypes.join(', ')}`,
      );
    }
    const processed = await processFormImage(file.buffer);
    const id = randomUUID();
    const filename = `${id}.jpg`;
    await this.files.write(filename, processed.buffer);
    try {
      const saved = await this.store.insertImage({
        id,
        ...target,
        mimeType: processed.mimeType,
        size: processed.buffer.length,
        width: processed.width,
        height: processed.height,
        filename,
      });
      return toImageDto(saved);
    } catch (error) {
      await this.files.remove(filename);
      throw error;
    }
  }

  /** Uploads an image for the signed-in user. */
  async upload(
    file: FileUpload | undefined,
    where: { resourceId: number; action: ResourceFormAction; formId: number; fieldId: number },
    userId: number,
  ): Promise<FormImageDto> {
    const { form, field } = await this.resolveField(where.resourceId, where.action, where.formId, where.fieldId);
    this.assertImageField(form, field);
    return this.save(file, {
      formId: form.id,
      fieldId: field.id,
      userId,
      uploadedByUserId: userId,
      handoffId: null,
    });
  }

  private assertImageField(form: FormRecord, field: FormFieldRecord): void {
    if (field.type !== FormFieldType.IMAGE || field.formId !== form.id) {
      throw new BadRequestException('Not an image field.');
    }
  }

  /**
   * The image file for a viewer. Everyone but the submission's user, a user who may view all submissions, and the
   * uploader of a not yet attached image gets 404, so ids cannot be probed.
   */
  async openForViewer(
    imageId: string,
    viewer: FormImageViewer,
  ): Promise<{ stream: ReadStream; image: FormImageRecord }> {
    const found = await this.store.findImageWithOwner(imageId);
    if (!found) throw new NotFoundException('Image not found');
    const { image, submissionUserId } = found;
    const allowed =
      viewer.mayViewAll || (image.submissionId !== null ? submissionUserId === viewer.id : image.userId === viewer.id);
    if (!allowed) throw new NotFoundException('Image not found');
    return { image, stream: await this.files.open(image.filename) };
  }

  /** The file of an image, for a caller that already proved access (a handoff holder). */
  async open(image: FormImageRecord): Promise<ReadStream> {
    return this.files.open(image.filename);
  }

  /** Deletes the image row and its file. */
  async remove(image: FormImageRecord): Promise<void> {
    await this.store.deleteImage(image.id);
    await this.files.remove(image.filename);
  }
}

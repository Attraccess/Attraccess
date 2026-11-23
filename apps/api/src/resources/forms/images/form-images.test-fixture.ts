import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { FormFieldType, ResourceFormAction } from '@attraccess/application-models';
import type { FileUpload } from '../../../common/types/file-upload.types';
import { FormImageFileStorage } from './form-image-file-storage';
import { FormImagesService } from './form-images.service';
import { InMemoryFormImageStore } from './form-image-store.test-fixture';
import { FormImageHandoffService } from './form-image-handoff.service';
import { FormImageCleanupService } from './form-image-cleanup.service';

export const RESOURCE_ID = 7;
export const FORM_ID = 3;
export const FIELD_ID = 11;
export const USER_ID = 5;
export const READER_ID = 2;

const imageField = {
  id: FIELD_ID,
  formId: FORM_ID,
  name: 'Damage photo',
  type: FormFieldType.IMAGE,
  isRequired: true,
  description: 'Show the damage',
  position: 0,
  options: { maxImages: 2 },
};

/** A real JPEG as a multer upload. */
export async function jpegUpload(overrides: Partial<FileUpload> = {}): Promise<FileUpload> {
  const buffer = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#336699' } })
    .jpeg()
    .toBuffer();
  return {
    fieldname: 'image',
    originalname: 'photo.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    buffer,
    size: buffer.length,
    ...overrides,
  };
}

/** The image services on an in-memory store and a temporary directory. */
export function createImageServices(options: { appUrl?: string | null; field?: Partial<typeof imageField> } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'form-images-'));
  const cdnRoot = path.join(root, 'cdn');
  const config = {
    get: () => ({
      root,
      maxFileSize: 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      cdn: { root: cdnRoot, serveRoot: '/cdn' },
    }),
  };
  const store = new InMemoryFormImageStore();
  const field = { ...imageField, ...options.field };
  const form = { id: FORM_ID, name: 'Check-in', fields: [field] };
  const forms = {
    resolveImageField: jest.fn(
      async (resourceId: number, action: ResourceFormAction, formId: number, fieldId: number) => {
        if (resourceId !== RESOURCE_ID || formId !== FORM_ID || action !== ResourceFormAction.START) {
          throw new Error('not required');
        }
        if (fieldId !== FIELD_ID) throw new Error('no such field');
        return { form, field, resourceName: 'Laser' };
      },
    ),
  };
  const files = new FormImageFileStorage(config as never);
  const images = new FormImagesService(store, files, forms as never, config as never);
  const settings = {
    getUrl: jest.fn().mockResolvedValue(options.appUrl === undefined ? 'https://app.example/' : options.appUrl),
  };
  const handoffs = new FormImageHandoffService(store, forms as never, images, settings as never);
  const cleanup = new FormImageCleanupService(store, files);
  return { root, cdnRoot, store, forms, files, images, handoffs, cleanup, settings };
}

export const handoffKey = {
  readerId: READER_ID,
  userId: USER_ID,
  resourceId: RESOURCE_ID,
  action: ResourceFormAction.START,
  formId: FORM_ID,
  fieldId: FIELD_ID,
};

export const listFiles = (root: string) => {
  const directory = path.join(root, 'form-images');
  return fs.existsSync(directory) ? fs.readdirSync(directory) : [];
};

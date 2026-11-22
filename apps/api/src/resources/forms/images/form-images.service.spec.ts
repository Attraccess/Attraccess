import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import sharp from 'sharp';
import { ResourceFormAction } from '@attraccess/application-models';
import {
  FIELD_ID,
  FORM_ID,
  RESOURCE_ID,
  USER_ID,
  createImageServices,
  jpegUpload,
  listFiles,
} from './form-images.test-fixture';

const where = { resourceId: RESOURCE_ID, action: ResourceFormAction.START, formId: FORM_ID, fieldId: FIELD_ID };

describe('FormImagesService', () => {
  describe('upload', () => {
    it('stores a processed JPEG under the private directory and returns id and size', async () => {
      const { images, store, root, cdnRoot } = createImageServices();

      const result = await images.upload(await jpegUpload(), where, USER_ID);

      expect(result).toEqual({ id: expect.any(String), width: 64, height: 48 });
      const record = store.images.get(result.id);
      expect(record).toMatchObject({
        userId: USER_ID,
        uploadedByUserId: USER_ID,
        handoffId: null,
        submissionId: null,
        formId: FORM_ID,
        fieldId: FIELD_ID,
        mimeType: 'image/jpeg',
      });
      expect(listFiles(root)).toEqual([record?.filename]);
      // Nothing of it is under the publicly served CDN tree.
      expect(path.resolve(root, 'form-images').startsWith(path.resolve(cdnRoot) + path.sep)).toBe(false);
    });

    it('strips the metadata of what it stores', async () => {
      const { images, store, root } = createImageServices();
      const buffer = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#000' } })
        .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '52/1 30/1 0/1' } })
        .jpeg()
        .toBuffer();

      const { id } = await images.upload(await jpegUpload({ buffer, size: buffer.length }), where, USER_ID);

      const stored = await sharp(path.join(root, 'form-images', store.images.get(id)?.filename ?? '')).metadata();
      expect(stored.exif).toBeUndefined();
    });

    it('rejects anything that is not an image, a disallowed type and an oversize file with 400', async () => {
      const { images, store, root } = createImageServices();

      const text = Buffer.from('hello');
      await expect(
        images.upload(await jpegUpload({ buffer: text, size: text.length }), where, USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(images.upload(await jpegUpload({ mimetype: 'image/gif' }), where, USER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(images.upload(await jpegUpload({ size: 1024 * 1024 + 1 }), where, USER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(images.upload(undefined, where, USER_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(store.images.size).toBe(0);
      expect(listFiles(root)).toEqual([]);
    });

    it('refuses a field that is not an image field and a form that does not apply', async () => {
      const textField = createImageServices({ field: { type: 'text' as never } });
      await expect(textField.images.upload(await jpegUpload(), where, USER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      const { images, store } = createImageServices();
      await expect(
        images.upload(await jpegUpload(), { ...where, action: ResourceFormAction.END }, USER_ID),
      ).rejects.toThrow('not required');
      await expect(images.upload(await jpegUpload(), { ...where, fieldId: 99 }, USER_ID)).rejects.toThrow(
        'no such field',
      );
      expect(store.images.size).toBe(0);
    });

    it('removes the file again when the row cannot be saved', async () => {
      const { images, store, root } = createImageServices();
      jest.spyOn(store, 'insertImage').mockRejectedValue(new Error('db down'));

      await expect(images.upload(await jpegUpload(), where, USER_ID)).rejects.toThrow('db down');

      expect(listFiles(root)).toEqual([]);
    });
  });

  describe('openForViewer', () => {
    const OTHER = 99;

    async function stored() {
      const services = createImageServices();
      const { id } = await services.images.upload(await jpegUpload(), where, USER_ID);
      return { ...services, id };
    }

    it('lets the uploader preview an image that is not attached yet, and nobody else', async () => {
      const { images, id } = await stored();

      await expect(images.openForViewer(id, { id: USER_ID, mayViewAll: false })).resolves.toMatchObject({
        image: { id },
      });
      await expect(images.openForViewer(id, { id: OTHER, mayViewAll: false })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lets the submission’s user and users who may update resources see an attached image', async () => {
      const { images, store, id } = await stored();
      (store.images.get(id) as { submissionId: number }).submissionId = 40;
      store.submissionUsers.set(40, USER_ID);

      await expect(images.openForViewer(id, { id: USER_ID, mayViewAll: false })).resolves.toBeDefined();
      await expect(images.openForViewer(id, { id: OTHER, mayViewAll: true })).resolves.toBeDefined();
      await expect(images.openForViewer(id, { id: OTHER, mayViewAll: false })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('answers an unknown id like a forbidden one', async () => {
      const { images } = await stored();
      await expect(
        images.openForViewer('3f2b6c1e-8a4d-4b7e-9c11-2d5e7f8a9b01', { id: USER_ID, mayViewAll: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is a 404 when the file is gone', async () => {
      const { images, files, store, id } = await stored();
      await files.remove(store.images.get(id)?.filename ?? '');
      await expect(images.openForViewer(id, { id: USER_ID, mayViewAll: false })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

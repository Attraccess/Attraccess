import { GoneException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { FORM_IMAGE_HANDOFF_TTL_MS } from '@attraccess/application-models';
import type { StoredFormImage } from './form-image-store.port';
import { createImageServices, handoffKey, jpegUpload, listFiles } from './form-images.test-fixture';

const FIELD_OPTIONS = { maxImages: 2 };
const T0 = new Date();
const later = (ms: number) => new Date(T0.getTime() + ms);

describe('FormImageHandoffService', () => {
  describe('openForReader', () => {
    it('issues a short token, stores only its hash and builds the link from the app URL', async () => {
      const { handoffs, store } = createImageServices();

      const view = await handoffs.openForReader(handoffKey, FIELD_OPTIONS, undefined, T0);

      expect(view.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
      expect(view.handoffUrl).toBe(`https://app.example/form-photo/${view.token}`);
      expect(view).toMatchObject({ imageCount: 0, maxImages: 2 });
      const stored = store.handoffs.get(view.handoffId);
      expect(stored?.tokenHash).toBe(createHash('sha256').update(view.token).digest('hex'));
      expect(JSON.stringify([...store.handoffs.values()])).not.toContain(view.token);
      expect(stored).toMatchObject({ ...handoffKey, maxImages: 2, uploadCount: 0, endedAt: null });
      expect(stored?.expiresAt).toEqual(later(FORM_IMAGE_HANDOFF_TTL_MS));
    });

    it('keeps the same link while it is valid and the reader remembers it', async () => {
      const { handoffs, store } = createImageServices();
      const first = await handoffs.openForReader(handoffKey, FIELD_OPTIONS, undefined, T0);

      const again = await handoffs.openForReader(handoffKey, FIELD_OPTIONS, first, later(60_000));

      expect(again.token).toBe(first.token);
      expect(store.handoffs.size).toBe(1);
    });

    it('issues a fresh link after it expired and carries images and upload count over', async () => {
      const { handoffs, store } = createImageServices();
      const first = await handoffs.openForReader(handoffKey, FIELD_OPTIONS, undefined, T0);
      const photo = await handoffs.upload(first.token, await jpegUpload());

      const fresh = await handoffs.openForReader(
        handoffKey,
        FIELD_OPTIONS,
        first,
        later(FORM_IMAGE_HANDOFF_TTL_MS + 1000),
      );

      expect(fresh.token).not.toBe(first.token);
      expect(fresh.imageCount).toBe(1);
      expect(await handoffs.imageIds(fresh.handoffId)).toEqual([photo.id]);
      expect(store.handoffs.get(fresh.handoffId)?.uploadCount).toBe(1);
      expect(store.handoffs.get(first.handoffId)?.endedAt).not.toBeNull();
    });

    it('issues a fresh link when the reader lost its token, so the old one stops working', async () => {
      const { handoffs } = createImageServices();
      const first = await handoffs.openForReader(handoffKey, FIELD_OPTIONS, undefined, T0);

      const fresh = await handoffs.openForReader(handoffKey, FIELD_OPTIONS, undefined, later(1000));

      expect(fresh.token).not.toBe(first.token);
      await expect(handoffs.resolve(first.token, later(2000))).rejects.toBeInstanceOf(GoneException);
    });

    it('cannot issue a link without a public app URL', async () => {
      const { handoffs } = createImageServices({ appUrl: null });
      await expect(handoffs.canIssue()).resolves.toBe(false);
    });
  });

  describe('token lifecycle', () => {
    it('is gone after 15 minutes', async () => {
      const { handoffs } = createImageServices();
      const { token } = await handoffs.openForReader(handoffKey, FIELD_OPTIONS, undefined, T0);

      await expect(handoffs.resolve(token, later(FORM_IMAGE_HANDOFF_TTL_MS - 1))).resolves.toBeDefined();
      await expect(handoffs.resolve(token, later(FORM_IMAGE_HANDOFF_TTL_MS))).rejects.toBeInstanceOf(GoneException);
    });

    it('is gone once the reader ended the attempt, for one resource and action or for the whole reader', async () => {
      const { handoffs } = createImageServices();
      const submitted = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);
      await handoffs.endForReader(handoffKey.readerId, {
        resourceId: handoffKey.resourceId,
        action: handoffKey.action,
      });
      await expect(handoffs.resolve(submitted.token)).rejects.toBeInstanceOf(GoneException);

      const signedOut = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);
      await handoffs.endForReader(handoffKey.readerId);
      await expect(handoffs.resolve(signedOut.token)).rejects.toBeInstanceOf(GoneException);
    });

    it('leaves the links of another resource alone when one attempt ends', async () => {
      const { handoffs } = createImageServices();
      const view = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);
      await handoffs.endForReader(handoffKey.readerId, { resourceId: 999, action: handoffKey.action });
      await expect(handoffs.resolve(view.token)).resolves.toBeDefined();
    });

    it('is used up after maxImages uploads', async () => {
      const { handoffs } = createImageServices();
      const { token } = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);

      await handoffs.upload(token, await jpegUpload());
      await handoffs.upload(token, await jpegUpload());

      await expect(handoffs.upload(token, await jpegUpload())).rejects.toBeInstanceOf(GoneException);
    });

    it('still shows and removes its photos once used up, and a removed photo makes room for another', async () => {
      const { handoffs } = createImageServices();
      const { token } = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);
      const first = await handoffs.upload(token, await jpegUpload());
      await handoffs.upload(token, await jpegUpload());

      await expect(handoffs.page(token)).resolves.toMatchObject({ uploadsRemaining: 0 });
      await handoffs.removeImage(token, first.id);

      await expect(handoffs.page(token)).resolves.toMatchObject({ uploadsRemaining: 1 });
      await expect(handoffs.upload(token, await jpegUpload())).resolves.toBeDefined();
    });

    it.each(['', 'short', 'x'.repeat(200), '../../etc/passwd', 'not-a-real-token-but-long-enough!'])(
      'treats the unknown token %p as gone',
      async (token) => {
        const { handoffs } = createImageServices();
        await expect(handoffs.page(token)).rejects.toBeInstanceOf(GoneException);
      },
    );
  });

  describe('through the token', () => {
    it('shows the page: resource, form, field, limits and the images so far', async () => {
      const { handoffs } = createImageServices();
      const { token } = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);
      const photo = await handoffs.upload(token, await jpegUpload());

      await expect(handoffs.page(token)).resolves.toMatchObject({
        resourceName: 'Laser',
        formName: 'Check-in',
        fieldName: 'Damage photo',
        maxImages: 2,
        uploadsRemaining: 1,
        images: [photo],
      });
    });

    it('stores uploads for the handoff’s user, without an uploader, and counts them', async () => {
      const { handoffs, store } = createImageServices();
      const view = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);

      const photo = await handoffs.upload(view.token, await jpegUpload());

      expect(store.images.get(photo.id)).toMatchObject({
        userId: handoffKey.userId,
        uploadedByUserId: null,
        handoffId: view.handoffId,
      });
      expect(store.handoffs.get(view.handoffId)?.uploadCount).toBe(1);
    });

    it('gives the upload back when the image is rejected, so a bad file does not burn the limit', async () => {
      const { handoffs, store } = createImageServices();
      const view = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);
      const text = Buffer.from('nope');

      await expect(handoffs.upload(view.token, await jpegUpload({ buffer: text, size: 4 }))).rejects.toThrow();

      expect(store.handoffs.get(view.handoffId)?.uploadCount).toBe(0);
    });

    it('reaches only the images uploaded under its own token', async () => {
      const { handoffs, images, store } = createImageServices();
      const mine = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);
      const other = await handoffs.openForReader({ ...handoffKey, readerId: 3, userId: 8 }, FIELD_OPTIONS);
      const foreign = await handoffs.upload(other.token, await jpegUpload());
      const direct = await images.upload(
        await jpegUpload(),
        {
          resourceId: handoffKey.resourceId,
          action: handoffKey.action,
          formId: handoffKey.formId,
          fieldId: handoffKey.fieldId,
        },
        handoffKey.userId,
      );

      for (const id of [foreign.id, direct.id]) {
        await expect(handoffs.openImage(mine.token, id)).rejects.toBeInstanceOf(NotFoundException);
        await expect(handoffs.removeImage(mine.token, id)).rejects.toBeInstanceOf(NotFoundException);
      }
      expect(store.images.has(foreign.id)).toBe(true);
      expect(store.images.has(direct.id)).toBe(true);
    });

    it('removes an image and its file while the link is valid', async () => {
      const { handoffs, store, root } = createImageServices();
      const { token, handoffId } = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);
      const photo = await handoffs.upload(token, await jpegUpload());
      expect(listFiles(root)).toHaveLength(1);

      await handoffs.removeImage(token, photo.id);

      expect(store.images.size).toBe(0);
      expect(listFiles(root)).toEqual([]);
      expect(await handoffs.imageIds(handoffId)).toEqual([]);
    });

    it('stops working when the form no longer applies', async () => {
      const { handoffs, forms } = createImageServices();
      const { token } = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);
      forms.resolveImageField.mockRejectedValue(new Error('gone'));

      await expect(handoffs.page(token)).rejects.toBeInstanceOf(GoneException);
      await expect(handoffs.upload(token, await jpegUpload())).rejects.toBeInstanceOf(GoneException);
    });
  });

  describe('races', () => {
    it('frees the upload slot once when the same photo is deleted twice', async () => {
      const { handoffs, store } = createImageServices();
      const { token, handoffId } = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);
      const first = await handoffs.upload(token, await jpegUpload());
      await handoffs.upload(token, await jpegUpload());
      const image = store.images.get(first.id);
      // The second DELETE found the row before the first one deleted it.
      jest.spyOn(store, 'findImage').mockResolvedValue(image ?? null);

      await handoffs.removeImage(token, first.id);
      await expect(handoffs.removeImage(token, first.id)).rejects.toBeInstanceOf(NotFoundException);

      expect(store.handoffs.get(handoffId)?.uploadCount).toBe(1);
    });

    it('does not show or remove a photo that a submission took', async () => {
      const { handoffs, store, root } = createImageServices();
      const { token } = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);
      const photo = await handoffs.upload(token, await jpegUpload());
      (store.images.get(photo.id) as { submissionId: number }).submissionId = 40;

      await expect(handoffs.openImage(token, photo.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(handoffs.removeImage(token, photo.id)).rejects.toBeInstanceOf(NotFoundException);

      expect(store.images.has(photo.id)).toBe(true);
      expect(listFiles(root)).toHaveLength(1);
    });

    it('keeps a photo that was attached between the check and the delete, and its slot', async () => {
      const { handoffs, store, root } = createImageServices();
      const { token, handoffId } = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);
      const photo = await handoffs.upload(token, await jpegUpload());
      const unattached = { ...(store.images.get(photo.id) as StoredFormImage) };
      jest.spyOn(store, 'findImage').mockResolvedValue(unattached);
      (store.images.get(photo.id) as { submissionId: number }).submissionId = 40;

      await expect(handoffs.removeImage(token, photo.id)).rejects.toBeInstanceOf(NotFoundException);

      expect(store.images.has(photo.id)).toBe(true);
      expect(listFiles(root)).toHaveLength(1);
      expect(store.handoffs.get(handoffId)?.uploadCount).toBe(1);
    });

    it('hands a photo stored under the old link while it was replaced over to the new link', async () => {
      const { handoffs, store } = createImageServices();
      const first = await handoffs.openForReader(handoffKey, FIELD_OPTIONS, undefined, T0);
      const old = store.handoffs.get(first.handoffId) as NonNullable<ReturnType<typeof store.handoffs.get>>;
      // An upload reserved its slot on the old link before it expired and stores its row after the first move.
      const move = store.moveHandoffImages.bind(store);
      let moves = 0;
      jest.spyOn(store, 'moveHandoffImages').mockImplementation(async (from, to) => {
        await move(from, to);
        moves += 1;
        if (moves === 1) {
          await store.insertImage({
            id: 'late-photo',
            formId: old.formId,
            fieldId: old.fieldId,
            userId: old.userId,
            uploadedByUserId: null,
            handoffId: old.id,
            mimeType: 'image/jpeg',
            size: 1,
            width: 1,
            height: 1,
            filename: 'late-photo.jpg',
          });
        }
      });

      const fresh = await handoffs.openForReader(handoffKey, FIELD_OPTIONS, first, later(FORM_IMAGE_HANDOFF_TTL_MS));

      expect(await handoffs.imageIds(fresh.handoffId)).toEqual(['late-photo']);
    });

    it('moves a photo still processing while the reader replaced the link over to the new link', async () => {
      const { handoffs, images, store } = createImageServices();
      const first = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);
      const save = images.save.bind(images);
      let fresh: Awaited<ReturnType<typeof handoffs.openForReader>> | undefined;
      jest.spyOn(images, 'save').mockImplementation(async (...args) => {
        fresh = await handoffs.openForReader(handoffKey, FIELD_OPTIONS, first, later(FORM_IMAGE_HANDOFF_TTL_MS));
        return save(...args);
      });

      const photo = await handoffs.upload(first.token, await jpegUpload());

      expect(await handoffs.imageIds(fresh?.handoffId as string)).toEqual([photo.id]);
      expect(store.handoffs.get(fresh?.handoffId as string)?.uploadCount).toBe(1);
    });

    it('gives a failed upload back to the link that replaced its own', async () => {
      const { handoffs, images, store } = createImageServices();
      const first = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);
      let fresh: Awaited<ReturnType<typeof handoffs.openForReader>> | undefined;
      jest.spyOn(images, 'save').mockImplementation(async () => {
        fresh = await handoffs.openForReader(handoffKey, FIELD_OPTIONS, first, later(FORM_IMAGE_HANDOFF_TTL_MS));
        throw new Error('not an image');
      });

      await expect(handoffs.upload(first.token, await jpegUpload())).rejects.toThrow('not an image');

      expect(store.handoffs.get(fresh?.handoffId as string)?.uploadCount).toBe(0);
    });

    it('ends only the links it is given', async () => {
      const { handoffs } = createImageServices();
      const mine = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);
      const newer = await handoffs.openForReader({ ...handoffKey, fieldId: handoffKey.fieldId + 1 }, FIELD_OPTIONS);

      await handoffs.endHandoffs([mine.handoffId]);

      await expect(handoffs.resolve(mine.token)).rejects.toBeInstanceOf(GoneException);
      await expect(handoffs.resolve(newer.token)).resolves.toBeDefined();
    });
  });

  it('reads the app URL once for the links of several polls', async () => {
    const { handoffs, settings } = createImageServices();
    const view = await handoffs.openForReader(handoffKey, FIELD_OPTIONS);
    await handoffs.openForReader(handoffKey, FIELD_OPTIONS, view);
    await handoffs.canIssue();

    expect(settings.getUrl).toHaveBeenCalledTimes(1);
  });
});

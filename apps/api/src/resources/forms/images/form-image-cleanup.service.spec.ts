import { FORM_IMAGE_ORPHAN_TTL_MS } from '@attraccess/application-models';
import {
  FIELD_ID,
  FORM_ID,
  RESOURCE_ID,
  USER_ID,
  createImageServices,
  handoffKey,
  jpegUpload,
  listFiles,
} from './form-images.test-fixture';
import { ResourceFormAction } from '@attraccess/application-models';

const where = { resourceId: RESOURCE_ID, action: ResourceFormAction.START, formId: FORM_ID, fieldId: FIELD_ID };
const HOUR = 60 * 60 * 1000;

describe('FormImageCleanupService', () => {
  it('deletes the file and row of images that stayed unattached for 24 hours', async () => {
    const { images, cleanup, store, root } = createImageServices();
    const old = await images.upload(await jpegUpload(), where, USER_ID);
    const fresh = await images.upload(await jpegUpload(), where, USER_ID);
    (store.images.get(old.id) as { createdAt: Date }).createdAt = new Date(
      Date.now() - FORM_IMAGE_ORPHAN_TTL_MS - HOUR,
    );

    const result = await cleanup.run();

    expect(result.images).toBe(1);
    expect(store.images.has(old.id)).toBe(false);
    expect(store.images.has(fresh.id)).toBe(true);
    expect(listFiles(root)).toEqual([store.images.get(fresh.id)?.filename]);
  });

  it('keeps old images that a submission references', async () => {
    const { images, cleanup, store, root } = createImageServices();
    const attached = await images.upload(await jpegUpload(), where, USER_ID);
    const record = store.images.get(attached.id) as { createdAt: Date; submissionId: number | null };
    record.createdAt = new Date(Date.now() - 10 * FORM_IMAGE_ORPHAN_TTL_MS);
    record.submissionId = 12;

    await cleanup.run();

    expect(store.images.has(attached.id)).toBe(true);
    expect(listFiles(root)).toHaveLength(1);
  });

  it('also sweeps images whose submission was deleted (the reference is reset to null)', async () => {
    const { images, cleanup, store } = createImageServices();
    const orphan = await images.upload(await jpegUpload(), where, USER_ID);
    const record = store.images.get(orphan.id) as { createdAt: Date; submissionId: number | null };
    record.createdAt = new Date(Date.now() - 3 * FORM_IMAGE_ORPHAN_TTL_MS);
    record.submissionId = null;

    await cleanup.run();

    expect(store.images.size).toBe(0);
  });

  it('drops handoffs that are long expired or ended, not the live ones', async () => {
    const { handoffs, cleanup, store } = createImageServices();
    const live = await handoffs.openForReader(handoffKey, { maxImages: 1 });
    const ended = await handoffs.openForReader({ ...handoffKey, readerId: 9 }, { maxImages: 1 });
    await handoffs.endForReader(9);
    (store.handoffs.get(ended.handoffId) as { endedAt: Date }).endedAt = new Date(Date.now() - 2 * HOUR);
    const expired = await handoffs.openForReader({ ...handoffKey, readerId: 10 }, { maxImages: 1 });
    (store.handoffs.get(expired.handoffId) as { expiresAt: Date }).expiresAt = new Date(Date.now() - 2 * HOUR);

    const result = await cleanup.run();

    expect(result.handoffs).toBe(2);
    expect([...store.handoffs.keys()]).toEqual([live.handoffId]);
  });

  it('keeps the row and file of an image a submission takes between finding and deleting the orphans', async () => {
    const { images, cleanup, store, root } = createImageServices();
    const racing = await images.upload(await jpegUpload(), where, USER_ID);
    const record = store.images.get(racing.id) as { createdAt: Date; submissionId: number | null };
    record.createdAt = new Date(Date.now() - FORM_IMAGE_ORPHAN_TTL_MS - HOUR);
    const find = store.findOrphanImages.bind(store);
    jest.spyOn(store, 'findOrphanImages').mockImplementation(async (before, limit) => {
      const found = (await find(before, limit)).map((image) => ({ ...image }));
      record.submissionId = 12;
      return found;
    });

    const result = await cleanup.run();

    expect(result.images).toBe(0);
    expect(store.images.has(racing.id)).toBe(true);
    expect(listFiles(root)).toEqual([store.images.get(racing.id)?.filename]);
  });

  it('removes the images of a deleted user right away, file included', async () => {
    const { images, cleanup, store, root } = createImageServices();
    const photo = await images.upload(await jpegUpload(), where, USER_ID);
    (store.images.get(photo.id) as { userId: number | null }).userId = null;

    expect((await cleanup.run()).images).toBe(1);

    expect(store.images.size).toBe(0);
    expect(listFiles(root)).toEqual([]);
  });

  it('keeps a long expired handoff while it holds unattached images an open attempt still needs', async () => {
    const { handoffs, cleanup, store } = createImageServices();
    const view = await handoffs.openForReader(handoffKey, { maxImages: 1 });
    await handoffs.upload(view.token, await jpegUpload());
    (store.handoffs.get(view.handoffId) as { expiresAt: Date }).expiresAt = new Date(Date.now() - 2 * HOUR);

    expect((await cleanup.run()).handoffs).toBe(0);

    expect(store.handoffs.has(view.handoffId)).toBe(true);
    expect(await handoffs.imageIds(view.handoffId)).toHaveLength(1);
  });

  it('does not throw from the schedule when the store fails', async () => {
    const { cleanup, store } = createImageServices();
    jest.spyOn(store, 'findOrphanImages').mockRejectedValue(new Error('db down'));
    await expect(cleanup.runScheduled()).resolves.toBeUndefined();
  });
});

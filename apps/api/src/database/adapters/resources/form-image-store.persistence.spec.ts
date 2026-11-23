import { randomUUID } from 'node:crypto';
import {
  Attractap,
  Form,
  FormField,
  FormImage,
  FormImageHandoff,
  FormSubmission,
  Resource,
  User,
} from '@attraccess/database-entities';
import {
  FormFieldType,
  ResourceFormAction,
  ResourceType,
  SupervisionMode,
  type UsageLifecycleAttempt,
} from '@attraccess/application-models';
import { FormImageUnavailableError } from '../../../resources/usage/usage-session-store.port';
import { createMigratedUsageDatabase, userRow } from '../usage/migrated-usage-database.test-fixture';
import { TypeOrmFormImageStore } from './form-image-store.adapter';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FormImageCleanupService } from '../../../resources/forms/images/form-image-cleanup.service';
import { FormImageFileStorage } from '../../../resources/forms/images/form-image-file-storage';

jest.setTimeout(60_000);

const HOUR = 60 * 60 * 1000;

describe('TypeOrmFormImageStore on real PostgreSQL (the migrated schema)', () => {
  let database: Awaited<ReturnType<typeof createMigratedUsageDatabase>>;
  let instance: Awaited<ReturnType<typeof database.connect>>;
  let store: TypeOrmFormImageStore;
  let formId: number;
  let fieldId: number;
  let readerId: number;
  let usageId: number;

  const newImage = (overrides: Partial<Parameters<TypeOrmFormImageStore['insertImage']>[0]> = {}) => ({
    id: randomUUID(),
    userId: 1,
    uploadedByUserId: 1,
    handoffId: null,
    formId,
    fieldId,
    mimeType: 'image/jpeg',
    size: 100,
    width: 640,
    height: 480,
    filename: `${randomUUID()}.jpg`,
    ...overrides,
  });
  const newHandoff = (overrides: Partial<Parameters<TypeOrmFormImageStore['insertHandoff']>[0]> = {}) => ({
    id: randomUUID(),
    tokenHash: randomUUID().replace(/-/g, '').padEnd(64, '0'),
    readerId,
    userId: 1,
    resourceId: 1,
    action: ResourceFormAction.START,
    formId,
    fieldId,
    maxImages: 2,
    uploadCount: 0,
    expiresAt: new Date(Date.now() + HOUR),
    ...overrides,
  });
  /** The stored handoff together with the token hash it was stored under (the record itself never carries it). */
  const insertHandoff = async (input: ReturnType<typeof newHandoff>) => ({
    ...(await store.insertHandoff(input)),
    tokenHash: input.tokenHash,
  });
  const submission = async (userId = 1) =>
    instance.source.getRepository(FormSubmission).save({
      formId,
      userId,
      resourceUsageId: usageId,
      action: ResourceFormAction.START,
      data: {},
    });

  beforeEach(async () => {
    database = await createMigratedUsageDatabase('form-images-');
    instance = await database.connect();
    store = new TypeOrmFormImageStore(instance.source);
    await instance.source.getRepository(User).save([1, 2].map((id) => userRow(id)));
    await instance.source.getRepository(Resource).save({
      id: 1,
      name: 'Laser',
      type: ResourceType.Machine,
      supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
    });
    formId = (
      await instance.source.getRepository(Form).save({
        name: 'Check-in',
        scope: 'resource',
        resourceId: 1,
        isRequiredOnResourceUsageStart: true,
        isRequiredOnResourceUsageTakeOver: false,
        isRequiredOnResourceUsageEnd: false,
      })
    ).id;
    fieldId = (
      await instance.source.getRepository(FormField).save({
        formId,
        name: 'Photo',
        type: FormFieldType.IMAGE,
        isRequired: true,
        description: null,
        options: { maxImages: 2 },
      })
    ).id;
    readerId = (await instance.source.getRepository(Attractap).save({ name: 'Reader' } as Attractap)).id;
    usageId = (
      await instance.unitOfWork.run(async (scope) => {
        const session = await instance.store.createPendingSession(
          {
            resourceId: 1,
            userId: 1,
            startNotes: undefined,
            startTime: new Date(),
            sessionDurationCreditsPerMinute: 0,
            operatingDurationCreditsPerMinute: 0,
            creditsPerUsage: 0,
            meterRates: [],
          },
          scope,
        );
        await instance.store.publishSession(session.id, scope);
        return session;
      })
    ).id;
  });

  afterEach(async () => {
    await database.close();
  });

  it('migrates the image field type: a field of type image can be stored', async () => {
    const field = await instance.source.getRepository(FormField).findOneByOrFail({ id: fieldId });
    expect(field.type).toBe('image');
  });

  describe('images', () => {
    it('stores and reads an image, and names the user of its submission', async () => {
      const image = await store.insertImage(newImage());
      expect(await store.findImage(image.id)).toMatchObject({ id: image.id, submissionId: null, width: 640 });
      expect(await store.findImageWithOwner(image.id)).toMatchObject({ submissionUserId: null });

      const saved = await submission(2);
      await instance.source.getRepository(FormImage).update({ id: image.id }, { submissionId: saved.id });

      expect(await store.findImageWithOwner(image.id)).toMatchObject({ submissionUserId: 2 });
      expect(await store.findImageWithOwner(randomUUID())).toBeNull();
    });

    it('finds the images of a list of ids and of a handoff, oldest first', async () => {
      const handoff = await insertHandoff(newHandoff());
      const first = await store.insertImage(newImage({ handoffId: handoff.id }));
      const second = await store.insertImage(newImage({ handoffId: handoff.id }));
      const unrelated = await store.insertImage(newImage());

      expect((await store.findImages([first.id, unrelated.id, randomUUID()])).map((item) => item.id).sort()).toEqual(
        [first.id, unrelated.id].sort(),
      );
      expect(await store.findImages([])).toEqual([]);
      expect((await store.listHandoffImages(handoff.id)).map((item) => item.id)).toEqual([first.id, second.id]);
    });

    it('keeps the image row, reset to unattached, when its submission is deleted, so the cleanup job can sweep it', async () => {
      const image = await store.insertImage(newImage());
      const saved = await submission();
      await instance.source.getRepository(FormImage).update({ id: image.id }, { submissionId: saved.id });

      await instance.source.getRepository(FormSubmission).delete({ id: saved.id });

      expect(await store.findImage(image.id)).toMatchObject({ submissionId: null });
    });

    it('keeps the images of a deleted user without a user, and the cleanup job removes them with their files', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'form-images-persistence-'));
      const files = new FormImageFileStorage({ get: () => ({ root }) } as never);
      const cleanup = new FormImageCleanupService(store, files);
      const handoff = await insertHandoff(newHandoff({ userId: 2 }));
      const image = await store.insertImage(newImage({ userId: 2, handoffId: handoff.id }));
      const kept = await store.insertImage(newImage());
      for (const item of [image, kept]) await files.write(item.filename, Buffer.from('jpeg'));

      await instance.source.getRepository(User).delete({ id: 2 });

      // The handoff goes with the user; the image row stays, belonging to nobody, until the cleanup job runs.
      expect(await store.findHandoffByTokenHash(handoff.tokenHash)).toBeNull();
      expect(await store.findImage(image.id)).toMatchObject({ userId: null, handoffId: null, submissionId: null });

      expect((await cleanup.run()).images).toBe(1);

      expect(await store.findImage(image.id)).toBeNull();
      expect(await store.findImage(kept.id)).not.toBeNull();
      expect(fs.readdirSync(path.join(root, 'form-images'))).toEqual([kept.filename]);
    });

    it('lists unattached images uploaded before a cut-off, and deletes only rows that are still unattached', async () => {
      const old = await store.insertImage(newImage());
      const racing = await store.insertImage(newImage());
      for (const id of [old.id, racing.id]) {
        await instance.source.getRepository(FormImage).update({ id }, { createdAt: new Date(Date.now() - 48 * HOUR) });
      }
      await store.insertImage(newImage());
      const attached = await store.insertImage(newImage());
      await instance.source
        .getRepository(FormImage)
        .update(
          { id: attached.id },
          { createdAt: new Date(Date.now() - 48 * HOUR), submissionId: (await submission()).id },
        );

      const orphans = await store.findOrphanImages(new Date(Date.now() - 24 * HOUR), 10);
      expect(orphans.map((item) => item.id).sort()).toEqual([old.id, racing.id].sort());

      // A submission takes one of them between the find and the delete.
      await instance.source
        .getRepository(FormImage)
        .update({ id: racing.id }, { submissionId: (await submission()).id });
      expect(await store.deleteOrphanImages(orphans.map((item) => item.id))).toEqual([old.filename]);
      expect(await store.deleteOrphanImages([])).toEqual([]);

      expect(await store.findImage(old.id)).toBeNull();
      expect(await store.findImage(racing.id)).not.toBeNull();
      expect(await store.findImage(attached.id)).not.toBeNull();
    });

    it('deletes one image only while it is unattached and, if asked, of the given handoff', async () => {
      const handoff = await insertHandoff(newHandoff());
      const image = await store.insertImage(newImage({ handoffId: handoff.id }));
      const attached = await store.insertImage(newImage({ handoffId: handoff.id }));
      await instance.source
        .getRepository(FormImage)
        .update({ id: attached.id }, { submissionId: (await submission()).id });

      expect(await store.deleteUnattachedImage(image.id, randomUUID())).toBe(false);
      expect(await store.deleteUnattachedImage(attached.id, handoff.id)).toBe(false);
      expect(await store.deleteUnattachedImage(image.id, handoff.id)).toBe(true);
      expect(await store.deleteUnattachedImage(image.id, handoff.id)).toBe(false);
      expect(await store.findImage(attached.id)).not.toBeNull();
    });

    it('counts the unattached images of a handoff and the recent unattached images of a user', async () => {
      const handoff = await insertHandoff(newHandoff());
      await store.insertImage(newImage({ handoffId: handoff.id }));
      const attached = await store.insertImage(newImage({ handoffId: handoff.id }));
      await instance.source
        .getRepository(FormImage)
        .update({ id: attached.id }, { submissionId: (await submission()).id });
      const old = await store.insertImage(newImage());
      await instance.source
        .getRepository(FormImage)
        .update({ id: old.id }, { createdAt: new Date(Date.now() - 48 * HOUR) });
      await store.insertImage(newImage({ userId: 2, uploadedByUserId: 2 }));

      expect(await store.countHandoffImages(handoff.id)).toBe(1);
      expect((await store.listHandoffImages(handoff.id)).map((item) => item.id)).not.toContain(attached.id);
      expect(await store.countUnattachedImages(1, new Date(Date.now() - 24 * HOUR))).toBe(1);
      expect(await store.countUnattachedImages(2, new Date(Date.now() - 24 * HOUR))).toBe(1);
    });
  });

  describe('handoffs', () => {
    it('finds a handoff by the hash of its token', async () => {
      const handoff = await insertHandoff(newHandoff());
      expect(await store.findHandoffByTokenHash(handoff.tokenHash)).toMatchObject({ id: handoff.id, endedAt: null });
      expect(await store.findHandoffByTokenHash('0'.repeat(64))).toBeNull();
    });

    it('refuses two handoffs with the same token hash', async () => {
      const first = await insertHandoff(newHandoff());
      await expect(insertHandoff(newHandoff({ tokenHash: first.tokenHash }))).rejects.toThrow();
    });

    it('finds the newest open handoff of an attempt, not an ended one', async () => {
      const key = { readerId, userId: 1, resourceId: 1, action: ResourceFormAction.START, formId, fieldId };
      const old = await insertHandoff(newHandoff());
      const newest = await insertHandoff(newHandoff());
      await instance.source.getRepository(FormImageHandoff).update({ id: old.id }, { createdAt: new Date(0) });

      expect((await store.findLatestHandoff(key))?.id).toBe(newest.id);
      await store.endHandoff(newest.id, new Date());
      expect((await store.findLatestHandoff(key))?.id).toBe(old.id);
      expect(await store.findLatestHandoff({ ...key, fieldId: fieldId + 1 })).toBeNull();
    });

    it('moves the unattached images to a successor handoff', async () => {
      const from = await insertHandoff(newHandoff());
      const to = await insertHandoff(newHandoff());
      const image = await store.insertImage(newImage({ handoffId: from.id }));
      const attached = await store.insertImage(newImage({ handoffId: from.id }));
      await instance.source
        .getRepository(FormImage)
        .update({ id: attached.id }, { submissionId: (await submission()).id });

      await store.moveHandoffImages(from.id, to.id);

      expect((await store.findImage(image.id))?.handoffId).toBe(to.id);
      expect((await store.findImage(attached.id))?.handoffId).toBe(from.id);
    });

    it('ends only the open handoffs it is given', async () => {
      const mine = await insertHandoff(newHandoff());
      const other = await insertHandoff(newHandoff());

      expect(await store.endHandoffsById([mine.id], new Date())).toBe(1);
      expect(await store.endHandoffsById([mine.id], new Date())).toBe(0);
      expect(await store.endHandoffsById([], new Date())).toBe(0);
      expect((await store.findHandoffByTokenHash(mine.tokenHash))?.endedAt).not.toBeNull();
      expect((await store.findHandoffByTokenHash(other.tokenHash))?.endedAt).toBeNull();
    });

    it('ends the open handoffs of a reader, all or of one resource and action', async () => {
      const start = await insertHandoff(newHandoff());
      const end = await insertHandoff(newHandoff({ action: ResourceFormAction.END }));
      const other = await insertHandoff(newHandoff({ resourceId: 2 }));

      expect(await store.endHandoffs(readerId, new Date(), { resourceId: 1, action: ResourceFormAction.START })).toBe(
        1,
      );
      expect((await store.findHandoffByTokenHash(start.tokenHash))?.endedAt).not.toBeNull();
      expect((await store.findHandoffByTokenHash(end.tokenHash))?.endedAt).toBeNull();
      expect(await store.endHandoffs(readerId, new Date())).toBe(2);
      expect((await store.findHandoffByTokenHash(other.tokenHash))?.endedAt).not.toBeNull();
      expect(await store.endHandoffs(readerId, new Date())).toBe(0);
    });

    it('reserves uploads atomically: never more than maxImages, even for concurrent requests', async () => {
      const handoff = await insertHandoff(newHandoff({ maxImages: 3 }));

      const results = await Promise.all(
        Array.from({ length: 10 }, () => store.reserveHandoffUpload(handoff.id, new Date())),
      );

      expect(results.filter(Boolean)).toHaveLength(3);
      expect((await store.findHandoffByTokenHash(handoff.tokenHash))?.uploadCount).toBe(3);
      await store.releaseHandoffUpload(handoff.id);
      expect(await store.reserveHandoffUpload(handoff.id, new Date())).toBe(true);
    });

    it('does not reserve on an expired or ended handoff', async () => {
      const expired = await insertHandoff(newHandoff({ expiresAt: new Date(Date.now() - 1000) }));
      const ended = await insertHandoff(newHandoff());
      await store.endHandoff(ended.id, new Date());

      expect(await store.reserveHandoffUpload(expired.id, new Date())).toBe(false);
      expect(await store.reserveHandoffUpload(ended.id, new Date())).toBe(false);
    });

    it('deletes handoffs that expired or ended before a cut-off, except those holding unattached images', async () => {
      const live = await insertHandoff(newHandoff());
      const expired = await insertHandoff(newHandoff({ expiresAt: new Date(Date.now() - 3 * HOUR) }));
      const ended = await insertHandoff(newHandoff());
      await store.endHandoff(ended.id, new Date(Date.now() - 3 * HOUR));
      const holding = await insertHandoff(newHandoff({ expiresAt: new Date(Date.now() - 3 * HOUR) }));
      const waiting = await store.insertImage(newImage({ handoffId: holding.id }));
      const submitted = await store.insertImage(newImage({ handoffId: expired.id }));
      await instance.source
        .getRepository(FormImage)
        .update({ id: submitted.id }, { submissionId: (await submission()).id });

      expect(await store.deleteStaleHandoffs(new Date(Date.now() - HOUR))).toBe(2);

      expect(await store.findHandoffByTokenHash(live.tokenHash)).not.toBeNull();
      expect(await store.findHandoffByTokenHash(expired.tokenHash)).toBeNull();
      // An open reader attempt still reads its answer through this handoff.
      expect(await store.findHandoffByTokenHash(holding.tokenHash)).not.toBeNull();
      expect(await store.findImage(waiting.id)).toMatchObject({ handoffId: holding.id });
      // A submitted image outlives its handoff.
      expect(await store.findImage(submitted.id)).toMatchObject({ handoffId: null });
    });
  });

  describe('attaching images when the submission is stored', () => {
    const imageDraft = (ids: string[], userId = 1): UsageLifecycleAttempt => ({
      id: randomUUID(),
      resourceId: 1,
      kind: 'start',
      candidateUsageId: usageId,
      previousUsageId: null,
      transitionTime: new Date(),
      billingItems: [],
      formSubmissions: [
        {
          formId,
          resourceUsageId: usageId,
          userId,
          action: ResourceFormAction.START,
          data: {
            [fieldId]: {
              value: JSON.stringify(ids),
              fieldDefinition: {
                id: fieldId,
                formId,
                name: 'Photo',
                type: FormFieldType.IMAGE,
                isRequired: true,
                description: null,
                position: 0,
                options: { maxImages: 2 },
              },
            },
          },
        },
      ],
    });
    const apply = (attempt: UsageLifecycleAttempt) =>
      instance.unitOfWork.run((scope) => instance.store.applyAttemptDrafts(attempt, scope));

    it('sets the submission on every image of the answer, in the same transaction', async () => {
      const a = await store.insertImage(newImage());
      const b = await store.insertImage(newImage());
      const untouched = await store.insertImage(newImage());

      await apply(imageDraft([a.id, b.id]));

      const saved = await instance.source.getRepository(FormSubmission).findOneByOrFail({ formId });
      expect((await store.findImage(a.id))?.submissionId).toBe(saved.id);
      expect((await store.findImage(b.id))?.submissionId).toBe(saved.id);
      expect((await store.findImage(untouched.id))?.submissionId).toBeNull();
    });

    it.each([
      ['another user', () => newImage({ userId: 2, uploadedByUserId: 2 })],
      ['an unknown id', () => null],
    ])('stops the whole change for an image of %s and stores no submission', async (_name, make) => {
      const mine = await store.insertImage(newImage());
      const bad = make();
      const badId = bad ? (await store.insertImage(bad)).id : randomUUID();

      await expect(apply(imageDraft([mine.id, badId]))).rejects.toBeInstanceOf(FormImageUnavailableError);

      expect(await instance.source.getRepository(FormSubmission).count({ where: { formId } })).toBe(0);
      expect((await store.findImage(mine.id))?.submissionId).toBeNull();
    });

    it('stops the change for an image that another submission already has', async () => {
      const image = await store.insertImage(newImage());
      await apply(imageDraft([image.id]));

      await expect(apply(imageDraft([image.id]))).rejects.toBeInstanceOf(FormImageUnavailableError);
    });
  });
});

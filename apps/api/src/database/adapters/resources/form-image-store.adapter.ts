import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, IsNull, LessThan } from 'typeorm';
import { FormImage, FormImageHandoff, FormSubmission } from '@attraccess/database-entities';
import type { FormImageHandoffRecord, FormImageRecord } from '@attraccess/application-models';
import type {
  FormImageHandoffKey,
  FormImageOwnership,
  FormImageStore,
  NewFormImage,
  NewFormImageHandoff,
} from '../../../resources/forms/images/form-image-store.port';

const toImageRecord = (row: FormImage): FormImageRecord => ({
  id: row.id,
  userId: row.userId,
  uploadedByUserId: row.uploadedByUserId,
  handoffId: row.handoffId,
  formId: row.formId,
  fieldId: row.fieldId,
  submissionId: row.submissionId,
  mimeType: row.mimeType,
  size: row.size,
  width: row.width,
  height: row.height,
  filename: row.filename,
  createdAt: row.createdAt,
});

const toHandoffRecord = (row: FormImageHandoff): FormImageHandoffRecord => ({
  id: row.id,
  readerId: row.readerId,
  userId: row.userId,
  resourceId: row.resourceId,
  action: row.action,
  formId: row.formId,
  fieldId: row.fieldId,
  maxImages: row.maxImages,
  uploadCount: row.uploadCount,
  expiresAt: row.expiresAt,
  endedAt: row.endedAt,
  createdAt: row.createdAt,
});

/** TypeORM implementation of the form image port. */
@Injectable()
export class TypeOrmFormImageStore implements FormImageStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private get images() {
    return this.dataSource.getRepository(FormImage);
  }

  private get handoffs() {
    return this.dataSource.getRepository(FormImageHandoff);
  }

  async insertImage(image: NewFormImage): Promise<FormImageRecord> {
    return toImageRecord(await this.images.save(this.images.create(image)));
  }

  async findImage(id: string): Promise<FormImageRecord | null> {
    const row = await this.images.findOneBy({ id });
    return row && toImageRecord(row);
  }

  async findImageWithOwner(id: string): Promise<FormImageOwnership | null> {
    const row = await this.images.findOneBy({ id });
    if (!row) return null;
    const submission = row.submissionId
      ? await this.dataSource.getRepository(FormSubmission).findOne({
          where: { id: row.submissionId },
          select: { id: true, userId: true },
        })
      : null;
    return { image: toImageRecord(row), submissionUserId: submission?.userId ?? null };
  }

  async findImages(ids: string[]): Promise<FormImageRecord[]> {
    if (!ids.length) return [];
    return (await this.images.findBy({ id: In(ids) })).map(toImageRecord);
  }

  async listHandoffImages(handoffId: string): Promise<FormImageRecord[]> {
    return (await this.images.find({ where: { handoffId }, order: { createdAt: 'ASC', id: 'ASC' } })).map(
      toImageRecord,
    );
  }

  async deleteImage(id: string): Promise<void> {
    await this.images.delete({ id });
  }

  async insertHandoff(handoff: NewFormImageHandoff): Promise<FormImageHandoffRecord> {
    return toHandoffRecord(await this.handoffs.save(this.handoffs.create({ ...handoff, endedAt: null })));
  }

  async findHandoffByTokenHash(tokenHash: string): Promise<FormImageHandoffRecord | null> {
    const row = await this.handoffs.findOneBy({ tokenHash });
    return row && toHandoffRecord(row);
  }

  async findLatestHandoff(key: FormImageHandoffKey): Promise<FormImageHandoffRecord | null> {
    const row = await this.handoffs.findOne({
      where: { ...key, endedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return row && toHandoffRecord(row);
  }

  async moveHandoffImages(fromHandoffId: string, toHandoffId: string): Promise<void> {
    await this.images.update({ handoffId: fromHandoffId }, { handoffId: toHandoffId });
  }

  async endHandoffs(
    readerId: number,
    now: Date,
    only?: { resourceId: number; action: FormImageHandoffRecord['action'] },
  ): Promise<number> {
    const result = await this.handoffs.update({ readerId, endedAt: IsNull(), ...(only ?? {}) }, { endedAt: now });
    return result.affected ?? 0;
  }

  async reserveHandoffUpload(handoffId: string, now: Date): Promise<boolean> {
    const result = await this.handoffs
      .createQueryBuilder()
      .update()
      .set({ uploadCount: () => '"uploadCount" + 1' })
      .where('"id" = :handoffId AND "endedAt" IS NULL AND "expiresAt" > :now AND "uploadCount" < "maxImages"', {
        handoffId,
        now,
      })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async releaseHandoffUpload(handoffId: string): Promise<void> {
    await this.handoffs
      .createQueryBuilder()
      .update()
      .set({ uploadCount: () => 'GREATEST("uploadCount" - 1, 0)' })
      .where('"id" = :handoffId', { handoffId })
      .execute();
  }

  async endHandoff(handoffId: string, now: Date): Promise<void> {
    await this.handoffs.update({ id: handoffId, endedAt: IsNull() }, { endedAt: now });
  }

  async findOrphanImages(uploadedBefore: Date, limit: number): Promise<FormImageRecord[]> {
    return (
      await this.images.find({
        where: { submissionId: IsNull(), createdAt: LessThan(uploadedBefore) },
        order: { createdAt: 'ASC' },
        take: limit,
      })
    ).map(toImageRecord);
  }

  async deleteImages(ids: string[]): Promise<void> {
    if (ids.length) await this.images.delete({ id: In(ids) });
  }

  async deleteStaleHandoffs(before: Date): Promise<number> {
    const result = await this.handoffs.delete([{ expiresAt: LessThan(before) }, { endedAt: LessThan(before) }]);
    return result.affected ?? 0;
  }
}

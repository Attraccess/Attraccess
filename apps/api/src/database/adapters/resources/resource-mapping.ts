import type { Resource } from '@attraccess/database-entities';
import type { ResourceRecord, UsageSession } from '@attraccess/application-models';
import { toGroupRecord, toIntroductionRecord } from './introduction-mappers';

/**
 * A resource row as a record. Embedded sessions stay the rows the database returned; the resource store maps them
 * with the usage mapper (this leaf module cannot, because the usage mapper maps a session's resource with it).
 */
export const toResourceRecord = (entity: Resource): ResourceRecord => {
  const record: ResourceRecord = {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    separateUnlockAndUnlatch: entity.separateUnlockAndUnlatch,
    accessOnly: entity.accessOnly,
    description: entity.description,
    imageFilename: entity.imageFilename,
    documentationType: entity.documentationType,
    documentationMarkdown: entity.documentationMarkdown,
    documentationUrl: entity.documentationUrl,
    metadata: entity.metadata,
    allowTakeOver: entity.allowTakeOver,
    maxParallelSessions: entity.maxParallelSessions,
    retrainingMaxAgeDays: entity.retrainingMaxAgeDays,
    retrainingMaxInactivityDays: entity.retrainingMaxInactivityDays,
    retrainingBlocksAccess: entity.retrainingBlocksAccess,
    supervisionMode: entity.supervisionMode,
    supervisedUsagesUntilIntroduction: entity.supervisedUsagesUntilIntroduction,
    autoIntroductionTarget: entity.autoIntroductionTarget,
    autoIntroductionGroupId: entity.autoIntroductionGroupId,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deletedAt: entity.deletedAt ?? null,
  };
  if (entity.groups !== undefined) record.groups = entity.groups.map(toGroupRecord);
  if (entity.introductions !== undefined) record.introductions = entity.introductions.map(toIntroductionRecord);
  if (entity.usages !== undefined) record.usages = entity.usages as unknown as UsageSession[];
  return record;
};

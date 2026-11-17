import type {
  IntroductionHistoryRecord,
  IntroductionRecord,
  ResourceGroupRecord,
} from '@attraccess/application-models';
import type {
  ResourceGroup,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
} from '@attraccess/database-entities';
import { toActorUser } from './maintenance-mappers';

export const toGroupRecord = (group: ResourceGroup): ResourceGroupRecord => ({
  id: group.id,
  name: group.name,
  description: group.description,
  retrainingMaxAgeDays: group.retrainingMaxAgeDays,
  retrainingMaxInactivityDays: group.retrainingMaxInactivityDays,
  retrainingBlocksAccess: group.retrainingBlocksAccess,
  isHidden: group.isHidden,
  createdAt: group.createdAt,
  updatedAt: group.updatedAt,
});

export const toHistoryRecord = (item: ResourceIntroductionHistoryItem): IntroductionHistoryRecord => {
  const record: IntroductionHistoryRecord = {
    id: item.id,
    introductionId: item.introductionId,
    action: item.action,
    performedByUserId: item.performedByUserId,
    comment: item.comment ?? null,
    createdAt: item.createdAt,
  };
  if (item.performedByUser !== undefined) record.performedByUser = toActorUser(item.performedByUser);
  return record;
};

export const toIntroductionRecord = (entity: ResourceIntroduction): IntroductionRecord => {
  const record: IntroductionRecord = {
    id: entity.id,
    resourceId: entity.resourceId ?? null,
    resourceGroupId: entity.resourceGroupId ?? null,
    receiverUserId: entity.receiverUserId,
    tutorUserId: entity.tutorUserId ?? null,
    completedAt: entity.completedAt,
    retrainingNotifiedAt: entity.retrainingNotifiedAt ?? null,
    retrainingRequiredAuditedAt: entity.retrainingRequiredAuditedAt ?? null,
    createdAt: entity.createdAt,
  };
  if (entity.receiverUser !== undefined) record.receiverUser = toActorUser(entity.receiverUser);
  if (entity.tutorUser !== undefined) record.tutorUser = toActorUser(entity.tutorUser);
  if (entity.history !== undefined) record.history = entity.history.map(toHistoryRecord);
  if (entity.resourceGroup !== undefined) {
    record.resourceGroup = entity.resourceGroup ? toGroupRecord(entity.resourceGroup) : null;
  }
  return record;
};

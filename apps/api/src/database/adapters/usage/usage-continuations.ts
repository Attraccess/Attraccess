import { ResourceUsage } from '@attraccess/database-entities';
import { ResourceUsageAction, type UsageSessionWithParties } from '@attraccess/application-models';
import { EntityManager, IsNull } from 'typeorm';
import type { ContinuationDraft } from '../../../resources/usage/usage-session-store.port';
import { toUsageSession } from './usage-session-mapping';

/** Inserts the pending continuation of a running session, as part of the caller's transaction. */
export async function createContinuation(
  manager: EntityManager,
  draft: ContinuationDraft,
): Promise<UsageSessionWithParties> {
  const previous = await manager.findOneOrFail(ResourceUsage, {
    where: { id: draft.previousUsageId, endTime: IsNull() },
  });
  const { identifiers } = await manager
    .createQueryBuilder()
    .insert()
    .into(ResourceUsage)
    .values({
      resourceId: previous.resourceId,
      userId: previous.userId,
      usageAction: ResourceUsageAction.Usage,
      startTime: draft.startTime,
      startNotes: null,
      endTime: null,
      endNotes: null,
      isFinalized: false,
      lifecyclePending: true,
      projectId: draft.projectId,
      previousUsageId: previous.id,
      projectSwitchCharging: draft.projectSwitchCharging,
      sessionStartTime: previous.sessionStartTime ?? previous.startTime,
      // Frozen when the session started, and kept for as long as it is continued.
      sessionDurationCreditsPerMinute: previous.sessionDurationCreditsPerMinute,
      operatingDurationCreditsPerMinute: previous.operatingDurationCreditsPerMinute,
      creditsPerUsage: previous.creditsPerUsage,
      billingFactor: previous.billingFactor,
      meterRates: previous.meterRates,
      supervisorUserId: previous.supervisorUserId,
      autoEndAt: previous.autoEndAt,
      maxAutoEndAt: previous.maxAutoEndAt,
      estimatedDurationMinutes: previous.estimatedDurationMinutes,
      autoEndWarnedOffsetMinutes: previous.autoEndWarnedOffsetMinutes,
    })
    .execute();
  const created = await manager.findOneOrFail(ResourceUsage, {
    where: { id: identifiers[0].id as number },
    relations: { resource: true, user: true, project: true },
  });
  return toUsageSession(created) as UsageSessionWithParties;
}

export async function inheritDeadline(manager: EntityManager, previousUsageId: number, usageId: number): Promise<void> {
  const previous = await manager.findOneOrFail(ResourceUsage, {
    where: { id: previousUsageId },
    select: {
      id: true,
      autoEndAt: true,
      maxAutoEndAt: true,
      estimatedDurationMinutes: true,
      autoEndWarnedOffsetMinutes: true,
    },
    // The lock an extension takes too: it either committed before this read or finds the part ended.
    lock: { mode: 'for_no_key_update' },
  });
  await manager.update(ResourceUsage, usageId, {
    autoEndAt: previous.autoEndAt,
    maxAutoEndAt: previous.maxAutoEndAt,
    estimatedDurationMinutes: previous.estimatedDurationMinutes,
    autoEndWarnedOffsetMinutes: previous.autoEndWarnedOffsetMinutes,
  });
}

/** The published part that continues this one; a pending switch's continuation is not one yet. */
export async function findContinuationId(manager: EntityManager, usageId: number): Promise<number | null> {
  const next = await manager.findOne(ResourceUsage, {
    where: { previousUsageId: usageId, lifecyclePending: false },
    select: { id: true },
  });
  return next?.id ?? null;
}

/**
 * The user's completed supervised sessions on the resources. A session whose project was switched is several
 * records but one session: only its last part counts.
 */
export function countCompletedSupervised(
  manager: EntityManager,
  resourceIds: number[],
  userId: number,
): Promise<number> {
  return manager
    .createQueryBuilder(ResourceUsage, 'usage')
    .where('usage.resourceId IN (:...resourceIds)', { resourceIds })
    .andWhere('usage.userId = :userId', { userId })
    .andWhere('usage.supervisorUserId IS NOT NULL')
    .andWhere('usage.endTime IS NOT NULL')
    .andWhere(
      'NOT EXISTS (SELECT 1 FROM "resource_usage" "next" WHERE "next"."previousUsageId" = "usage"."id" AND "next"."lifecyclePending" = false)',
    )
    .getCount();
}

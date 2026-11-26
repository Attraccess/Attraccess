import { ResourceMeteringSegment, ResourceMeteringSession, ResourceUsage } from '@attraccess/database-entities';
import { EntityManager, IsNull, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import type { SegmentWindowUsage } from '../../../resources/metering/metering-store.port';

/** Segment boundaries carry the device's observation time, which may run somewhat ahead of or behind ours. */
const BOUNDARY_SKEW_MS = 60_000;

/**
 * The segments of a meter a usage took part in, oldest first: closed and abandoned ones that ended during or after
 * the usage and began before it ended, and the open one. Bounded by the usage's time, so it does not read the
 * meter's whole history.
 */
export async function segmentsOfUsage(
  manager: EntityManager,
  meterId: number,
  usage: SegmentWindowUsage,
): Promise<ResourceMeteringSegment[]> {
  // Bounds are widened by the clock skew; segments of other sessions found that way are filtered out below.
  const ended = {
    meterId,
    endedAt: MoreThanOrEqual(new Date(usage.startTime.getTime() - BOUNDARY_SKEW_MS)),
    ...(usage.endTime ? { startedAt: LessThanOrEqual(new Date(usage.endTime.getTime() + BOUNDARY_SKEW_MS)) } : {}),
  };
  const segments = await manager.find(ResourceMeteringSegment, {
    where: [ended, { meterId, status: 'open' }],
    order: { startedAt: 'ASC' },
  });
  return segments.filter((segment) => segment.participants.some((participant) => participant.usageId === usage.id));
}

/** The usages of a resource that have not ended, published or not. */
export function openUsageRows(manager: EntityManager, resourceId: number): Promise<ResourceUsage[]> {
  return manager.find(ResourceUsage, { where: { resourceId, endTime: IsNull() } });
}

/**
 * Whether a usage of the resource started or ended since `requestedAt`, or a running one holds a metering session
 * of the meter: a reply for an idle collection must not cross such a boundary.
 */
export function usageBoundarySince(
  manager: EntityManager,
  resourceId: number,
  meterId: number,
  requestedAt: Date,
  runningUsageIds: number[],
): Promise<boolean> {
  return manager
    .createQueryBuilder(ResourceUsage, 'u')
    .leftJoin(ResourceMeteringSession, 's', 's.usageId = u.id AND s.meterId = :meterId', { meterId })
    .where('u.resourceId = :resourceId', { resourceId })
    .andWhere(
      '(u.startTime >= :requestedAt OR u.endTime >= :requestedAt OR (u.id IN (:...activeUsageIds) AND s.id IS NOT NULL))',
      { requestedAt, activeUsageIds: runningUsageIds.length ? runningUsageIds : [-1] },
    )
    .getExists();
}

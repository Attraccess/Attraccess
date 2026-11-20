import { ResourceOperatingInterval, ResourceUsage, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { EntityManager, IsNull } from 'typeorm';

/**
 * Completed usage timestamps and closed operating intervals are immutable in the
 * application. New rows, open rows, and lifecycle reservations therefore
 * describe every history change that can invalidate a duration calculation.
 * Schedule configuration, service-cycle baseline, and active maintenance must be
 * checked separately by the evaluator before accepting this fingerprint.
 */
export async function captureDurationState(resourceId: number, manager: EntityManager): Promise<string> {
  const usages = manager.getRepository(ResourceUsage);
  // One after the other: inside a transaction all reads share one connection, which runs one statement at a time.
  const latestUsage = await usages.findOne({ where: { resourceId }, order: { id: 'DESC' }, select: { id: true } });
  const mutableUsages = await usages.find({
    // Pending candidates are created open and then accepted or deleted; they
    // never become closed while pending. The indexed open-row lookup includes
    // them without scanning closed history for a redundant pending predicate.
    where: { resourceId, endTime: IsNull() },
    select: { id: true, startTime: true, endTime: true, lifecyclePending: true, usageAction: true },
    order: { id: 'ASC' },
  });
  const latestInterval = await manager.getRepository(ResourceOperatingInterval).findOne({
    where: { resourceId },
    order: { startTime: 'DESC', id: 'DESC' },
    select: { id: true, startTime: true, endTime: true },
  });
  const attempts = await manager.getRepository(ResourceUsageLifecycleAttempt).find({
    where: { resourceId },
    select: { id: true, previousUsageId: true, transitionTime: true, kind: true },
    order: { id: 'ASC' },
  });
  return JSON.stringify({ latestUsage, mutableUsages, latestInterval, attempts });
}

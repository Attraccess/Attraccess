import { ResourceMeteringSession } from '@attraccess/database-entities';
import { ProjectSwitchCharging, ResourceMeteringSessionStatus } from '@attraccess/application-models';
import { EntityManager, In } from 'typeorm';
import { clearPendingShareMarkers } from './metering-bill-queries';

/**
 * The consumption the earlier parts of `usageId`'s cumulatively rounded run settled on the meter at the rate: the
 * chain is walked back through `previousUsageId` while a part continues the one before it (`continue`), like the
 * billing ledger walks it for the minutes. 0 for a usage that rounds on its own.
 */
export async function continuedMeterConsumption(
  manager: EntityManager,
  usageId: number,
  meterId: number,
  creditsPerUnit: number,
): Promise<bigint> {
  const [row]: { consumed: string }[] = await manager.query(
    `WITH RECURSIVE "chain" AS (
       SELECT "id", "previousUsageId", "projectSwitchCharging", 0 AS "depth"
       FROM "resource_usage" WHERE "id" = $1
       UNION ALL
       SELECT "part"."id", "part"."previousUsageId", "part"."projectSwitchCharging", "chain"."depth" + 1
       FROM "resource_usage" "part"
       JOIN "chain" ON "part"."id" = "chain"."previousUsageId"
       WHERE "chain"."projectSwitchCharging" = $2
     )
     SELECT COALESCE(SUM("session"."consumedValue"::numeric), 0)::text AS "consumed"
     FROM "resource_metering_session" "session"
     JOIN "chain" ON "chain"."id" = "session"."usageId" AND "chain"."depth" > 0
     WHERE "session"."meterId" = $3 AND "session"."creditsPerUnit" = $4 AND "session"."status" = $5
       AND "session"."consumedValue" IS NOT NULL`,
    [usageId, ProjectSwitchCharging.CONTINUE, meterId, creditsPerUnit, ResourceMeteringSessionStatus.Settled],
  );
  return BigInt(row?.consumed ?? '0');
}

/** Waives a pending or failed session; null when it was neither (nothing changed). */
export async function waiveSessionRow(
  manager: EntityManager,
  resourceId: number,
  sessionId: string,
  at: Date,
): Promise<ResourceMeteringSession | null> {
  const result = await manager.update(
    ResourceMeteringSession,
    {
      id: sessionId,
      resourceId,
      status: In([ResourceMeteringSessionStatus.Pending, ResourceMeteringSessionStatus.Failed]),
    },
    { status: ResourceMeteringSessionStatus.Waived, settledAt: at },
  );
  if (!result.affected) return null;
  await clearPendingShareMarkers(manager, [sessionId]);
  return manager.findOneByOrFail(ResourceMeteringSession, { id: sessionId });
}

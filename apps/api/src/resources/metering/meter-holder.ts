import { EntityManager, In, IsNull, Not } from 'typeorm';
import {
  Resource,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { findActiveUsage, findActiveUsages, getSessionCapacity } from '../usage/sessions/active-usage';

/** The usage a meter's consumption belongs to and its open meter session, if it has one. */
export interface MeterHolder {
  usage: ResourceUsage | null;
  session: ResourceMeteringSession | null;
  /** The machine allows several parallel sessions; limit-1 rules apply otherwise. */
  shared: boolean;
}

/** Effective parallel session limit for metering. Doors and unknown resources behave like a limit of 1. */
export async function getMeteringSessionLimit(manager: EntityManager, resourceId: number): Promise<number> {
  const resource = await manager.findOne(Resource, {
    where: { id: resourceId },
    select: { id: true, type: true, maxParallelSessions: true },
  });
  return resource ? getSessionCapacity(resource, 0).maxParallelSessions : 1;
}

/**
 * Resolves who owns each meter. At limit 1 this is the active usage, exactly as before parallel sessions.
 * With parallel sessions (interim rule, ATT-1191) a meter belongs to the earliest published usage that still
 * holds an Active meter session for it: the session that claimed the meter while it was free, which is not
 * necessarily the earliest running one. Only when nobody holds it does the earliest active usage stand in.
 */
export async function findMeterHolders(
  manager: EntityManager,
  resourceId: number,
  meterIds: number[],
): Promise<Map<number, MeterHolder>> {
  const holders = new Map<number, MeterHolder>();
  if ((await getMeteringSessionLimit(manager, resourceId)) <= 1) {
    const usage = await findActiveUsage(manager, resourceId);
    const sessions =
      usage && meterIds.length
        ? await manager.find(ResourceMeteringSession, {
            where: {
              resourceId,
              usageId: usage.id,
              meterId: In(meterIds),
              status: ResourceMeteringSessionStatus.Active,
            },
          })
        : [];
    for (const meterId of meterIds)
      holders.set(meterId, {
        usage,
        session: sessions.find((session) => session.meterId === meterId) ?? null,
        shared: false,
      });
    return holders;
  }
  const usages = await findActiveUsages(manager, resourceId);
  const sessions =
    usages.length && meterIds.length
      ? await manager.find(ResourceMeteringSession, {
          where: {
            resourceId,
            usageId: In(usages.map((usage) => usage.id)),
            meterId: In(meterIds),
            status: ResourceMeteringSessionStatus.Active,
          },
        })
      : [];
  for (const meterId of meterIds) {
    // Usages are earliest first, so a duplicate claim resolves to the session that started first.
    const holder = usages
      .map((usage) => ({ usage, session: sessions.find((s) => s.meterId === meterId && s.usageId === usage.id) }))
      .find((entry) => entry.session);
    holders.set(meterId, {
      usage: holder?.usage ?? usages[0] ?? null,
      session: holder?.session ?? null,
      shared: true,
    });
  }
  return holders;
}

export async function findMeterHolder(
  manager: EntityManager,
  resourceId: number,
  meterId: number,
): Promise<MeterHolder> {
  return (await findMeterHolders(manager, resourceId, [meterId])).get(meterId) as MeterHolder;
}

/**
 * Whether a usage lifecycle in progress may change who owns the meter or what it has consumed.
 * At limit 1 any lifecycle does, as before. With parallel sessions only one touching the holder does, or,
 * while nobody holds the meter, a start that may claim it. Other people's lifecycles never block (D7).
 */
export async function isMeterLifecycleBusy(
  manager: EntityManager,
  resourceId: number,
  holder: MeterHolder,
  ownAttemptId?: string,
): Promise<boolean> {
  if (!holder.shared) return manager.existsBy(ResourceUsageLifecycleAttempt, { resourceId });
  const others = ownAttemptId ? { id: Not(ownAttemptId) } : {};
  if (holder.session && holder.usage) {
    return manager.exists(ResourceUsageLifecycleAttempt, {
      where: [
        { resourceId, ...others, candidateUsageId: holder.usage.id },
        { resourceId, ...others, previousUsageId: holder.usage.id },
      ],
    });
  }
  return manager.existsBy(ResourceUsageLifecycleAttempt, { resourceId, ...others, candidateUsageId: Not(IsNull()) });
}
